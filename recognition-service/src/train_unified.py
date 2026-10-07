import os
import json
import logging
import argparse
import random
from typing import List, Tuple

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from tqdm import tqdm
from datetime import datetime

from src.model import InstrumentCNN

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

class UnifiedBinaryDataset(Dataset):
    """
    Consumes the dataset_manifest.json created by Universal Audio Shaper.
    Implements Data Augmentation (Time shift, Random Gain).
    Extracts binary labels for the target_instrument.
    """
    def __init__(self, manifest: List[dict], target_instrument: str, data_dir: str, augment: bool = False):
        self.manifest = manifest
        self.target = target_instrument.lower()
        self.data_dir = data_dir
        self.augment = augment

        # Calculate class weights for imbalance
        self.pos_count = sum(1 for item in self.manifest if self.target in [label.lower() for label in item.get('instrument_labels', [])])
        self.neg_count = len(self.manifest) - self.pos_count

        if self.pos_count == 0:
            logger.warning(f"No positive samples found in manifest for '{self.target}'!")
            self.pos_weight = 1.0
        else:
            self.pos_weight = float(self.neg_count) / max(self.pos_count, 1)

    def __len__(self):
        return len(self.manifest)

    def apply_augmentation(self, tensor: torch.Tensor) -> torch.Tensor:
        """Apply random gain to the log-mel spectrogram tensor to simulate volume differences."""
        if not self.augment:
            return tensor

        aug_tensor = tensor.clone()

        if random.random() < 0.5:
            # Random gain between ± 10%
            gain = random.uniform(0.9, 1.1)
            aug_tensor = aug_tensor * gain
            aug_tensor = torch.clamp(aug_tensor, 0.0, 1.0)

        return aug_tensor

    def __getitem__(self, idx):
        item = self.manifest[idx]
        is_positive = self.target in [label.lower() for label in item.get('instrument_labels', [])]
        label = 1.0 if is_positive else 0.0

        tensor_path = os.path.join(self.data_dir, item['tensor_file'])

        try:
            tensor = torch.load(tensor_path, map_location="cpu", weights_only=True)
            tensor = self.apply_augmentation(tensor)
        except Exception as e:
            # Fallback for corrupted data
            tensor = torch.zeros((1, 128, 130), dtype=torch.float32)

        return tensor, torch.tensor([label], dtype=torch.float32)


def train_unified(
    instrument: str,
    data_dir: str,
    output_dir: str,
    epochs: int = 30,
    batch_size: int = 32,
    lr: float = 1e-4,
    device_name: str = "auto"
):
    if device_name == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(device_name)

    manifest_path = os.path.join(data_dir, "dataset_manifest.json")
    if not os.path.exists(manifest_path):
        logger.error(f"Manifest not found: {manifest_path}. Run audio_shaper.py first!")
        return

    with open(manifest_path, 'r') as f:
        manifest = json.load(f)

    # 80/20 split
    random.shuffle(manifest)
    split_idx = int(0.8 * len(manifest))
    train_manifest = manifest[:split_idx]
    val_manifest = manifest[split_idx:]

    train_dataset = UnifiedBinaryDataset(train_manifest, instrument, data_dir, augment=True)
    val_dataset = UnifiedBinaryDataset(val_manifest, instrument, data_dir, augment=False)

    logger.info(f"[{instrument}] Train Positives: {train_dataset.pos_count} | Negatives: {train_dataset.neg_count}")
    logger.info(f"[{instrument}] Calculated pos_weight for BCE: {train_dataset.pos_weight:.2f}")

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    model = InstrumentCNN().to(device)

    # Apply class balancing! (Step 13)
    pos_weight_tensor = torch.tensor([train_dataset.pos_weight], device=device)
    criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight_tensor)

    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=4)

    os.makedirs(output_dir, exist_ok=True)
    best_f1 = 0.0
    best_checkpoint_path = os.path.join(output_dir, f"{instrument}_detector.pt")

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss = 0.0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch:02d}/{epochs:02d} [Train]", leave=False)
        for x, y in pbar:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * len(y)
            pbar.set_postfix({"loss": f"{loss.item():.4f}"})

        train_loss /= max(len(train_dataset), 1)

        # Validation (Calculating Precision, Recall, F1 for Step 12)
        model.eval()
        val_loss = 0.0
        tp, fp, fn = 0, 0, 0

        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                logits = model(x)
                loss = criterion(logits, y)
                val_loss += loss.item() * len(y)

                preds = (torch.sigmoid(logits) >= 0.5).float()

                tp += ((preds == 1) & (y == 1)).sum().item()
                fp += ((preds == 1) & (y == 0)).sum().item()
                fn += ((preds == 0) & (y == 1)).sum().item()

        val_loss /= max(len(val_dataset), 1)

        precision = tp / (tp + fp) if tp + fp > 0 else 0.0
        recall = tp / (tp + fn) if tp + fn > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if precision + recall > 0 else 0.0

        scheduler.step(f1)

        logger.info(
            f"Epoch {epoch:02d}/{epochs:02d} | Train Loss: {train_loss:.4f} | "
            f"Val Loss: {val_loss:.4f} | Prec: {precision:.4f} Rec: {recall:.4f} F1: {f1:.4f}"
        )

        if f1 > best_f1:
            best_f1 = f1
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            checkpoint = {
                "instrument": instrument,
                "state_dict": model.state_dict(),
                "val_f1": f1,
                "val_precision": precision,
                "val_recall": recall,
                "epoch": epoch,
                "timestamp": timestamp,
                "checkpoint_info": f"{instrument}_v2_unified_f1_{f1:.4f}"
            }
            torch.save(checkpoint, best_checkpoint_path)
            logger.info(f"--> Saved new best checkpoint: {best_checkpoint_path} (F1: {f1:.4f})")

    logger.info(f"Training complete for {instrument}. Best F1: {best_f1:.4f}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Unified V2 ML Models.")
    parser.add_argument("--instrument", type=str, required=True, help="Instrument name or 'all'")
    parser.add_argument("--data-dir", type=str, default="../data/processed", help="Directory with manifest & tensors")
    parser.add_argument("--output-dir", type=str, default="../models", help="Output directory for .pt models")
    parser.add_argument("--epochs", type=int, default=30)
    args = parser.parse_args()

    if args.instrument == "all":
        import json
        mapping = json.load(open("../data/instrument_mapping.json"))
        instruments = list(mapping.keys())
        for inst in instruments:
            logger.info(f"--- Training {inst.upper()} ---")
            train_unified(inst, args.data_dir, args.output_dir, args.epochs)
    else:
        train_unified(args.instrument, args.data_dir, args.output_dir, args.epochs)
