import requests
import pandas as pd
import os
from sqlalchemy import create_engine
from pull_outdoor_weather import pull_outdoor_weather
from dotenv import load_dotenv

load_dotenv()

def fetch_and_upload_daily():
    print("Starting daily sync routine...")
    supabase_db_url = os.environ.get("SUPABASE_DB_URL")
    if not supabase_db_url:
        print("Error: No SUPABASE_DB_URL provided.")
        return
        
    if supabase_db_url.startswith("postgres://"):
        supabase_db_url = supabase_db_url.replace("postgres://", "postgresql://", 1)
        
    print("Connecting to Supabase...")
    engine = create_engine(supabase_db_url)
    
    # Check max time in DB
    try:
        max_time_df = pd.read_sql("SELECT MAX(time) as max_time FROM sensor_metrics", engine)
        max_time = max_time_df['max_time'].iloc[0]
    except Exception as e:
        print(f"Error checking max time: {e}")
        max_time = None
        
    print(f"Latest timestamp in DB: {max_time}")

    print("Fetching Verdify manifest...")
    base_url = "https://lab.verdify.ai"
    manifest_url = f"{base_url}/static/data/hourly-performance/manifest.json"
    
    try:
        response = requests.get(manifest_url)
        response.raise_for_status()
        manifest = response.json()
    except Exception as e:
        print(f"Error fetching manifest: {e}")
        return
        
    archives = manifest.get('archives', [])
    if not archives:
        print("No archives found in manifest.")
        return
        
    archives.sort(key=lambda x: x['modified_at']) # Sort oldest to newest for chronological insert
    
    all_new_data = []
    
    for archive in archives:
        file_url = f"{base_url}{archive['url']}"
        print(f"Downloading archive: {archive['file']}")
        
        try:
            df = pd.read_csv(file_url, storage_options={'User-Agent': 'Mozilla/5.0'})
        except Exception as e:
            print(f"Error downloading {archive['file']}: {e}")
            continue
            
        df['hour_start_utc'] = pd.to_datetime(df['hour_start_utc'], utc=True)
        
        if max_time is not None and not pd.isna(max_time):
            # max_time might not have timezone info depending on pandas version/driver, ensure utc
            if max_time.tzinfo is None:
                max_time = max_time.tz_localize('UTC')
            new_data = df[df['hour_start_utc'] > max_time].copy()
        else:
            new_data = df.copy()
            
        if not new_data.empty:
            all_new_data.append(new_data)
            
    if not all_new_data:
        print("No new data to upload from any archive. System is already up to date.")
        
        # Still need to sync outdoor weather even if sensor data is up to date
        try:
            print("Starting outdoor weather sync...")
            pull_outdoor_weather(days_to_pull=30)
        except Exception as e:
            print(f"Error syncing outdoor weather: {e}")
            
        return
        
    combined_new_data = pd.concat(all_new_data, ignore_index=True)
    print(f"Found {len(combined_new_data)} total new records across all archives. Processing...")
    
    combined_new_data.rename(columns={
        'hour_start_utc': 'time',
        'temp_avg_f': 'temperature',
        'vpd_avg_kpa': 'vpd'
    }, inplace=True)
    
    if 'sensor_id' not in combined_new_data.columns:
        combined_new_data['sensor_id'] = 'GH_VERDIFY'
        
    import numpy as np
    
    # Calculate Humidity using Tetens formula:
    tc = (combined_new_data['temperature'] - 32) * 5.0 / 9.0
    es = 0.61078 * np.exp((17.27 * tc) / (tc + 237.3))
    combined_new_data['humidity'] = (1 - (combined_new_data['vpd'] / es)) * 100

    # Keep only the columns that exist in the database table
    columns_to_keep = ['time', 'sensor_id', 'temperature', 'vpd', 'humidity']
    combined_new_data = combined_new_data[[c for c in columns_to_keep if c in combined_new_data.columns]]
        
    print("Uploading to Supabase...")
    try:
        combined_new_data.to_sql('sensor_metrics', engine, if_exists='append', index=False, chunksize=500)
        print("✅ Daily Supabase sync complete!")
    except Exception as e:
        print(f"Database error: {e}")
        
    # Also sync outdoor weather data for the map!
    try:
        print("Starting outdoor weather sync...")
        pull_outdoor_weather(days_to_pull=30)
    except Exception as e:
        print(f"Error syncing outdoor weather: {e}")

if __name__ == "__main__":
    import time
    while True:
        fetch_and_upload_daily()
        print("Sleeping for 24 hours...")
        time.sleep(86400)
