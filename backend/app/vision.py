import time
import requests
import numpy as np
from PIL import Image
import io
import base64
import os

# In-memory cache for Verdify API
_cache = {
    "crop_health": None,
    "last_fetched": 0
}


def get_verdify_vision_data():
    """
    Fetches real-time visual crop health observations from Verdify API.
    Uses in-memory cache to prevent excessive external requests.
    """
    now = time.time()
    if _cache["crop_health"] and (now - _cache["last_fetched"] < 60):
        return _cache["crop_health"]

    crop_info = {}

    try:
        # Fetch crop details
        r_crop = requests.get('https://api.verdify.ai/api/v1/crops/5', headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        if r_crop.status_code == 200:
            c_data = r_crop.json()
            crop_info = {
                "name": c_data.get("name"),
                "variety": c_data.get("variety"),
                "stage": c_data.get("stage"),
                "zone": (c_data.get("zone") or "").capitalize() or None,
            }
    except Exception as e:
        print(f"Error fetching crop details: {e}")

    events = []
    try:
        # Fetch visual health log
        r_health = requests.get('https://api.verdify.ai/api/v1/crops/5/health', headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        if r_health.status_code == 200:
            records = r_health.json()
            for rec in records:
                score = rec.get("health_score") or 0
                notes = rec.get("notes", "")
                ts = rec.get("ts", "")
                source = rec.get("source", "gemini-vision")

                # Categorize based on notes
                lower_notes = notes.lower()
                if "yellow" in lower_notes or "stress" in lower_notes or "dry" in lower_notes:
                    status = "warning"
                    badge = "Stress / Yellowing Warning"
                elif "bloom" in lower_notes or "flower" in lower_notes:
                    status = "flowering"
                    badge = "Flowering Active"
                elif "ir" in lower_notes:
                    status = "night_ir"
                    badge = "Night IR Vision"
                else:
                    status = "healthy"
                    badge = "Optimal Vigour"

                events.append({
                    "timestamp": ts,
                    "health_score": round(score * 100, 1),
                    "notes": notes,
                    "source": source,
                    "status": status,
                    "badge": badge
                })
    except Exception as e:
        print(f"Error fetching vision health: {e}")

    latest_score = events[0]["health_score"] if events else None

    result = {
        "crop": crop_info,
        "latest_health_score": latest_score,
        "vision_model": "Gemini-Vision 1.5 + Spectral ExG",
        "total_observations": len(events),
        "events": events[:25] # Return top 25 recent events
    }

    _cache["crop_health"] = result
    _cache["last_fetched"] = now
    return result


def diagnose_leaf_image(image_bytes: bytes):
    """
    Performs Computer Vision diagnosis on a user-uploaded leaf image.
    Calculates ExG bio-reflectance, color balance, and provides classification.
    """
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        img_thumb = img.resize((400, 400))
        arr = np.array(img_thumb, dtype=np.float32)

        R, G, B = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
        total = R + G + B + 1e-6
        r, g, b = R / total, G / total, B / total

        exg = 2.0 * g - r - b
        green_ratio = float(np.mean(g))
        red_ratio = float(np.mean(r))

        # Diagnosing based on spectral features
        if red_ratio > 0.38 and green_ratio < 0.34:
            diagnosis = "Early Blight / Brown Spot (Erken Yanıklık / Leke)"
            severity = "High Risk"
            color = "#ef4444"
            recommendation = "Nem seviyesini %65 altına düşürün, havalandırma fanlarını çalıştırın ve fungisit kontrolü yapın."
        elif green_ratio > 0.33 and red_ratio > 0.34:
            diagnosis = "Nitrogen / Iron Chlorosis (Kloroz - Yaprak Sararması)"
            severity = "Medium Risk"
            color = "#f59e0b"
            recommendation = "Kök bölgesi gübre çözeltisinin EC ve pH değerlerini kontrol edin. Şelatlar takviye edilebilir."
        else:
            diagnosis = "Healthy Vegetative Leaf (Sağlıklı Doku)"
            severity = "Optimal"
            color = "#10b981"
            recommendation = "Bitki fotosentez aktivitesi yüksek ve doku yapısı homojen. Mevcut iklim rejimini koruyun."

        return {
            "status": "success",
            "diagnosis": diagnosis,
            "severity": severity,
            "color": color,
            "chlorophyll_index": round(green_ratio * 100, 1),
            "recommendation": recommendation
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
