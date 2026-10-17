import torch
import torch.nn as nn

class HybridGreenhouseAI(nn.Module):
    def __init__(self, num_features: int = 8, hidden_size: int = 64, num_layers: int = 2, dropout: float = 0.3):
        super(HybridGreenhouseAI, self).__init__()
        
        # 1D-CNN for spatial/local temporal feature extraction
        # Input shape to Conv1d: (batch_size, num_features, time_steps)
        self.conv1 = nn.Conv1d(in_channels=num_features, out_channels=32, kernel_size=3, padding=1)
        self.relu1 = nn.ReLU()
        self.pool1 = nn.MaxPool1d(kernel_size=2)
        
        self.conv2 = nn.Conv1d(in_channels=32, out_channels=64, kernel_size=3, padding=1)
        self.relu2 = nn.ReLU()
        self.pool2 = nn.MaxPool1d(kernel_size=2)
        
        # LSTM for long-term sequential dependencies
        # Input shape to LSTM: (batch_size, reduced_time_steps, 64)
        self.lstm = nn.LSTM(
            input_size=64, 
            hidden_size=hidden_size, 
            num_layers=num_layers, 
            batch_first=True, 
            dropout=dropout
        )
        
        # Fully Connected Layer for classification
        self.fc1 = nn.Linear(hidden_size, 32)
        self.relu3 = nn.ReLU()
        self.dropout = nn.Dropout(dropout)
        
        # Output layer: 1 neuron for binary classification (Disease Risk: 0 or 1)
        self.fc_out = nn.Linear(32, 1)

    def forward(self, x):
        # x shape: (batch_size, time_steps, num_features)
        
        # PyTorch Conv1d expects (batch_size, channels, length)
        x = x.permute(0, 2, 1)  # Swap time_steps and num_features
        
        # CNN block
        x = self.conv1(x)
        x = self.relu1(x)
        x = self.pool1(x)
        
        x = self.conv2(x)
        x = self.relu2(x)
        x = self.pool2(x)
        
        # Prepare for LSTM
        # Shape is now (batch_size, 64, reduced_time_steps)
        x = x.permute(0, 2, 1)  # Swap back to (batch_size, time_steps, features)
        
        # LSTM block
        lstm_out, (hn, cn) = self.lstm(x)
        
        # Take the output from the last time step
        last_hidden_state = lstm_out[:, -1, :]
        
        # Fully Connected block
        out = self.fc1(last_hidden_state)
        out = self.relu3(out)
        out = self.dropout(out)
        out = self.fc_out(out)
        
        return out
