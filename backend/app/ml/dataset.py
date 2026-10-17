import torch
from torch.utils.data import Dataset

class GreenhouseDataset(Dataset):
    def __init__(self, X, y):
        """
        PyTorch Dataset wrapper for greenhouse time-series data.
        X shape: (samples, window_size, features)
        y shape: (samples, 1)
        """
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32)
        
    def __len__(self):
        return len(self.X)
        
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]
