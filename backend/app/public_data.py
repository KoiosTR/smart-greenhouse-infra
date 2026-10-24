"""Verdify'ın herkese açık kaynakları: Grafana public dashboard panelleri (canlı, ~1 dk) + saatlik arşiv CSV'si.

SQL yok: Grafana'nın anonim /api/ds/query erişimi kapandı (401). Public dashboard yalnızca panellerin hazır sorgularını verir.
Verdify'da bulunmayan veriler (CO2, basınç, anlık ekipman durumu, dış hava) burada UYDURULMAZ; None döner.
Nem ve çiy noktası, sıcaklık ve VPD'den hesaplanır (Tetens/Magnus).
"""
import io
import math
import time

import pandas as pd
import requests

BASE = "https://graphs.verdify.ai"
TOKEN = "d095b74762a242eaabc947444f31a4a1"  # "Site: Home" public dashboard
CLIMATE = "3d0ec49e80af4fa8a555a5bb8b982a3e"  # "Site: Climate": dış sıcaklık/nem/çiy noktası, gözlenmiş güneş ışınımı
LAB = "https://lab.verdify.ai"
H = {"User-Agent": "Mozilla/5.0"}
TZ = "America/Denver"
ZONE_REFS = {"north": "B", "west": "D", "east": "E", "center": "F"}  # panel 40/41'deki ref'ler
EQUIP = ("heat1", "heat2", "fan1", "fan2", "fog", "vent", "grow_light_main", "drip_wall", "drip_center")
_cache = {}


def _cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    try:
        val = fn()
    except Exception as e:
        print(f"public_data {key}: {e}")
        return hit[1] if hit else None  # hata olursa eski değer
    _cache[key] = (time.time(), val)
    return val


def panel(pid, hours=24, token=TOKEN):
    """{refId: {kolon: [değerler]}}"""
    def go():
        now = int(time.time() * 1000)
        body = {"intervalMs": 60000, "maxDataPoints": 1500,
                "timeRange": {"from": str(now - hours * 3600 * 1000), "to": str(now), "timezone": "utc"}}
        r = requests.post(f"{BASE}/api/public/dashboards/{token}/panels/{pid}/query", json=body, headers=H, timeout=15)
        r.raise_for_status()
        out = {}
        for ref, v in r.json().get("results", {}).items():
            for f in v.get("frames", []):
                vals = f["data"]["values"]
                if vals:
                    out[ref] = dict(zip([x["name"] for x in f["schema"]["fields"]], vals))
        return out
    return _cached(("panel", token, pid, hours), 30, go) or {}


def _ser(frame, col=None):
    """Panel çerçevesi -> UTC indeksli pandas serisi."""
    if not frame:
        return pd.Series(dtype="float64")
    tcol = next(n for n in frame if n.lower() == "time")
    vcols = [n for n in frame if n != tcol]
    c = col or (vcols[0] if vcols else None)
    if c is None:
        return pd.Series(dtype="float64")
    return pd.Series(frame[c], index=pd.to_datetime(frame[tcol], unit="ms", utc=True), dtype="float64")


def _last(s):
    s = s.dropna()
    return None if s.empty else float(s.iloc[-1])


def _f_to_c(f):
    return None if f is None or pd.isna(f) else (f - 32) * 5 / 9


def rh_from(temp_c, vpd):
    if temp_c is None or vpd is None:
        return None
    es = 0.6108 * math.exp(17.27 * temp_c / (temp_c + 237.3))
    return max(0.0, min(100.0, (1 - vpd / es) * 100))


def dew_c(temp_c, rh):
    if temp_c is None or not rh:
        return None
    g = math.log(rh / 100) + 17.27 * temp_c / (237.3 + temp_c)
    return 237.3 * g / (17.27 - g)


# ---------- Anlık bölge verisi ----------
def zones_now():
    t, v = panel(40), panel(41)
    tgt = {"west": "West Reconstructed Target", "east": "East Reconstructed Target", "center": "Center Reconstructed Target"}
    out = {}
    for z, ref in ZONE_REFS.items():
        tc = _f_to_c(_last(_ser(t.get(ref))))
        vpd = _last(_ser(v.get(ref)))
        target = _last(_ser(v.get("A"), tgt[z])) if z in tgt and v.get("A") and tgt[z] in v["A"] else None
        out[z] = {"temp_c": tc, "vpd": vpd, "vpd_target": target, "rh": rh_from(tc, vpd)}
    # Merkez kart = ev ortalaması: "Indoor Avg Temp" (panel 2) ve "Indoor VPD" (panel 4)
    ht = _f_to_c(_last(_ser(panel(2).get("A"))))
    hv = _last(_ser(panel(4).get("A")))
    out["center"].update({"temp_c": ht, "vpd": hv, "rh": rh_from(ht, hv)})
    band = t.get("A", {})
    out["house_target_c"] = _f_to_c(_last(_ser(band, "Reconstructed Target"))) if "Reconstructed Target" in band else None
    p36 = panel(36).get("A")
    out["solar"] = _last(_ser(p36, "Solar")) if p36 else None
    return out


