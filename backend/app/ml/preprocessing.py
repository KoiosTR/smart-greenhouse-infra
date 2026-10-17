import numpy as np
import pandas as pd
from sklearn.preprocessing import MinMaxScaler
from typing import Tuple, List, Optional
import joblib
import os

class TimeSeriesPreprocessor:
    def __init__(self, window_size: int = 24, forecast_horizon: int = 6):
        """
        Zaman serisi verilerini yapay zeka modeli (1D-CNN + LSTM) için hazırlar.
        
        :param window_size: Kayan pencere boyutu (Örn: 24 saatlik periyotlar = 24)
        :param forecast_horizon: Kaç saat sonrasını tahmin edeceğiz (Örn: 6)
        """
        self.window_size = window_size
        self.forecast_horizon = forecast_horizon
        self.scaler = MinMaxScaler()
        self.is_fitted = False
        
        # Gerçek DB'den çekilen (Sera İçi ve Dış Mekan) kullanacağımız ana özellikler
        self.feature_names = [
            "indoor_temp",
            "indoor_hum",
            "indoor_vpd",
            "outdoor_temp",
            "outdoor_hum",
            "solar",
            "wind_speed"
        ]

    def fit_transform(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        [Eğitim Aşaması]: Veri setindeki (DataFrame) özellikleri alır,
        Min-Max normalizasyonu yapar ve Sliding Window matrislerine dönüştürür.
        """
        missing_cols = [col for col in self.feature_names if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Veri setinde eksik özellikler bulundu: {missing_cols}")

        data = df[self.feature_names].values
        
        # Min-Max Normalizasyonu (0 ile 1 arasına ölçekleme)
        scaled_data = self.scaler.fit_transform(data)
        self.is_fitted = True
        
        # Modeli (scaler) diske kaydetme
        self.save_scaler("scaler.pkl")
        
        # VPD index (2nd index since feature_names[2] is indoor_vpd)
        vpd_col_index = 2 
        
        return self._create_sliding_windows(scaled_data, raw_data=data, target_col_index=vpd_col_index)

    def transform_inference(self, data_window: List[dict]) -> Optional[np.ndarray]:
        """
        [Canlı Sistem (Inference)]: FastAPI üzerinden okunan son 'N' adet veriyi tensöre çevirir.
        """
        if not self.is_fitted:
            if not self.load_scaler("scaler.pkl"):
                raise ValueError("Scaler henüz eğitilmedi veya yüklenemedi!")
            
        if len(data_window) < self.window_size:
            return None
            
        df = pd.DataFrame(data_window)
        data = df[self.feature_names].values
        
        scaled_data = self.scaler.transform(data)
        # Shape: (1, 24, 7) - Çünkü 7 adet feature var
        tensor_3d = np.expand_dims(scaled_data, axis=0)
        
        return tensor_3d

    def _create_sliding_windows(self, scaled_data: np.ndarray, raw_data: np.ndarray, target_col_index: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        X (Girdi) Çıktı Boyutu: (samples, window_size, features)
        y (Etiket) Çıktı Boyutu: (samples, 1) -> 1 = Hastalık Riski Yüksek, 0 = Düşük
        """
        X = []
        y = []
        
        total_samples = len(scaled_data) - self.window_size - self.forecast_horizon
        
        for i in range(total_samples):
            window = scaled_data[i:(i + self.window_size)]
            
            # Hastalık Riski (Disease Risk) Etiketi Hesaplama
            # Mantık: Gelecekteki 'forecast_horizon' saat içindeki VPD değerlerine bak.
            # Eğer ortalama VPD < 0.8 kPa ise (Yüksek Nem) hastalık riski vardır (Label = 1)
            future_vpds = raw_data[i + self.window_size : i + self.window_size + self.forecast_horizon, target_col_index]
            avg_future_vpd = np.mean(future_vpds)
            
            risk_label = 1.0 if avg_future_vpd < 0.8 else 0.0
            
            X.append(window)
            y.append([risk_label])
        
        return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)
        
    def save_scaler(self, filepath: str):
        joblib.dump(self.scaler, filepath)
        
    def load_scaler(self, filepath: str) -> bool:
        if os.path.exists(filepath):
            self.scaler = joblib.load(filepath)
            self.is_fitted = True
            return True
        return False
