import requests
import json
import pandas as pd
from sqlalchemy import create_engine
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

GRAFANA_URL = "https://graphs.verdify.ai/api/ds/query"
HEADERS = {'User-Agent': 'Mozilla/5.0'}

def pull_outdoor_weather(days_to_pull=30):
    print(f"Grafana'dan son {days_to_pull} gunluk dis ortam (outdoor) hava durumu verisi cekiliyor...")
    
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(days=days_to_pull)
    
    end_ms = int(end_time.timestamp() * 1000)
    start_ms = int(start_time.timestamp() * 1000)
    
    # Sadece dis ortami ve ruzgar/yagis verilerini aliyoruz
    columns = [
        "ts AS time", 
        "outdoor_temp_f", 
        "outdoor_rh_pct AS humidity", 
        "wind_speed_mph", 
        "wind_direction_deg",
        "precip_in",
        "solar_irradiance_w_m2",
        "co2_ppm"
    ]
    
    sql_query = f"SELECT {', '.join(columns)} FROM climate WHERE ts >= to_timestamp({start_ms / 1000}) AND ts <= to_timestamp({end_ms / 1000}) AND outdoor_temp_f IS NOT NULL ORDER BY ts ASC"
    
    payload = {
        "queries": [
            {
                "datasource": {"uid": "verdify-tsdb", "type": "grafana-postgresql-datasource"},
                "rawSql": sql_query,
                "format": "table",
                "refId": "A"
            }
        ],
        "from": str(start_ms),
        "to": str(end_ms)
    }

    try:
        response = requests.post(GRAFANA_URL, json=payload, headers=HEADERS)
        data = response.json()
        frames = data.get("results", {}).get("A", {}).get("frames", [])
        
        if not frames:
            print("Veri bulunamadi.")
            return
            
        schema_fields = frames[0].get("schema", {}).get("fields", [])
        column_names = [f["name"] for f in schema_fields]
        values = frames[0].get("data", {}).get("values", [])
        
        transposed_values = list(map(list, zip(*values)))
        df = pd.DataFrame(transposed_values, columns=column_names)
        
        # Datetime cevirisi
        df['time'] = pd.to_datetime(df['time'], unit='ms')
        
        # MUHTESEM DONUSUMLER (Attiginiz tasarima tam uyumlu olmasi icin)
        # 1. Fahrenheit -> Celsius (Sicaklik)
        df['temperature_c'] = (df['outdoor_temp_f'] - 32) * 5.0 / 9.0
        
        # 2. MPH -> km/h (Ruzgar Hizi)
        df['wind_speed_kmh'] = df['wind_speed_mph'] * 1.60934
        
        # 3. Inches -> mm (Yagis Miktari)
        df['rainfall_mm'] = df['precip_in'] * 25.4
        
        # Gereksiz kolonlari at
        df = df.drop(columns=['outdoor_temp_f', 'wind_speed_mph', 'precip_in'])
        
        # Supabase'e yukle
        print(f"Toplam {len(df)} dis mekan verisi donusturuldu. Supabase'e (outdoor_weather_data) baglaniliyor...")
        db_url = os.environ.get('SUPABASE_DB_URL').replace('postgres://', 'postgresql://')
        engine = create_engine(db_url)
        
        df.to_sql('outdoor_weather_data', engine, if_exists='replace', index=False, chunksize=1000)
        print("Basarili! Yeni dis mekan tablosu (outdoor_weather_data) Supabase uzerinde olusturuldu ve dolduruldu.")
        
    except Exception as e:
        print(f"Hata olustu: {e}")

if __name__ == "__main__":
    pull_outdoor_weather(days_to_pull=30)