# ---------- Saatlik arşiv CSV ----------
def archive():
    def go():
        m = requests.get(f"{LAB}/static/data/hourly-performance/manifest.json", headers=H, timeout=30).json()
        df = pd.read_csv(io.StringIO(requests.get(LAB + m["latest"]["url"], headers=H, timeout=60).text))
        df["t"] = pd.to_datetime(df["hour_start_utc"], utc=True)
        return df
    return _cached("csv", 600, go)


def runtime_last_hours(n=24):
    """(son n saatte toplam dk, son saatte dk, son saat zamanı)"""
    df = archive()
    if df is None or df.empty:
        return {}, {}, None
    tail = df.tail(n)
    tot = {e: round(float(tail[f"runtime_{e}_min"].sum()), 1) for e in EQUIP if f"runtime_{e}_min" in df}
    last = {e: float(df.iloc[-1][f"runtime_{e}_min"]) for e in tot}
    return tot, last, df.iloc[-1]["hour_start_local"]


def recent_events(limit=10):
    df = archive()
    if df is None:
        return []
    ev = []
    for _, r in df.tail(48).iloc[::-1].iterrows():
        for e in EQUIP:
            m = r.get(f"runtime_{e}_min")
            if m and m > 0:
                ev.append({"time": str(r["hour_start_local"]), "type": e.upper(), "message": f"{e}: {m:.0f} dk çalıştı", "severity": "info"})
        if len(ev) >= limit:
            break
    return ev[:limit]


# ---------- Monitoring grafik verileri ----------
def _hourly_local(pid, ref):
    s = _ser(panel(pid).get(ref))
    return s.resample("h").mean().tz_convert(TZ) if not s.empty else s


def zones_24h():
    temps = pd.DataFrame({z: _hourly_local(40, r) for z, r in ZONE_REFS.items()})
    vpds = pd.DataFrame({z: _hourly_local(41, r) for z, r in ZONE_REFS.items()})
    if temps.empty:
        return [], []
    band = panel(40).get("A", {})
    low = _ser(band, "Reconstructed Track Low").resample("h").mean().tz_convert(TZ) if "Reconstructed Track Low" in band else pd.Series(dtype=float)
    high = _ser(band, "Reconstructed Track High").resample("h").mean().tz_convert(TZ) if "Reconstructed Track High" in band else pd.Series(dtype=float)
    tgt = _ser(band, "Reconstructed Target").resample("h").mean().tz_convert(TZ) if "Reconstructed Target" in band else pd.Series(dtype=float)
    r1 = lambda x: None if x is None or pd.isna(x) else round(x, 1)
    c = lambda x: r1(_f_to_c(x))
    zrows, krows = [], []
    for ts in temps.index[-24:]:
        row = temps.loc[ts]
        avg_f = row.mean()
        avg_c = _f_to_c(avg_f)
        vavg = vpds.loc[ts].mean() if ts in vpds.index else None
        rh = rh_from(avg_c, None if vavg is None or pd.isna(vavg) else vavg)
        label = ts.strftime("%H:%M")
        zrows.append({"time": label, **{z: c(row[z]) for z in ZONE_REFS}, "avg": c(avg_f),
                      "low": c(low.get(ts)), "high": c(high.get(ts))})
        krows.append({"time": label, "temp": c(avg_f), "target": c(tgt.get(ts)), "vpd": None if vavg is None or pd.isna(vavg) else round(vavg, 2),
                      "dew": r1(dew_c(avg_c, rh)), "co2": None, "solar": None})
    sol = _ser(panel(36).get("A"), "Solar").resample("h").mean().tz_convert(TZ) if panel(36).get("A") else pd.Series(dtype=float)
    for k in krows:
        k["solar"] = next((None if pd.isna(v) else round(v) for ts, v in sol.items() if ts.strftime("%H:%M") == k["time"]), None)
    return zrows, krows


