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
    """SCADA verisi: public dashboard (canlı bölge iklimi) + saatlik arşiv CSV (ekipman). Olmayan veri None kalır."""
    from app import public_data as pdata
    now = time.time()
    if _scada_cache["data"] and (now - _scada_cache["last_fetched"] < 15):
        return _scada_cache["data"]

    runtime, last_hour, archive_hour = pdata.runtime_last_hours(24)
    zn = pdata.zones_now()

    def status(eq, on, off):
        # Anlık durum yok: son arşiv saatinde çalıştıysa aktif sayılır (gecikmeli)
        return "UNKNOWN" if eq not in last_hour else (on if last_hour[eq] > 0 else off)

    r1 = lambda v, n=1: None if v is None else round(v, n)
    actuators = [
        {"id": "heat1", "name": "Isıtıcı 1 (Elektrikli Rezistans)", "category": "heating", "status": status("heat1", "RUNNING", "IDLE"),
         "runtime_min": runtime.get("heat1"), "description": "Gece & sabah saatlerinde kök bölgesi minimum 18°C koruma rejimi."},
        {"id": "heat2", "name": "Isıtıcı 2 (Doğalgaz Kazanı)", "category": "heating", "status": status("heat2", "RUNNING", "IDLE"),
         "runtime_min": runtime.get("heat2"), "description": "Ana sera hacmi sıcaklık destek ünitesi."},
        {"id": "grow_light_main", "name": "Büyütme Işıkları (Grow Lights Main)", "category": "lighting", "status": status("grow_light_main", "RUNNING", "IDLE"),
         "runtime_min": runtime.get("grow_light_main"), "description": "Fotosentez takviyesi (DLI hedefi: 14 mol/m²/gün)."},
        {"id": "irrigation_wall", "name": "Dikey Duvar Sulama (Irrigation Wall)", "category": "irrigation", "status": status("drip_wall", "RUNNING", "IDLE"),
         "runtime_min": runtime.get("drip_wall"), "description": "Kök bölgesi nem sensörüne bağlı otomatik damla hat."},
        {"id": "vent", "name": "Çatı Havalandırma Menfezleri (Roof Vents)", "category": "ventilation", "status": status("vent", "OPEN", "CLOSED"),
         "runtime_min": runtime.get("vent"), "description": "Termal koruma için kapalı konumda tutuluyor."},
        {"id": "fan1", "name": "Sirkülasyon Fanı 1 (Canopy Airflow)", "category": "ventilation", "status": status("fan1", "RUNNING", "STANDBY"),
         "runtime_min": runtime.get("fan1"), "description": "Hava durgunluğu ve mikro-iklim oluşumunu engeller."},
        {"id": "fog", "name": "Yüksek Basınç Sisleme (Fog / Mister)", "category": "humidity", "status": status("fog", "ACTIVE", "STANDBY"),
         "runtime_min": runtime.get("fog"), "description": "VPD > 1.4 kPa aşıldığında ani yaprak nemlendirmesi."},
    ]

    names = {"east": "Doğu Bölgesi (East Zone)", "west": "Batı Bölgesi (West Zone)", "north": "Kuzey Bölgesi (North Zone)", "center": "Merkez Sera (Center / Target)"}
    zones = [{"id": z, "name": names[z], "temperature_c": r1(zn[z]["temp_c"]), "humidity_pct": r1(zn[z]["rh"]),
              "vpd_kpa": r1(zn[z]["vpd"], 2), "vpd_target": r1(zn[z]["vpd_target"], 2), "status": None} for z in ("east", "west", "north", "center")]

    avg_c, avg_vpd = zn["center"]["temp_c"], zn["center"]["vpd"]  # ev ortalaması
    facility = {
        "co2_ppm": None,  # Verdify public kaynaklarında yok
        "vpd_kpa": r1(avg_vpd, 2),
        "dew_point_c": r1(pdata.dew_c(avg_c, pdata.rh_from(avg_c, avg_vpd))),
        "solar_irradiance_w_m2": r1(zn["solar"], 0),
        "pressure_hpa": None,
        "temp_target_c": r1(zn["house_target_c"]),
        "soil_temp_c": None,
        "water_total_gal": None,
    }

    result = {"greenhouse_id": "vallery", "actuators": actuators, "zones": zones, "facility": facility,
              "logs": pdata.recent_events(10), "archive_hour": archive_hour,
              "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")}
    _scada_cache["data"] = result
    _scada_cache["last_fetched"] = now
    return result

