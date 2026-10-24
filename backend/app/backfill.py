"""Supabase'deki son kayıttan sonraki eksik saatleri Verdify saatlik arşivinden (public CSV) tamamlar.

Açılışta ve arayüz her açıldığında (/api/sync/refresh) çalışır; aynı saati iki kez yazmaz (son kayıttan sonrası).
"""
import asyncio
import time

from app import db
from app import public_data as pdata

_last_run = 0.0
COOLDOWN = 600  # sn: arayüz sık açılıp kapansa da arşiv sitesini yormamak için


async def backfill():
    if db.pool is None:
        return
    df = await asyncio.to_thread(pdata.archive)
    if df is None or df.empty:
        print("Backfill: arşiv alınamadı")
        return
    async with db.pool.acquire() as conn:
        last_in = await conn.fetchval("SELECT MAX(time) FROM sensor_metrics")
        new = df[df["t"] > last_in] if last_in is not None else df
        rows = []
        for r in new.itertuples():
            if r.temp_avg_f != r.temp_avg_f or r.vpd_avg_kpa != r.vpd_avg_kpa:  # NaN
                continue
            # sensor_metrics mevcut satırlarla aynı birim: sıcaklık °F, nem VPD'den hesaplı
            rh = pdata.rh_from((r.temp_avg_f - 32) * 5 / 9, r.vpd_avg_kpa)
            rows.append((r.t.to_pydatetime(), "GH_VERDIFY", float(r.temp_avg_f), rh, float(r.vpd_avg_kpa)))
        if rows:
            await conn.executemany("INSERT INTO sensor_metrics (time, sensor_id, temperature, humidity, vpd) VALUES ($1,$2,$3,$4,$5)", rows)
    print(f"Backfill sensor_metrics: {len(rows)} saat eklendi (son kayıt: {last_in})")


async def safe_backfill(force=False):
    global _last_run
    if not force and time.time() - _last_run < COOLDOWN:
        return False
    _last_run = time.time()
    try:
        await backfill()
    except Exception as e:
        print(f"Backfill hatası: {e}")
    return True