def monitoring_charts(days=7):
    days = max(1, min(int(days), 30))
    df = archive()
    if df is None:
        return None
    sub = df.tail(days * 24)
    v = sub["vpd_avg_kpa"].dropna()
    bins = (v / 0.1).apply(math.floor) * 0.1
    hist = [{"bin": round(float(b), 1), "hours": int(n)} for b, n in bins.round(1).value_counts().sort_index().items()]
    day = sub["hour_start_local"].str[5:10]
    rt = sub.assign(day=day).groupby("day")[[f"runtime_{e}_min" for e in EQUIP if f"runtime_{e}_min" in sub]].sum().round(1)
    runtime = [{"day": d, **{e: float(rt.loc[d, f"runtime_{e}_min"]) for e in EQUIP if f"runtime_{e}_min" in rt}} for d in rt.index]
    hm = df.tail(max(days, 14) * 24)
    heat = [{"day": r.hour_start_local[5:10], "hour": int(r.hour_start_local[11:13]), "vpd": round(r.vpd_avg_kpa, 2)}
            for r in hm.itertuples() if not pd.isna(r.vpd_avg_kpa)]
    zrows, _ = zones_24h()
    return {"days": days, "vpd_histogram": hist, "runtime_daily": runtime, "equipment": list(EQUIP),
            "zones_24h": zrows, "vpd_heatmap": heat, "timezone": TZ}


def kpi_24h():
    return zones_24h()[1]


def latest_conditions():
    """Overview'daki "Current Conditions" için anlık değerler (sıcaklık °F). Nem/çiy noktası hesaplanır, CO2 yok."""
    ts = _ser(panel(2).get("A")).dropna()
    vpd = _last(_ser(panel(4).get("A")))
    if ts.empty or vpd is None:
        return None
    tf = float(ts.iloc[-1])
    tc = (tf - 32) * 5 / 9
    rh = rh_from(tc, vpd)
    dc = dew_c(tc, rh)
    return {"time": ts.index[-1].isoformat(), "temperature": tf, "humidity": rh, "vpd": vpd,
            "dew_point": None if dc is None else dc * 9 / 5 + 32, "co2_ppm": None, "ai_risk_score": None, "is_high_risk": None}


# ---------- Weather sekmesi: dış ortam (Site: Climate dashboard'u) ----------
def solar_trend(rng):
    """Gözlenmiş güneş ışınımı (W/m²). day: son 24 saat saatlik ortalama. week/month: son 7/30 TAM günün günlük tepe değeri
    (günlük ortalama geceyi de içerdiği için düz çizgi çıkıyordu; tepe, açık ve bulutlu günleri ayırır). Saatler Denver."""
    s = _ser(panel(113, {"week": 24 * 9, "month": 24 * 33}.get(rng, 24), CLIMATE).get("A")).dropna()
    if s.empty:
        return []
    loc = s.tz_convert(TZ)
    if rng in ("week", "month"):
        g = loc.groupby(loc.index.normalize())
        d = g.max()[g.count() >= 86].tail(7 if rng == "week" else 30)  # 15 dk x 96; eksik (kısmi) günleri at
        fmt = "%a" if rng == "week" else "%m-%d"
        return [{"time": i.strftime(fmt), "value": round(v, 1)} for i, v in d.items()]
    h = loc.resample("h").mean().dropna()
    return [{"time": i.strftime("%H:%M"), "value": round(v, 1)} for i, v in h.items()][-24:]


def weather_latest():
    """Dış ortam anlık: sıcaklık, nem, güneş. Rüzgâr ve yağış Verdify'ın açık verisinde yok (None)."""
    ts = _ser(panel(9, 24, CLIMATE).get("A")).dropna()
    rh = _last(_ser(panel(10, 24, CLIMATE).get("A")))
    sol = _last(_ser(panel(113, 24, CLIMATE).get("A")))
    if ts.empty and rh is None:
        return None
    return {"time": None if ts.empty else ts.index[-1].isoformat(), "temperature_c": None if ts.empty else _f_to_c(float(ts.iloc[-1])),
            "humidity": rh, "wind_speed_kmh": None, "wind_direction_deg": None, "rainfall_mm": None, "solar_irradiance_w_m2": sol}


def dew_trend():
    """Dış ortam çiy noktası ve hava sıcaklığı (°C), son 24 saat saatlik."""
    p = panel(9, 24, CLIMATE)
    t = _ser(p.get("A")).resample("h").mean().tz_convert(TZ)
    d = _ser(p.get("D")).resample("h").mean().tz_convert(TZ)
    return [{"name": i.strftime("%H:%M"), "current": round(_f_to_c(d[i]), 1), "baseline": round(_f_to_c(t[i]), 1)}
            for i in t.index[-24:] if i in d.index and t[i] == t[i] and d[i] == d[i]]
