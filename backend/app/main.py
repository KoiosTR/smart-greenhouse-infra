from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import asyncio
import json
import os
import sys
from collections import deque

try:
    import torch
    # Add app folder to path to import ml modules easily
    sys.path.append(os.path.dirname(__file__))
    from ml.preprocessing import TimeSeriesPreprocessor
    from ml.model import HybridGreenhouseAI
    from ml.train_runner import run_training_task
    HAS_ML = True
except ImportError:
    HAS_ML = False
    print("PyTorch or ML modules not installed. Running without ML features.")
from app.db import init_db, close_db, insert_metrics, get_historical_data, get_latest_outdoor_weather
from app.vision import get_verdify_vision_data, diagnose_leaf_image
from app.scada import get_scada_telemetry
from app import grafana_data as gd

app = FastAPI()

@app.exception_handler(ValueError)
async def value_error_handler(request, exc):
    return JSONResponse(status_code=400, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Globals
connected_clients = set()
sensor_buffer = deque(maxlen=24)

# Load AI Model
MODEL_PATH = os.path.join(os.path.dirname(__file__), "ml", "greenhouse_ai_model.pth")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "ml", "scaler.pkl")

preprocessor = None
model = None

if HAS_ML:
    # Initialize Preprocessor (it will load the scaler inside)
    preprocessor = TimeSeriesPreprocessor(window_size=24, forecast_horizon=6)

    # Initialize Model Structure
    try:
        model = HybridGreenhouseAI(num_features=7, hidden_size=64, num_layers=2, dropout=0.3)
        if os.path.exists(MODEL_PATH):
            model.load_state_dict(torch.load(MODEL_PATH, map_location=torch.device('cpu')))
            model.eval()
            print("AI Model loaded successfully.")
        else:
            print(f"Warning: Model file not found at {MODEL_PATH}")
    except Exception as e:
        print(f"Error loading model: {e}")
        model = None

    # Preload scaler manually to fail fast if missing
    if not preprocessor.load_scaler(SCALER_PATH):
        print(f"Warning: Scaler not found at {SCALER_PATH}")


@app.post("/api/telemetry")
async def api_telemetry(payload: dict):
    # Map keys for AI Preprocessor to match feature_names
    ml_payload = dict(payload)
    ml_payload['indoor_temp'] = payload.get('temperature', 0)
    ml_payload['indoor_hum'] = payload.get('humidity', 0)
    ml_payload['indoor_vpd'] = payload.get('vpd', 0)
    
    # Fetch latest outdoor weather for AI features
    outdoor_data = await get_latest_outdoor_weather()
    if outdoor_data:
        ml_payload['outdoor_temp'] = outdoor_data['temperature_c']
        ml_payload['outdoor_hum'] = outdoor_data['humidity']
        ml_payload['solar'] = outdoor_data['solar_irradiance_w_m2']
        ml_payload['wind_speed'] = outdoor_data['wind_speed_kmh']
        sensor_buffer.append(ml_payload)  # no real outdoor data -> no ML sample

    # Broadcast raw sensor data to UI
    await broadcast_message({"type": "sensor_update", "data": payload})
    
    # Default risk values
    ai_risk_score = None
    is_high_risk = None
    
    # Run AI Inference if buffer is full
    if len(sensor_buffer) == 24 and model is not None and preprocessor.is_fitted:
        try:
            tensor_input = preprocessor.transform_inference(list(sensor_buffer))
            if tensor_input is not None:
                with torch.no_grad():
                    inputs = torch.tensor(tensor_input, dtype=torch.float32)
                    outputs = model(inputs)
                    ai_risk_score = torch.sigmoid(outputs).item()
                    is_high_risk = ai_risk_score > 0.5
                    
                    # Broadcast AI Prediction
                    await broadcast_message({
                        "type": "ai_prediction",
                        "risk_probability": ai_risk_score,
                        "is_high_risk": is_high_risk
                    })
        except Exception as e:
            print(f"AI Inference Error: {e}")
            
    # Save to TimescaleDB
    try:
        await insert_metrics(payload, ai_risk_score, is_high_risk)
    except Exception as e:
        print(f"Database Insert Error: {e}")
        
    return {"status": "success"}

async def broadcast_message(message: dict):
    if not connected_clients:
        return
    
    dead_clients = set()
    msg_str = json.dumps(message)
    for client in connected_clients:
        try:
            await client.send_text(msg_str)
        except Exception:
            dead_clients.add(client)
            
    for client in dead_clients:
        connected_clients.remove(client)

