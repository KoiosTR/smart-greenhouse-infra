import asyncio
import os
import sys

# Add ml folder to path
sys.path.append(os.path.dirname(__file__))
from train import train_model

async def run_training_task(broadcast_callback):
    """
    Runs the PyTorch model training and emits metrics via broadcast_callback.
    """
    csv_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "greenhouse-performance-hourly-30d-20260913.csv"))
    
    # We must run train_model in a thread pool to avoid blocking the asyncio event loop
    loop = asyncio.get_running_loop()
    
    def sync_callback(epoch, total_epochs, loss_or_metrics):
        if epoch == "done":
            # loss_or_metrics is dict with acc, prec, rec
            msg = {
                "type": "training_update",
                "status": "completed",
                "metrics": loss_or_metrics
            }
        else:
            msg = {
                "type": "training_update",
                "status": "running",
                "epoch": epoch,
                "total_epochs": total_epochs,
                "loss": loss_or_metrics
            }
        
        # Schedule the broadcast_callback in the main thread's event loop
        asyncio.run_coroutine_threadsafe(broadcast_callback(msg), loop)

    print("Starting background training task...")
    
    # Send starting message
    await broadcast_callback({
        "type": "training_update",
        "status": "started"
    })
    
    # Run blocking training function in executor
    try:
        await loop.run_in_executor(None, lambda: train_model(csv_file, epochs=20, batch_size=32, lr=0.001, epoch_callback=sync_callback))
    except Exception as e:
        print(f"Training failed: {e}")
        await broadcast_callback({
            "type": "training_update",
            "status": "error",
            "message": str(e)
        })
