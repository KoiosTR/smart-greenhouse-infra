import pytest
import numpy as np
import pandas as pd
from app.ml.preprocessing import TimeSeriesPreprocessor
import os

@pytest.fixture
def preprocessor():
    # 5 saatlik (veya 5 adımlı) kayan pencere boyutu ile test ediyoruz
    return TimeSeriesPreprocessor(window_size=5)

@pytest.fixture
def mock_data():
    return pd.DataFrame({
        "temperature": np.random.uniform(20, 30, 20),
        "humidity": np.random.uniform(50, 80, 20),
        "co2_ppm": np.random.uniform(400, 1000, 20),
        "vpd": np.random.uniform(0.5, 2.0, 20),
        "dew_point": np.random.uniform(10, 20, 20),
        "leaf_wetness": np.random.uniform(0, 1, 20)
    })

def test_initialization(preprocessor):
    assert preprocessor.window_size == 5
    assert not preprocessor.is_fitted
    assert len(preprocessor.feature_names) == 6

def test_missing_columns_in_fit(preprocessor):
    bad_df = pd.DataFrame({
        "temperature": [25, 26, 27],
        "humidity": [50, 60, 70]
        # Eksik özellikler var
    })
    
    with pytest.raises(ValueError, match="Veri setinde eksik özellikler"):
        preprocessor.fit_transform(bad_df)

def test_fit_transform_shapes(preprocessor, mock_data):
    X_train, y_train = preprocessor.fit_transform(mock_data)
    
    # 20 veri, window_size 5 => 20 - 5 = 15 örnek olmalı
    assert X_train.shape == (15, 5, 6)
    assert y_train.shape == (0,) # Şimdilik y boş dönüyor
    assert preprocessor.is_fitted
    assert os.path.exists("scaler.pkl")

def test_transform_inference_success(preprocessor, mock_data):
    # Önce fit ediyoruz
    preprocessor.fit_transform(mock_data)
    
    # Canlı akış simulasyonu (Son 5 veri)
    streaming_window = mock_data.tail(5).to_dict(orient="records")
    
    X_inference = preprocessor.transform_inference(streaming_window)
    
    assert X_inference is not None
    assert X_inference.shape == (1, 5, 6)

def test_transform_inference_without_fit():
    new_preprocessor = TimeSeriesPreprocessor(window_size=5)
    
    # Eğer disktte 'scaler.pkl' varsa eski testi etkilememesi için siliyoruz
    if os.path.exists("scaler.pkl"):
        os.remove("scaler.pkl")
        
    streaming_window = [{"temperature": 25, "humidity": 60, "co2_ppm": 400, "vpd": 1.0, "dew_point": 15, "leaf_wetness": 0.5}] * 5
    
    with pytest.raises(ValueError, match="Scaler henüz eğitilmedi"):
        new_preprocessor.transform_inference(streaming_window)

def test_transform_inference_insufficient_data(preprocessor, mock_data):
    preprocessor.fit_transform(mock_data)
    
    # Pencere boyutu (5) den daha az (3) veri gelmesi durumu
    streaming_window = mock_data.tail(3).to_dict(orient="records")
    
    X_inference = preprocessor.transform_inference(streaming_window)
    assert X_inference is None  # Yetersiz veri durumunda None dönmesini bekliyoruz
