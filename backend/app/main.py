from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import os
import sys
from collections import deque
from aiokafka import AIOKafkaConsumer

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
from app.vision import get_verdify_vision_data, analyze_camera_feed, diagnose_leaf_image
from app.scada import get_scada_telemetry

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
TOPIC_NAME = "raw-sensor-data"

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
        ml_payload['outdoor_temp'] = outdoor_data.get('temperature_c', 0)
        ml_payload['outdoor_hum'] = outdoor_data.get('humidity', 0)
        ml_payload['solar'] = outdoor_data.get('solar_irradiance_w_m2', 0)
        ml_payload['wind_speed'] = outdoor_data.get('wind_speed_kmh', 0)
    else:
        ml_payload['outdoor_temp'] = 0
        ml_payload['outdoor_hum'] = 0
        ml_payload['solar'] = 0
        ml_payload['wind_speed'] = 0

    sensor_buffer.append(ml_payload)
    
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

@app.get("/api/ml/predict_today")
async def api_ml_predict_today():
    if model is None or not preprocessor.is_fitted:
        return {"status": "error", "message": "Model not loaded"}
        
    try:
        data = await get_historical_data(hours=24)
        if not data:
            return {"status": "error", "message": "No historical data found"}
            
        outdoor_data = await get_latest_outdoor_weather()
        outdoor_temp = outdoor_data.get('temperature_c', 0) if outdoor_data else 0
        outdoor_hum = outdoor_data.get('humidity', 0) if outdoor_data else 0
        solar = outdoor_data.get('solar_irradiance_w_m2', 0) if outdoor_data else 0
        wind_speed = outdoor_data.get('wind_speed_kmh', 0) if outdoor_data else 0

        ml_buffer = []
        for row in data:
            ml_buffer.append({
                'indoor_temp': row.get('temp', 0),
                'indoor_hum': row.get('hum', 0),
                'indoor_vpd': row.get('vpd', 0),
                'outdoor_temp': outdoor_temp,
                'outdoor_hum': outdoor_hum,
                'solar': solar,
                'wind_speed': wind_speed
            })
            
        while len(ml_buffer) < 24:
            ml_buffer.insert(0, ml_buffer[0])
            
        ml_buffer = ml_buffer[-24:]
        
        tensor_input = preprocessor.transform_inference(ml_buffer)
        if tensor_input is not None:
            with torch.no_grad():
                inputs = torch.tensor(tensor_input, dtype=torch.float32)
                outputs = model(inputs)
                ai_risk_score = torch.sigmoid(outputs).item()
                is_high_risk = ai_risk_score > 0.5
                
                return {
                    "status": "success",
                    "risk_probability": ai_risk_score,
                    "is_high_risk": is_high_risk
                }
        return {"status": "error", "message": "Failed to transform input"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/ml/predict_date")
async def api_ml_predict_date(date: str):
    if model is None or not preprocessor.is_fitted:
        return {"status": "error", "message": "Model not loaded"}
        
    try:
        from app.db import pool
        import datetime
        parsed_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
        
        # Query 24 hours of data ending at the end of the given date
        query = '''
            SELECT 
                time,
                temperature as temp,
                humidity as hum,
                vpd
            FROM sensor_metrics
            WHERE DATE(time AT TIME ZONE 'UTC') <= $1::DATE
            ORDER BY time DESC
            LIMIT 24
        '''
        
        async with pool.acquire() as conn:
            records = await conn.fetch(query, parsed_date)
            
        if not records:
            return {"status": "error", "message": "No data found for this date"}
            
        data = [dict(r) for r in reversed(records)]
        
        outdoor_data = await get_latest_outdoor_weather()
        outdoor_temp = outdoor_data.get('temperature_c', 0) if outdoor_data else 0
        outdoor_hum = outdoor_data.get('humidity', 0) if outdoor_data else 0
        solar = outdoor_data.get('solar_irradiance_w_m2', 0) if outdoor_data else 0
        wind_speed = outdoor_data.get('wind_speed_kmh', 0) if outdoor_data else 0

        ml_buffer = []
        for row in data:
            ml_buffer.append({
                'indoor_temp': row.get('temp', 0),
                'indoor_hum': row.get('hum', 0),
                'indoor_vpd': row.get('vpd', 0),
                'outdoor_temp': outdoor_temp,
                'outdoor_hum': outdoor_hum,
                'solar': solar,
                'wind_speed': wind_speed
            })
            
        while len(ml_buffer) < 24:
            ml_buffer.insert(0, ml_buffer[0])
            
        ml_buffer = ml_buffer[-24:]
        
        tensor_input = preprocessor.transform_inference(ml_buffer)
        if tensor_input is not None:
            with torch.no_grad():
                inputs = torch.tensor(tensor_input, dtype=torch.float32)
                outputs = model(inputs)
                ai_risk_score = torch.sigmoid(outputs).item()
                is_high_risk = ai_risk_score > 0.5
                
                return {
                    "status": "success",
                    "risk_probability": ai_risk_score,
                    "is_high_risk": is_high_risk
                }
        return {"status": "error", "message": "Failed to transform input"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.on_event("startup")
async def startup_event():
    await init_db()

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

@app.get("/api/conditions/latest")
async def api_latest_conditions():
    from app.db import get_latest_data
    data = await get_latest_data()
    return {"data": data}

@app.get("/api/conditions/date")
async def api_conditions_by_date(date: str):
    from app.db import get_daily_average
    data = await get_daily_average(date)
    return {"data": data}

@app.get("/api/trends/date")
async def api_trends_by_date(date: str):
    from app.db import get_daily_trends
    data = await get_daily_trends(date)
    return {"data": data}

@app.get("/api/weather/latest")
async def api_latest_weather():
    from app.db import get_latest_outdoor_weather
    data = await get_latest_outdoor_weather()
    return {"data": data}

@app.post("/api/train/start")
async def api_train_start():
    if not HAS_ML:
        return {"status": "error", "message": "ML modules not installed"}
    # Start the training task in the background
    asyncio.create_task(run_training_task(broadcast_message))
    return {"status": "training_started"}

@app.post("/api/test/load")
async def api_test_load():
    import paho.mqtt.publish as publish
    # Publish 1000 fast messages to MQTT
    try:
        msgs = []
        for i in range(1000):
            payload = json.dumps({
                "timestamp": f"2027-01-01T00:00:{i%60:02d}Z",
                "sensor_id": "STRESS_TEST",
                "temperature": 75.0,
                "humidity": 60.0,
                "co2_ppm": 800,
                "vpd": 1.0,
                "dew_point": 65.0,
                "leaf_wetness": 0.5,
                # Include original required fields for preprocessor
                "temp_avg_f": 75.0,
                "vpd_avg_kpa": 1.0,
                "temp_control_f": 75.0,
                "runtime_fan1_min": 0,
                "runtime_fan2_min": 0,
                "runtime_heat1_min": 0,
                "runtime_vent_min": 0,
                "runtime_fog_min": 0
            })
            msgs.append(("sensors/telemetry", payload, 0, False))
        
        # Publish multiple
        mqtt_broker = os.getenv("MQTT_BROKER", "mosquitto")
        publish.multiple(msgs, hostname=mqtt_broker, port=1883)
        return {"status": "success", "messages_sent": 1000}
    except Exception as e:
        return {"status": "error", "message": str(e)}

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

@app.get("/api/vision/camera-analysis")
async def api_vision_camera_analysis():
    return analyze_camera_feed()

@app.post("/api/vision/inspect-leaf")
async def api_vision_inspect_leaf(file: UploadFile = File(...)):
    contents = await file.read()
    return diagnose_leaf_image(contents)

# --- INDUSTRIAL SCADA & EQUIPMENT TELEMETRY ENDPOINT ---
@app.get("/api/monitoring/scada")
async def api_monitoring_scada():
    return get_scada_telemetry()
