"""
Continuous Learning System: Fine-tune models incrementally from uploaded audio files.
Models improve over time as users upload and label more content.
"""

import os
import json
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import asyncio

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import numpy as np

from src.model import InstrumentCNN
from src.feature_extraction import extract_features

logger = logging.getLogger(__name__)

# Directory to store continuous learning metadata
CONTINUOUS_LEARN_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "continuous_learning"
)
os.makedirs(CONTINUOUS_LEARN_DIR, exist_ok=True)

TRAINING_LOG_FILE = os.path.join(CONTINUOUS_LEARN_DIR, "training_history.json")
LABELED_SAMPLES_FILE = os.path.join(CONTINUOUS_LEARN_DIR, "labeled_samples.json")


class ContinuousDataset(Dataset):
    """Dataset for fine-tuning from uploaded files with detected instruments."""

    def __init__(self, samples: List[Tuple[str, str, Dict[str, float]]]):
        """
        samples: list of (file_path, instrument_name, all_instrument_confidences)
        """
        self.samples = samples

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        file_path, target_instrument, all_confidences = self.samples[idx]

        try:
            features = extract_features(file_path)
            # Target label: 1.0 if confidence > 0.5, else 0.0
            label = 1.0 if all_confidences.get(target_instrument, 0.0) > 0.5 else 0.0
            return features, torch.tensor([label], dtype=torch.float32)
        except Exception as e:
            logger.warning(f"Error loading {file_path}: {e}. Returning zero tensor.")
            return torch.zeros((1, 128, 130)), torch.tensor([0.0], dtype=torch.float32)


class ContinuousLearner:
    """
    Manages incremental fine-tuning of instrument detector models.
    Collects training samples from uploaded files and periodically retrains models.
    """

    def __init__(self, models_dir: str, device: str = "cpu"):
        self.models_dir = models_dir
        self.device = torch.device(device)
        self.training_history = self._load_training_history()
        self.labeled_samples = self._load_labeled_samples()

    def _load_training_history(self) -> Dict:
        """Load training history JSON."""
        if os.path.exists(TRAINING_LOG_FILE):
            try:
                with open(TRAINING_LOG_FILE, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_training_history(self):
        """Save training history JSON."""
        with open(TRAINING_LOG_FILE, 'w') as f:
            json.dump(self.training_history, f, indent=2, default=str)

    def _load_labeled_samples(self) -> Dict[str, List]:
        """Load labeled samples for each instrument."""
        if os.path.exists(LABELED_SAMPLES_FILE):
            try:
                with open(LABELED_SAMPLES_FILE, 'r') as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def _save_labeled_samples(self):
        """Save labeled samples JSON."""
        with open(LABELED_SAMPLES_FILE, 'w') as f:
            json.dump(self.labeled_samples, f, indent=2, default=str)

    def register_training_sample(
        self,
        file_path: str,
        all_instrument_confidences: Dict[str, float]
    ):
        """
        Register an uploaded file as a training sample.
        This file can later be used to fine-tune models.
        """
        if not os.path.exists(file_path):
            logger.warning(f"File does not exist: {file_path}")
            return

        for instrument, confidence in all_instrument_confidences.items():
            if instrument not in self.labeled_samples:
                self.labeled_samples[instrument] = []

            sample = {
                "file_path": file_path,
                "confidence": confidence,
                "timestamp": datetime.utcnow().isoformat(),
                "label": 1.0 if confidence > 0.5 else 0.0
            }
            self.labeled_samples[instrument].append(sample)

        self._save_labeled_samples()
        logger.info(f"Registered training sample: {file_path}")

    async def fine_tune_model_async(
        self,
        instrument: str,
        epochs: int = 3,
        batch_size: int = 8,
        learning_rate: float = 1e-4
    ) -> bool:
        """
        Asynchronously fine-tune a model with collected training samples.
        Runs in background so it doesn't block API requests.
        """
        try:
            await asyncio.sleep(0.1)  # Allow event loop to continue
            return await asyncio.get_event_loop().run_in_executor(
                None,
                self._fine_tune_model_sync,
                instrument,
                epochs,
                batch_size,
                learning_rate
            )
        except Exception as e:
            logger.error(f"Error during async fine-tune for {instrument}: {e}")
            return False

    def _fine_tune_model_sync(
        self,
        instrument: str,
        epochs: int = 3,
        batch_size: int = 8,
        learning_rate: float = 1e-4
    ) -> bool:
        """
        Synchronously fine-tune a model with collected training samples.
        """
        logger.info(f"Starting fine-tune for {instrument}...")

        # Collect samples for this instrument
        samples = self.labeled_samples.get(instrument, [])
        if len(samples) < 4:
            logger.warning(f"Not enough samples for {instrument}: {len(samples)}")
            return False

        # Convert to dataset format
        dataset_samples = [
            (s["file_path"], instrument, {instrument: s["confidence"]})
            for s in samples
        ]

        dataset = ContinuousDataset(dataset_samples)
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

        # Load model
        model_path = os.path.join(self.models_dir, f"{instrument}_detector.pt")
        if not os.path.exists(model_path):
            logger.error(f"Model not found: {model_path}")
            return False

        try:
            model = InstrumentCNN().to(self.device)
            checkpoint = torch.load(model_path, map_location=self.device, weights_only=True)
            if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
                model.load_state_dict(checkpoint["state_dict"])
            else:
                model.load_state_dict(checkpoint)
        except Exception as e:
            logger.error(f"Failed to load model {model_path}: {e}")
            return False

        model.train()
        optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)
        criterion = nn.BCEWithLogitsLoss()

        # Fine-tune
        for epoch in range(epochs):
            total_loss = 0
            for batch_x, batch_y in dataloader:
                batch_x, batch_y = batch_x.to(self.device), batch_y.to(self.device)

                optimizer.zero_grad()
                logits = model(batch_x)
                loss = criterion(logits, batch_y)
                loss.backward()
                optimizer.step()

                total_loss += loss.item()

            avg_loss = total_loss / len(dataloader)
            logger.info(f"{instrument} - Epoch {epoch+1}/{epochs}: Loss = {avg_loss:.4f}")

        # Save fine-tuned model
        checkpoint = {
            "state_dict": model.state_dict(),
            "checkpoint_info": f"{instrument}_finetuned_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "training_samples": len(samples)
        }
        torch.save(checkpoint, model_path)

        # Log training
        if instrument not in self.training_history:
            self.training_history[instrument] = []
        self.training_history[instrument].append({
            "timestamp": datetime.utcnow().isoformat(),
            "epochs": epochs,
            "samples": len(samples),
            "loss": avg_loss
        })
        self._save_training_history()

        logger.info(f"✅ Fine-tuned {instrument} with {len(samples)} samples")
        return True

    def get_training_stats(self, instrument: str) -> Dict:
        """Get training stats for an instrument."""
        samples = self.labeled_samples.get(instrument, [])
        history = self.training_history.get(instrument, [])

        return {
            "instrument": instrument,
            "total_samples_collected": len(samples),
            "training_sessions": len(history),
            "last_trained": history[-1]["timestamp"] if history else None,
            "positive_samples": sum(1 for s in samples if s.get("label") == 1.0),
            "negative_samples": sum(1 for s in samples if s.get("label") == 0.0),
        }
