import asyncpg
import os
import datetime
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DB_URL", "postgresql://admin:secret@timescaledb:5432/greenhousedb")
pool = None

async def init_db():
    global pool
    print(f"Connecting to database at {DB_URL}")
    pool = await asyncpg.create_pool(DB_URL)
    
    async with pool.acquire() as conn:
        # Create table with Roadmap Phase 3.2 Schema + AI results
        await conn.execute('''
            CREATE TABLE IF NOT EXISTS sensor_metrics (
                time TIMESTAMPTZ NOT NULL,
                sensor_id VARCHAR(50) NOT NULL,
                temperature DOUBLE PRECISION,
                humidity DOUBLE PRECISION,
                co2_ppm INTEGER,
                vpd DOUBLE PRECISION,
                dew_point DOUBLE PRECISION,
                leaf_wetness DOUBLE PRECISION,
                ai_risk_score DOUBLE PRECISION,
                is_high_risk BOOLEAN
            );
        ''')
        print("Table sensor_metrics initialized.")

async def close_db():
    global pool
    if pool:
        await pool.close()

async def insert_metrics(data_dict: dict, ai_risk_score: float = None, is_high_risk: bool = None):
    if pool is None:
        return
        
    try:
        # Parsing timestamp if string
        time_val = data_dict.get('timestamp')
        if isinstance(time_val, str):
            time_val = datetime.datetime.fromisoformat(time_val.replace('Z', '+00:00'))
        elif not time_val:
            time_val = datetime.datetime.now(datetime.timezone.utc)
            
        async with pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO sensor_metrics (time, sensor_id, temperature, humidity, co2_ppm, vpd, dew_point, leaf_wetness, ai_risk_score, is_high_risk)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ''', 
            time_val,
            data_dict.get('sensor_id', 'UNKNOWN'),
            float(data_dict.get('temperature', 0)),
            float(data_dict.get('humidity', 0)),
            int(data_dict.get('co2_ppm', 0)),
            float(data_dict.get('vpd', 0)),
            float(data_dict.get('dew_point', 0)),
            float(data_dict.get('leaf_wetness', 0)),
            ai_risk_score, 
            is_high_risk)
    except Exception as e:
        print(f"DB Insert Error: {e}")

async def get_historical_data(hours: int = 24):
    """
    Fetches aggregated historical data for the frontend charts.
    """
    if pool is None:
        return []
    
    query = f'''
        SELECT 
            date_trunc('hour', time) AS bucket,
            AVG(temperature) as avg_temp,
            AVG(humidity) as avg_hum,
            AVG(vpd) as avg_vpd,
            MAX(ai_risk_score) as max_risk
        FROM sensor_metrics
        WHERE time > NOW() - INTERVAL '{hours} hours'
        GROUP BY bucket
        ORDER BY bucket ASC;
    '''
    
    async with pool.acquire() as conn:
        records = await conn.fetch(query)
        
    return [
        {
            "time": r["bucket"].isoformat(),
            "temp": r["avg_temp"],
            "hum": r["avg_hum"],
            "vpd": r["avg_vpd"],
            "risk": r["max_risk"]
        }
        for r in records
    ]

async def get_latest_data():
    """
    Fetches the single latest row from the database.
    """
    if pool is None:
        return None
    
    query = '''
        SELECT *
        FROM sensor_metrics
        ORDER BY time DESC
        LIMIT 1;
    '''
    
    async with pool.acquire() as conn:
        record = await conn.fetchrow(query)
        
    if record:
        return dict(record)
    return None

async def get_latest_outdoor_weather():
    if pool is None:
        return None
        
    query = '''
        SELECT *
        FROM outdoor_weather_data
        ORDER BY time DESC
        LIMIT 1;
    '''
    
    async with pool.acquire() as conn:
        record = await conn.fetchrow(query)
        
    if record:
        return dict(record)
    return None

async def get_daily_average(date_str: str):
    """
    Fetches the daily average metrics for a specific YYYY-MM-DD date.
    """
    if pool is None:
        return None
        
    query = '''
        SELECT 
            AVG(temperature) as temperature,
            AVG(humidity) as humidity,
            AVG(co2_ppm) as co2_ppm,
            AVG(vpd) as vpd,
            MAX(ai_risk_score) as ai_risk_score,
            BOOL_OR(is_high_risk) as is_high_risk
        FROM sensor_metrics
        WHERE DATE(time AT TIME ZONE 'UTC') = $1::DATE;
    '''
    
    try:
        parsed_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None

    async with pool.acquire() as conn:
        record = await conn.fetchrow(query, parsed_date)
        
    if record and record['temperature'] is not None: # check if any data was found
        return dict(record)
    return None

async def get_daily_trends(date_str: str):
    """
    Fetches the hourly metrics for a specific YYYY-MM-DD date.
    """
    if pool is None:
        return []
        
    try:
        parsed_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return []

    query = '''
        SELECT 
            time AT TIME ZONE 'UTC' as time,
            temperature,
            humidity,
            vpd
        FROM sensor_metrics
        WHERE DATE(time AT TIME ZONE 'UTC') = $1::DATE
        ORDER BY time ASC;
    '''
    
    async with pool.acquire() as conn:
        records = await conn.fetch(query, parsed_date)
        
    return [
        {
            "time": r["time"].strftime("%H:%M"),
            "temperature": round(r["temperature"], 1) if r["temperature"] else None,
            "humidity": round(r["humidity"], 1) if r["humidity"] else None,
            "vpd": round(r["vpd"], 2) if r["vpd"] else None
        }
        for r in records
    ]
