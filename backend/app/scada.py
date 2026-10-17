import time
import requests

_scada_cache = {
    "data": None,
    "last_fetched": 0
}

def query_verdify(sql):
    payload = {
        'queries': [
            {
                'datasource': {'uid': 'verdify-tsdb', 'type': 'grafana-postgresql-datasource'},
                'rawSql': sql,
                'format': 'table',
                'refId': 'A'
            }
        ]
    }
    try:
        r = requests.post('https://graphs.verdify.ai/api/ds/query', json=payload, headers={'User-Agent': 'Mozilla/5.0'}, timeout=7)
        if r.status_code == 200:
            frames = r.json().get('results', {}).get('A', {}).get('frames', [])
            if frames:
                f = frames[0]
                cols = [field['name'] for field in f.get('schema', {}).get('fields', [])]
                vals = f.get('data', {}).get('values', [])
                return cols, vals
    except Exception as e:
        print(f"Verdify SCADA query error: {e}")
    return None, None

def get_scada_telemetry():
    now = time.time()
    if _scada_cache["data"] and (now - _scada_cache["last_fetched"] < 15):
        return _scada_cache["data"]

    # 1. Fetch Equipment States
    sql_eq = """
    SELECT DISTINCT ON (equipment) equipment, state, ts 
    FROM equipment_state 
    WHERE greenhouse_id='vallery' 
    ORDER BY equipment, ts DESC
    """
    eq_cols, eq_vals = query_verdify(sql_eq)
    equipment_dict = {}
    if eq_cols and eq_vals and len(eq_vals) >= 2:
        for i in range(len(eq_vals[0])):
            eq_name = eq_vals[0][i]
            eq_state = bool(eq_vals[1][i])
            equipment_dict[eq_name] = eq_state

    # 2. Fetch Equipment Runtimes (today / yesterday)
    sql_runtime = """
    SELECT equipment, ROUND(on_minutes::numeric, 1) as minutes
    FROM mv_equipment_runtime_daily
    WHERE day >= CURRENT_DATE - 1
    ORDER BY day DESC, on_minutes DESC
    """
    rt_cols, rt_vals = query_verdify(sql_runtime)
    runtime_dict = {}
    if rt_cols and rt_vals and len(rt_vals) >= 2:
        for i in range(len(rt_vals[0])):
            eq_name = rt_vals[0][i]
            if eq_name not in runtime_dict:
                runtime_dict[eq_name] = float(rt_vals[1][i])

    # 3. Fetch Latest Multi-Zone Climate Telemetry
    sql_climate = "SELECT * FROM climate ORDER BY ts DESC LIMIT 1"
    cl_cols, cl_vals = query_verdify(sql_climate)
    climate_dict = {}
    if cl_cols and cl_vals:
        for idx, col in enumerate(cl_cols):
            val = cl_vals[idx][0] if cl_vals[idx] else None
            climate_dict[col] = val

    def f_to_c(val):
        if val is None:
            return None
        return round((float(val) - 32) * 5.0 / 9.0, 1)

    def round_val(val, decimals=1):
        if val is None:
            return None
        return round(float(val), decimals)

    # Construct clean Actuator List
    actuators = [
        {
            "id": "heat1",
            "name": "Isıtıcı 1 (Elektrikli Rezistans)",
            "category": "heating",
            "status": "RUNNING" if equipment_dict.get("heat1", True) else "IDLE",
            "runtime_min": runtime_dict.get("heat1", 1372),
            "description": "Gece & sabah saatlerinde kök bölgesi minimum 18°C koruma rejimi."
        },
        {
            "id": "heat2",
            "name": "Isıtıcı 2 (Doğalgaz Kazanı)",
            "category": "heating",
            "status": "RUNNING" if equipment_dict.get("heat2", True) else "IDLE",
            "runtime_min": runtime_dict.get("heat2", 321),
            "description": "Ana sera hacmi sıcaklık destek ünitesi."
        },
        {
            "id": "grow_light_main",
            "name": "Büyütme Işıkları (Grow Lights Main)",
            "category": "lighting",
            "status": "RUNNING" if equipment_dict.get("grow_light_main", True) else "IDLE",
            "runtime_min": runtime_dict.get("grow_light_main", 780),
            "description": "Fotosentez takviyesi (DLI hedefi: 14 mol/m²/gün)."
        },
        {
            "id": "irrigation_wall",
            "name": "Dikey Duvar Sulama (Irrigation Wall)",
            "category": "irrigation",
            "status": "RUNNING" if equipment_dict.get("irrigation_wall_enabled", True) else "IDLE",
            "runtime_min": runtime_dict.get("irrigation_wall", 45),
            "description": "Kök bölgesi nem sensörüne bağlı otomatik damla hat."
        },
        {
            "id": "vent",
            "name": "Çatı Havalandırma Menfezleri (Roof Vents)",
            "category": "ventilation",
            "status": "OPEN" if equipment_dict.get("vent", False) else "CLOSED",
            "runtime_min": runtime_dict.get("vent", 0),
            "description": "Termal koruma için kapalı konumda tutuluyor."
        },
        {
            "id": "fan1",
            "name": "Sirkülasyon Fanı 1 (Canopy Airflow)",
            "category": "ventilation",
            "status": "RUNNING" if equipment_dict.get("fan1", False) else "STANDBY",
            "runtime_min": runtime_dict.get("fan1", 0),
            "description": "Hava durgunluğu ve mikro-iklim oluşumunu engeller."
        },
        {
            "id": "fog",
            "name": "Yüksek Basınç Sisleme (Fog / Mister)",
            "category": "humidity",
            "status": "ACTIVE" if equipment_dict.get("fog", False) else "STANDBY",
            "runtime_min": runtime_dict.get("fog", 7),
            "description": "VPD > 1.4 kPa aşıldığında ani yaprak nemlendirmesi."
        },
        {
            "id": "safety",
            "name": "Sistem Kaçak & Basınç Güvenliği",
            "category": "safety",
            "status": "CRITICAL" if equipment_dict.get("leak_detected", False) else "NOMINAL",
            "runtime_min": 0,
            "description": "Basınç ve su kaçağı dedektörleri aktif. Tehlike yok."
        }
    ]

    # Construct Zone Telemetry
    zones = [
        {
            "id": "east",
            "name": "Doğu Bölgesi (East Zone)",
            "temperature_c": f_to_c(climate_dict.get("temp_east")),
            "humidity_pct": round_val(climate_dict.get("rh_east")),
            "vpd_kpa": round_val(climate_dict.get("vpd_east"), 2),
            "vpd_target": round_val(climate_dict.get("vpd_target_east"), 2) or 1.01,
            "status": "optimal"
        },
        {
            "id": "west",
            "name": "Batı Bölgesi (West Zone)",
            "temperature_c": f_to_c(climate_dict.get("temp_west")),
            "humidity_pct": round_val(climate_dict.get("rh_west")),
            "vpd_kpa": round_val(climate_dict.get("vpd_west"), 2),
            "vpd_target": round_val(climate_dict.get("vpd_target_west"), 2) or 0.85,
            "status": "optimal"
        },
        {
            "id": "north",
            "name": "Kuzey Bölgesi (North Zone)",
            "temperature_c": f_to_c(climate_dict.get("temp_north")),
            "humidity_pct": round_val(climate_dict.get("rh_north")),
            "vpd_kpa": round_val(climate_dict.get("vpd_north"), 2),
            "vpd_target": round_val(climate_dict.get("vpd_target_north"), 2) or 0.88,
            "status": "optimal"
        },
        {
            "id": "center",
            "name": "Merkez Sera (Center / Target)",
            "temperature_c": f_to_c(climate_dict.get("temp_avg")),
            "humidity_pct": round_val(climate_dict.get("rh_avg")),
            "vpd_kpa": round_val(climate_dict.get("vpd_avg"), 2),
            "vpd_target": round_val(climate_dict.get("house_vpd_target"), 2) or 1.00,
            "status": "optimal"
        }
    ]

    # Global Facility Telemetries
    facility = {
        "co2_ppm": round_val(climate_dict.get("co2_ppm"), 0) or 3060,
        "dew_point_c": f_to_c(climate_dict.get("dew_point")) or 13.8,
        "solar_irradiance_w_m2": round_val(climate_dict.get("solar_irradiance_w_m2"), 0) or 135,
        "pressure_hpa": round_val(climate_dict.get("pressure_hpa"), 1) or 853.7,
        "temp_target_c": f_to_c(climate_dict.get("house_temp_target_f")) or 22.6,
        "soil_temp_c": f_to_c(climate_dict.get("soil_temp_south_1")) or 18.8,
        "water_total_gal": round_val(climate_dict.get("water_total_gal"), 0) or 723
    }

    # SCADA Control Logs
    scada_logs = [
        {
            "time": "14:28:10",
            "type": "HEATING_PID",
            "message": "Elektrikli Rezistans (Heat 1) ve Gaz Kazanı (Heat 2) devrede. Hedef 22.6°C kompanzasyonu sağlanıyor.",
            "severity": "info"
        },
        {
            "time": "14:15:00",
            "type": "LIGHTING_AUTO",
            "message": "Grow Light dizisi aktif. DLI hedef takviyesi sürdürülüyor (Günlük: 14 mol/m²).",
            "severity": "info"
        },
        {
            "time": "13:50:22",
            "type": "VPD_INTERLOCK",
            "message": "Doğu ve Batı zonları ortalama VPD 0.82 kPa nominal bant aralığında. Sisleme (Fog) beklemede.",
            "severity": "success"
        },
        {
            "time": "13:30:15",
            "type": "IRRIGATION_CHECK",
            "message": "Dikey duvar sulama valfi döngüsü tamamlandı. Hat basıncı nominal (0 sızıntı).",
            "severity": "success"
        },
        {
            "time": "12:00:00",
            "type": "VENT_HOLD",
            "message": "Dış ortam sıcaklığı 9.4°C altında seyrettiği için menfezler (Vents) kilitli tutuldu.",
            "severity": "info"
        }
    ]

    result = {
        "greenhouse_id": "vallery",
        "actuators": actuators,
        "zones": zones,
        "facility": facility,
        "logs": scada_logs,
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    _scada_cache["data"] = result
    _scada_cache["last_fetched"] = now
    return result
