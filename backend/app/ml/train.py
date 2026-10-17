import os
from dotenv import load_dotenv
import torch
import torch.nn as nn
import torch.optim as optim

load_dotenv()
from torch.utils.data import DataLoader, random_split
import pandas as pd
from sklearn.metrics import accuracy_score, precision_score, recall_score

from preprocessing import TimeSeriesPreprocessor
from dataset import GreenhouseDataset
from model import HybridGreenhouseAI

def train_model(csv_path: str = None, epochs: int = 15, batch_size: int = 32, lr: float = 0.001, epoch_callback=None):
    print("--- Greenhouse AI Training Pipeline ---")
    
    # 1. Load Data
    if csv_path and os.path.exists(csv_path):
        print(f"Loading data from CSV: {csv_path}...")
        df = pd.read_csv(csv_path)
    else:
        db_url = os.environ.get("SUPABASE_DB_URL")
        if not db_url:
            raise ValueError("No CSV path provided and SUPABASE_DB_URL environment variable is missing.")
            
        if db_url.startswith("postgres://"):
            db_url = db_url.replace("postgres://", "postgresql://", 1)
            
        print("Connecting to database to fetch training data...")
        from sqlalchemy import create_engine
        engine = create_engine(db_url)
        
        # We need historical data for training. 
        # Join sensor_metrics with outdoor_weather_data and aggregate hourly
        query = """
        WITH indoor AS (
            SELECT date_trunc('hour', time) as hour,
                   AVG(temperature) as indoor_temp,
                   AVG(humidity) as indoor_hum,
                   AVG(vpd) as indoor_vpd
            FROM sensor_metrics
            GROUP BY 1
        ),
        outdoor AS (
            SELECT date_trunc('hour', time) as hour,
                   AVG(temperature_c) as outdoor_temp,
                   AVG(humidity) as outdoor_hum,
                   AVG(solar_irradiance_w_m2) as solar,
                   AVG(wind_speed_kmh) as wind_speed
            FROM outdoor_weather_data
            GROUP BY 1
        )
        SELECT i.hour as time, i.indoor_temp, i.indoor_hum, i.indoor_vpd,
               o.outdoor_temp, o.outdoor_hum, o.solar, o.wind_speed
        FROM indoor i
        INNER JOIN outdoor o ON i.hour = o.hour
        ORDER BY time ASC
        """
        print("Downloading dataset from Supabase...")
        df = pd.read_sql(query, engine)
        print("Download complete.")
    
    # Fill any NaNs with forward fill for simplicity
    df.fillna(method='ffill', inplace=True)
    df.fillna(method='bfill', inplace=True)
    
    print(f"Total rows loaded: {len(df)}")
    
    # 2. Preprocess Data
    preprocessor = TimeSeriesPreprocessor(window_size=24, forecast_horizon=6)
    X, y = preprocessor.fit_transform(df)
    
    print(f"Preprocessing completed. X shape: {X.shape}, y shape: {y.shape}")
    
    # Check class distribution
    risk_count = int(y.sum())
    print(f"Dataset Distribution - High Risk: {risk_count}, Low Risk: {len(y) - risk_count}")
    
    # 3. Create PyTorch Dataset & DataLoaders
    dataset = GreenhouseDataset(X, y)
    
    # Split into train/test (80/20)
    train_size = int(0.8 * len(dataset))
    test_size = len(dataset) - train_size
    train_dataset, test_dataset = random_split(dataset, [train_size, test_size])
    
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)
    
    # 4. Initialize Model, Loss, Optimizer
    # X shape is (samples, window_size=24, num_features=8)
    num_features = X.shape[2]
    model = HybridGreenhouseAI(num_features=num_features, hidden_size=64, num_layers=2, dropout=0.3)
    
    # Binary Cross Entropy with Logits Loss (handles sigmoid internally)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr)
    
    print("Starting Training Loop...")
    
    # 5. Training Loop
    for epoch in range(epochs):
        model.train()
        train_loss = 0.0
        
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            
            # Forward pass
            outputs = model(batch_X)
            loss = criterion(outputs, batch_y)
            
            # Backward pass & optimize
            loss.backward()
            optimizer.step()
            
            train_loss += loss.item()
            
        avg_train_loss = train_loss / len(train_loader)
        
        if (epoch+1) % 5 == 0 or epoch == 0:
            print(f"Epoch [{epoch+1}/{epochs}] - Loss: {avg_train_loss:.4f}")
            
        if epoch_callback:
            epoch_callback(epoch + 1, epochs, avg_train_loss)
            
    # 6. Evaluation
    print("\n--- Evaluation on Test Set ---")
    model.eval()
    all_preds = []
    all_labels = []
    
    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            outputs = model(batch_X)
            # Apply sigmoid and round to get binary prediction
            preds = torch.sigmoid(outputs).round()
            
            all_preds.extend(preds.numpy())
            all_labels.extend(batch_y.numpy())
            
    acc = accuracy_score(all_labels, all_preds)
    prec = precision_score(all_labels, all_preds, zero_division=0)
    rec = recall_score(all_labels, all_preds, zero_division=0)
    
    print(f"Accuracy:  {acc:.4f}")
    print(f"Precision: {prec:.4f}")
    print(f"Recall:    {rec:.4f}")
    
    if epoch_callback:
        epoch_callback("done", epochs, {"acc": acc, "prec": prec, "rec": rec})
    
    # 7. Save Model
    save_path = "greenhouse_ai_model.pth"
    torch.save(model.state_dict(), save_path)
    print(f"\nModel successfully saved to {save_path}")

if __name__ == "__main__":
    # We will try to fetch from DB instead of hardcoded CSV
    train_model(epochs=20, batch_size=32, lr=0.001)
