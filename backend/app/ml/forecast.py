"""6 saatlik VPD tahmini (yalnız iç ortam: sıcaklık, nem, VPD; saatlik) + risk kuralı.

Etiket yok: model gelecekteki ham VPD'yi tahmin eder, risk = tahmin < THR kuralı.
Olasılık, doğrulama kalıntılarının std'si (sigma) ile normal dağılım varsayımından gelir.
Eğitim: Supabase sensor_metrics (Verdify arşivi). Canlı pencere: Verdify saatlik arşiv CSV.
Eğitim: docker exec greenhouse_api python -m app.ml.forecast
"""
import os
from datetime import datetime, timezone
from math import erf, sqrt

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor


WIN, HOR, GAP, THR = 24, 6, 30, 0.8
K_ON, OFF = 2, 0.9  # alarm: K_ON ardışık saat tahmin<THR ile açılır, tahmin>OFF olunca kapanır (histerezis)
FEATS = ["temp", "hum", "vpd"]  # dış hava Verdify açık verisinde yok; "yalnız iç" model (değerlendirmede dış havadan çok az geride)
PATH = os.path.join(os.path.dirname(__file__), "forecast_gbm.joblib")
_bundle = None


def _prep(df):
    df["t"] = pd.to_datetime(df["t"], utc=True)
    df = df.set_index("t").sort_index().asfreq("h")
    df["temp"] = (df.pop("temp_f") - 32) * 5 / 9
    return df[FEATS].interpolate(limit=3)  # en fazla 3 saatlik boşluk doldurulur


def load(until=None):
    """Supabase sensor_metrics, saatlik ortalama (arşiv çakışmalarından aynı saate ait kopya satırlar var, AVG ile teke iner).
    until (YYYY-MM-DD): o günün sonuna kadar son 72 saat."""
    from sqlalchemy import create_engine
    url = (os.getenv("SUPABASE_DB_URL") or os.getenv("DB_URL", "")).replace("postgres://", "postgresql://", 1)
    where = ""
    if until:
        e = datetime.strptime(until, "%Y-%m-%d").replace(tzinfo=timezone.utc) + pd.Timedelta(days=1)
        where = f"AND time >= '{(e - pd.Timedelta(hours=72)).isoformat()}' AND time < '{e.isoformat()}'"
    df = pd.read_sql("SELECT date_trunc('hour', time) AS t, AVG(temperature) AS temp_f, AVG(humidity) AS hum, AVG(vpd) AS vpd "
                     f"FROM sensor_metrics WHERE sensor_id='GH_VERDIFY' AND temperature IS NOT NULL AND vpd IS NOT NULL {where} GROUP BY 1 ORDER BY 1",
                     create_engine(url))
    return _prep(df)


def load_live():
    """Verdify saatlik arşiv CSV'si (public): en güncel saatler. Nem, sıcaklık ve VPD'den hesaplanır."""
    from app import public_data as pdata
    a = pdata.archive()
    if a is None or a.empty:
        raise ValueError("Verdify arşivi alınamadı")
    df = pd.DataFrame({"t": a["t"], "temp_f": a["temp_avg_f"], "vpd": a["vpd_avg_kpa"]})
    df["hum"] = [pdata.rh_from((f - 32) * 5 / 9, v) if f == f and v == v else None for f, v in zip(df["temp_f"], df["vpd"])]
    return _prep(df)


def make(df):
    """Her örnek t anı: girdi geçmiş 24 saat, hedef t+1..t+6 ortalama VPD."""
    a = df[FEATS].values
    fut = df["vpd"].rolling(HOR).mean().shift(-HOR).values
    idx = [i for i in range(WIN, len(df) - HOR) if not np.isnan(a[i - WIN + 1:i + 1]).any() and not np.isnan(fut[i])]
    X = np.stack([a[i - WIN + 1:i + 1] for i in idx])
    return X, fut[idx], np.array(idx), FEATS


def tab(X, times):
    """Gecikmeli özellikler (ağaç modeli için)."""
    cur = X[:, -1, :]
    lags = [X[:, -1 - l, :] for l in (1, 3, 6, 12, 23)]
    roll = X[:, -6:, :].mean(1)
    hr = times.hour.values + 0.0
    return np.hstack([cur, *lags, roll, np.sin(2 * np.pi * hr / 24)[:, None], np.cos(2 * np.pi * hr / 24)[:, None]])


def alarm_series(p, times):
    """Saat boşluğu olan yerde durum sıfırlanır. eval_models.py ile aynı kural."""
    on, cnt, out = False, 0, np.zeros(len(p), bool)
    for i, v in enumerate(p):
        if i > 0 and (times[i] - times[i - 1]) != pd.Timedelta(hours=1):
            on, cnt = False, 0
        cnt = cnt + 1 if v < THR else 0
        if not on and cnt >= K_ON:
            on = True
        elif on and v > OFF:
            on = False
        out[i] = on
    return out


def _gbm():
    return HistGradientBoostingRegressor(max_iter=200, learning_rate=0.05)


def train():
    df = load()
    X, y, idx, _ = make(df)
    times = df.index[idx]
    cut = int(len(y) * 0.85)  # son %15 zamansal doğrulama (sigma için), araya boşluk
    tr = np.arange(0, cut - GAP)
    va = np.arange(cut, len(y))
    m = _gbm().fit(tab(X[tr], times[tr]), y[tr])
    sigma = float(np.std(y[va] - m.predict(tab(X[va], times[va]))))
    m = _gbm().fit(tab(X, times), y)  # son model tüm veriyle
    joblib.dump({"model": m, "sigma": sigma, "trained_to": str(times[-1]), "n": len(y)}, PATH)
    print(f"Eğitildi: n={len(y)} sigma={sigma:.3f} kPa, son örnek {times[-1]}")


def _get():
    global _bundle
    if _bundle is None:
        if not os.path.exists(PATH):
            raise ValueError("Tahmin modeli eğitilmemiş (python -m app.ml.forecast)")
        _bundle = joblib.load(PATH)
    return _bundle


def predict(end_date=None):
    """end_date (YYYY-MM-DD, UTC gün sonu) verilmezse Verdify arşivindeki en son 24 saat kullanılır."""
    df = load(end_date) if end_date else load_live()
    b = _get()
    # Son 24 saatlik tahmin serisi: alarm durumu geçmişe (histerezis) bağlıdır
    pos = [i for i in range(max(WIN - 1, len(df) - 24), len(df)) if not df[FEATS].iloc[i - WIN + 1:i + 1].isna().any().any()]
    if not pos or pos[-1] != len(df) - 1:
        raise ValueError("Son 24 saatte yeterli ölçüm yok")
    Xw = np.stack([df[FEATS].values[i - WIN + 1:i + 1] for i in pos])
    times = df.index[pos]
    preds = b["model"].predict(tab(Xw, times))
    pred = float(preds[-1])
    alarm = bool(alarm_series(preds, times)[-1])
    prob = 0.5 * (1 + erf((THR - pred) / (b["sigma"] * sqrt(2))))
    as_of = times[-1]
    return {"risk_probability": prob, "is_high_risk": alarm, "alarm_active": alarm, "predicted_vpd_6h": pred, "vpd_threshold": THR,
            "as_of": as_of.isoformat(), "data_age_hours": round((datetime.now(timezone.utc) - as_of).total_seconds() / 3600, 1)}


if __name__ == "__main__":
    train()