# Risk: Grafana saatlik verisiyle 6 saat sonrası VPD tahmini + eşik kuralı (app/ml/forecast.py)
async def _forecast(end_date=None):
    from app.ml import forecast
    try:
        return {"status": "success", **await asyncio.to_thread(forecast.predict, end_date)}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/ml/predict_today")
async def api_ml_predict_today():
    return await _forecast()

@app.get("/api/ml/predict_date")
async def api_ml_predict_date(date: str):
    return await _forecast(date)

@app.on_event("startup")
async def startup_event():
    await init_db()
    from app.backfill import safe_backfill
    asyncio.create_task(safe_backfill())  # eksik saatleri Grafana'dan arka planda tamamla

@app.on_event("shutdown")
async def shutdown_event():
    await close_db()

@app.get("/")
def read_root():
    return {"message": "Greenhouse AI API is running."}

@app.get("/api/analytics/historical")
async def api_historical_data():
    data = await get_historical_data(hours=24)
    return {"data": data}

# --- Gerçek veri: Verdify Grafana (verdify-tsdb); erişilemezse yerel TimescaleDB (saatlik arşiv) ---
@app.get("/api/conditions/latest")
async def api_latest_conditions():
    from app.db import get_latest_data
    from app import public_data as pdata
    data = await asyncio.to_thread(pdata.latest_conditions) or await get_latest_data()
    return {"data": data}

@app.post("/api/sync/refresh")
async def api_sync_refresh():
    """Arayüz açıldığında çağrılır: eksik saatleri arka planda tamamlar (10 dk'da bir)."""
    from app.backfill import safe_backfill
    asyncio.create_task(safe_backfill())
    return {"status": "started"}

@app.get("/api/conditions/date")
async def api_conditions_by_date(date: str):
    from app.db import get_daily_average
    data = await asyncio.to_thread(gd.daily_conditions, date) or await get_daily_average(date)
    return {"data": data}

@app.get("/api/trends/date")
async def api_trends_by_date(date: str):
    from app.db import get_daily_trends
    data = await asyncio.to_thread(gd.daily_trends, date) or await get_daily_trends(date)
    return {"data": data}

@app.get("/api/weather/latest")
async def api_latest_weather():
    from app.db import get_latest_outdoor_weather
    from app import public_data as pdata
    data = await asyncio.to_thread(pdata.weather_latest) or await get_latest_outdoor_weather()
    return {"data": data}

@app.get("/api/weather/solar-trend")
async def api_solar_trend(range: str = "day"):
    from app import public_data as pdata
    return {"data": await asyncio.to_thread(pdata.solar_trend, range)}

@app.get("/api/weather/dew-trend")
async def api_dew_trend():
    from app import public_data as pdata
    return {"data": await asyncio.to_thread(pdata.dew_trend)}

@app.get("/api/monitoring/charts")
async def api_monitoring_charts(days: int = 7):
    from app import public_data as pdata
    return {"data": await asyncio.to_thread(pdata.monitoring_charts, days)}

@app.get("/api/monitoring/kpi")
async def api_monitoring_kpi():
    from app import public_data as pdata
    return {"data": await asyncio.to_thread(pdata.kpi_24h)}

@app.get("/api/energy/day")
async def api_energy_day(date: str):
    return {"data": await asyncio.to_thread(gd.energy_day, date)}

@app.post("/api/train/start")
async def api_train_start():
    if not HAS_ML:
        return {"status": "error", "message": "ML modules not installed"}
    # Start the training task in the background
    asyncio.create_task(run_training_task(broadcast_message))
    return {"status": "training_started"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.remove(websocket)

# --- COMPUTER VISION & CROP DIAGNOSTICS ENDPOINTS ---
@app.get("/api/vision/crop-health")
async def api_vision_crop_health():
    return get_verdify_vision_data()

@app.post("/api/vision/inspect-leaf")
async def api_vision_inspect_leaf(file: UploadFile = File(...)):
    contents = await file.read()
    return diagnose_leaf_image(contents)

# --- INDUSTRIAL SCADA & EQUIPMENT TELEMETRY ENDPOINT ---
@app.get("/api/monitoring/scada")
async def api_monitoring_scada():
    return get_scada_telemetry()
