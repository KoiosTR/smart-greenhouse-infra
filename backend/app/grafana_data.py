"""Verdify Grafana (verdify-tsdb) üzerinden gerçek sera verisi.

Tüm gün sınırları UTC'dir (yerel DB sorgularıyla tutarlı). Grafana zaman sütunlarını epoch-ms döndürür.
"""
import time
from datetime import datetime, timezone

from app.scada import query_verdify

_cache = {}
_TTL = 30  # sn: Grafana'yı sık sorgulamamak için


def _rows(sql, ttl=_TTL):
    hit = _cache.get(sql)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    cols, vals = query_verdify(sql)
    rows = [dict(zip(cols, r)) for r in zip(*vals)] if cols and vals else []
    if rows:
        _cache[sql] = (time.time(), rows)
    return rows


def _day_bounds(date_str):
    start = int(datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    return start, start + 86400


def _iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _hhmm(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%H:%M")


def _f_to_c(f):
    return None if f is None else (f - 32) * 5.0 / 9.0


def latest_conditions():
    rows = _rows(
        "SELECT ts, temp_avg AS temperature, rh_avg AS humidity, vpd_avg AS vpd, dew_point, co2_ppm "
        "FROM climate WHERE temp_avg IS NOT NULL ORDER BY ts DESC LIMIT 1"
    )
    if not rows:
        return None
    r = rows[0]
    return {"time": _iso(r["ts"]), "temperature": r["temperature"], "humidity": r["humidity"], "vpd": r["vpd"],
            "dew_point": r["dew_point"], "co2_ppm": r["co2_ppm"], "ai_risk_score": None, "is_high_risk": None}


def daily_conditions(date_str):
    s, e = _day_bounds(date_str)
    rows = _rows(
        "SELECT AVG(temp_avg) AS temperature, AVG(rh_avg) AS humidity, AVG(vpd_avg) AS vpd, "
        f"AVG(dew_point) AS dew_point, AVG(co2_ppm) AS co2_ppm FROM climate WHERE ts >= to_timestamp({s}) AND ts < to_timestamp({e})"
    )
    if not rows or rows[0]["temperature"] is None:
        return None
    return {**rows[0], "ai_risk_score": None, "is_high_risk": None}


def daily_trends(date_str):
    s, e = _day_bounds(date_str)
    rows = _rows(
        "SELECT date_trunc('hour', ts) AS t, AVG(temp_avg) AS temperature, AVG(rh_avg) AS humidity, AVG(vpd_avg) AS vpd "
        f"FROM climate WHERE ts >= to_timestamp({s}) AND ts < to_timestamp({e}) GROUP BY 1 ORDER BY 1"
    )
    rnd = lambda v, n: None if v is None else round(v, n)
    return [{"time": _hhmm(r["t"]), "temperature": rnd(r["temperature"], 1), "humidity": rnd(r["humidity"], 1), "vpd": rnd(r["vpd"], 2)} for r in rows]


def weather_latest():
    rows = _rows(
        "SELECT ts, outdoor_temp_f, outdoor_rh_pct, wind_speed_mph, wind_direction_deg, precip_in, solar_irradiance_w_m2 "
        "FROM climate WHERE outdoor_temp_f IS NOT NULL ORDER BY ts DESC LIMIT 1"
    )
    if not rows:
        return None
    r = rows[0]
    mph, pin = r["wind_speed_mph"], r["precip_in"]
    return {"time": _iso(r["ts"]), "temperature_c": _f_to_c(r["outdoor_temp_f"]), "humidity": r["outdoor_rh_pct"],
            "wind_speed_kmh": None if mph is None else mph * 1.60934, "wind_direction_deg": r["wind_direction_deg"],
            "rainfall_mm": None if pin is None else pin * 25.4, "solar_irradiance_w_m2": r["solar_irradiance_w_m2"]}


def energy_day(date_str):
    """Net şebeke gücü (Shelly): + çekilen, - verilen. Saatlik ortalama gücün pozitif/negatif kısımları kWh'a çevrilir."""
    s, e = _day_bounds(date_str)
    p = "COALESCE(watts_total, ch0_power_w + ch1_power_w)"
    hours = _rows(
        f"SELECT date_trunc('hour', ts) AS t, AVG(GREATEST({p}, 0)) AS imp_w, AVG(GREATEST(-({p}), 0)) AS exp_w, COUNT(*) AS n "
        f"FROM energy WHERE ts >= to_timestamp({s}) AND ts < to_timestamp({e}) AND {p} IS NOT NULL GROUP BY 1 ORDER BY 1"
    )
    bins = [{"hour": datetime.fromtimestamp(h["t"] / 1000, tz=timezone.utc).hour, "import_kwh": h["imp_w"] / 1000.0, "export_kwh": h["exp_w"] / 1000.0} for h in hours]
    est = _rows(f"SELECT kwh_estimated FROM daily_summary WHERE date = '{date_str}'::date")
    last = _rows(f"SELECT {p} AS w FROM energy WHERE {p} IS NOT NULL ORDER BY ts DESC LIMIT 1", ttl=10)
    imp, exp = sum(b["import_kwh"] for b in bins), sum(b["export_kwh"] for b in bins)
    return {"date": date_str, "hours": bins, "import_kwh": imp, "export_kwh": exp, "net_kwh": imp - exp,
            "estimated_load_kwh": est[0]["kwh_estimated"] if est else None,
            "current_power_w": last[0]["w"] if last else None}


def solar_trend(rng):
    """Dış ortam güneş radyasyonu (W/m²): day=son 24 saat/saatlik, week=son 7 gün/günlük, month=son 4 hafta/haftalık."""
    if rng == "week":
        sql = ("SELECT date_trunc('day', ts) AS t, AVG(solar_irradiance_w_m2) AS v FROM climate "
               "WHERE ts > now() - interval '7 days' AND solar_irradiance_w_m2 IS NOT NULL GROUP BY 1 ORDER BY 1")
        label = lambda ms: datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%a")
        rows = _rows(sql, ttl=300)
    elif rng == "month":
        rows = _rows("SELECT FLOOR(EXTRACT(EPOCH FROM (now() - ts)) / 604800) AS k, AVG(solar_irradiance_w_m2) AS v FROM climate "
                     "WHERE ts > now() - interval '28 days' AND solar_irradiance_w_m2 IS NOT NULL GROUP BY 1 ORDER BY 1 DESC", ttl=600)
        return [{"time": f"Week {i + 1}", "value": round(r["v"], 1)} for i, r in enumerate(rows)]
    else:
        sql = ("SELECT date_trunc('hour', ts) AS t, AVG(solar_irradiance_w_m2) AS v FROM climate "
               "WHERE ts > now() - interval '24 hours' AND solar_irradiance_w_m2 IS NOT NULL GROUP BY 1 ORDER BY 1")
        label = _hhmm
        rows = _rows(sql)
    return [{"time": label(r["t"]), "value": round(r["v"], 1)} for r in rows]


def dew_trend():
    """İç ortam çiğ noktası ve hava sıcaklığı (°C), son 24 saat saatlik. Aradaki fark yoğuşma marjıdır."""
    rows = _rows(
        "SELECT date_trunc('hour', ts) AS t, AVG(dew_point) AS dp, AVG(temp_avg) AS ta FROM climate "
        "WHERE ts > now() - interval '24 hours' AND dew_point IS NOT NULL AND temp_avg IS NOT NULL GROUP BY 1 ORDER BY 1"
    )
    return [{"name": _hhmm(r["t"]), "current": round(_f_to_c(r["dp"]), 1), "baseline": round(_f_to_c(r["ta"]), 1)} for r in rows]


# --- Monitoring grafikleri: tüm pencereler Grafana'daki en son ölçüme göre (veri gecikse de boş kalmaz) ---
_ANCHOR = "(SELECT MAX(ts) FROM climate WHERE temp_avg IS NOT NULL)"
_TZ = "America/Denver"  # Verdify serası (Colorado); ısı haritasında yerel saat anlamlı
_EQUIP = ("heat1", "heat2", "fan1", "fan2", "fog", "vent", "grow_light_main", "drip_wall", "drip_center")


def monitoring_charts(days=7):
    days = max(1, min(int(days), 30))
    rnd = lambda v, n=2: None if v is None else round(v, n)

    # VPD histogramı: saatlik ortalama VPD'lerin 0.1 kPa'lık dilimlerdeki saat sayısı
    rows = _rows(
        "SELECT FLOOR(v/0.1)*0.1 AS bin, COUNT(*) AS hours FROM ("
        f"SELECT date_trunc('hour', ts) AS h, AVG(vpd_avg) AS v FROM climate WHERE vpd_avg IS NOT NULL AND ts > {_ANCHOR} - interval '{days} days' GROUP BY 1) t "
        "GROUP BY 1 ORDER BY 1")
    hist = [{"bin": rnd(r["bin"], 1), "hours": r["hours"]} for r in rows]

    # Ekipman günlük çalışma süresi (dk), gün başına tek satır
    eq = ",".join(f"'{e}'" for e in _EQUIP)
    rows = _rows(
        f"SELECT to_char(day, 'MM-DD') AS d, equipment, on_minutes FROM mv_equipment_runtime_daily "
        f"WHERE equipment IN ({eq}) AND day > {_ANCHOR} - interval '{days} days' ORDER BY day")
    by_day = {}
    for r in rows:
        by_day.setdefault(r["d"], {"day": r["d"]})[r["equipment"]] = rnd(r["on_minutes"], 1)
    runtime = list(by_day.values())

    # Bölge sıcaklıkları (°C), son 24 saat saatlik
    rows = _rows(
        "SELECT date_trunc('hour', ts) AS t, AVG(temp_north) AS north, AVG(temp_south) AS south, AVG(temp_east) AS east, AVG(temp_west) AS west, "
        f"AVG(co2_ppm) AS co2, AVG(temp_avg) AS avg FROM climate WHERE ts > {_ANCHOR} - interval '24 hours' GROUP BY 1 ORDER BY 1")
    c = lambda v: None if v is None else round(_f_to_c(v), 1)
    zones = [{"time": _hhmm(r["t"]), "north": c(r["north"]), "south": c(r["south"]), "east": c(r["east"]), "west": c(r["west"]),
              "avg": c(r["avg"]), "co2": rnd(r["co2"], 0)} for r in rows]

    # Isı haritası: yerel saat (Denver) × gün, ortalama VPD
    rows = _rows(
        f"SELECT to_char(ts AT TIME ZONE '{_TZ}', 'MM-DD') AS d, EXTRACT(HOUR FROM ts AT TIME ZONE '{_TZ}')::int AS h, AVG(vpd_avg) AS v "
        f"FROM climate WHERE vpd_avg IS NOT NULL AND ts > {_ANCHOR} - interval '{max(days, 14)} days' GROUP BY 1, 2 ORDER BY 1, 2")
    heat = [{"day": r["d"], "hour": r["h"], "vpd": rnd(r["v"])} for r in rows]

    return {"days": days, "vpd_histogram": hist, "runtime_daily": runtime, "equipment": list(_EQUIP),
            "zones_24h": zones, "vpd_heatmap": heat, "timezone": _TZ}


def kpi_24h():
    """Monitoring KPI kartları için son 24 saatlik saatlik seriler (sıcaklıklar °C)."""
    rows = _rows(
        "SELECT date_trunc('hour', ts) AS t, AVG(co2_ppm) AS co2, AVG(temp_avg) AS temp, AVG(house_temp_target_f) AS target, "
        f"AVG(dew_point) AS dew, AVG(solar_irradiance_w_m2) AS solar FROM climate WHERE ts > {_ANCHOR} - interval '24 hours' GROUP BY 1 ORDER BY 1")
    c = lambda v: None if v is None else round(_f_to_c(v), 1)
    return [{"time": _hhmm(r["t"]), "co2": None if r["co2"] is None else round(r["co2"]), "temp": c(r["temp"]), "target": c(r["target"]),
             "dew": c(r["dew"]), "solar": None if r["solar"] is None else round(r["solar"])} for r in rows]
