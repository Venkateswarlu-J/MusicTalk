import os
import random
import argparse
import logging
from typing import List, Tuple
from datetime import datetime

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from tqdm import tqdm

from src.model import InstrumentCNN
from src.feature_extraction import extract_features

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# IRMAS folder code to instrument name mapping
IRMAS_MAP = {
    "cel": "cello",
    "cla": "clarinet",
    "flu": "flute",
    "gac": "acoustic_guitar",
    "gel": "electric_guitar",
    "org": "organ",
    "pia": "piano",
    "sax": "saxophone",
    "tru": "trumpet",
    "vio": "violin",
    "voi": "voice"
}

# Reverse mapping
INSTRUMENT_TO_FOLDER = {v: k for k, v in IRMAS_MAP.items()}


class IRMASBinaryDataset(Dataset):
    """
    Dataset for binary instrument classification from IRMAS data.
    Loads positive audio files from the target instrument folder,
    and samples an equal number of negative audio files from other instrument folders.
    """

    def __init__(self, samples: List[Tuple[str, float]], cache_features: bool = True):
        """
        samples: list of (file_path, label) where label is 1.0 (positive) or 0.0 (negative)
        """
        self.samples = samples
        self.cache_features = cache_features
        self.cache = {}

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        file_path, label = self.samples[idx]

        if self.cache_features and idx in self.cache:
            features = self.cache[idx]
        else:
            try:
                features = extract_features(file_path)
                if self.cache_features:
                    self.cache[idx] = features
            except Exception as e:
                logger.warning(f"Error loading {file_path}: {e}. Returning zero tensor.")
                features = torch.zeros((1, 128, 130), dtype=torch.float32)

        return features, torch.tensor([label], dtype=torch.float32)


def collect_irmas_samples(
    data_dir: str,
    target_instrument: str,
    seed: int = 42
) -> Tuple[List[Tuple[str, float]], List[Tuple[str, float]]]:
    """
    Collect positive and negative samples for the target instrument.
    Returns (train_samples, val_samples).
    """
    random.seed(seed)

    if target_instrument not in INSTRUMENT_TO_FOLDER:
        valid_names = list(INSTRUMENT_TO_FOLDER.keys())
        raise ValueError(f"Unknown instrument '{target_instrument}'. Valid: {valid_names}")

    target_code = INSTRUMENT_TO_FOLDER[target_instrument]
    target_folder = os.path.join(data_dir, target_code)

    if not os.path.isdir(target_folder):
        raise FileNotFoundError(f"Target folder not found: {target_folder}")

    # Gather positive files
    pos_files = [
        os.path.join(target_folder, f)
        for f in os.listdir(target_folder)
        if f.lower().endswith((".wav", ".mp3", ".flac", ".ogg"))
    ]

    if not pos_files:
        raise ValueError(f"No audio files found in {target_folder}")

    num_pos = len(pos_files)
    logger.info(f"Found {num_pos} positive audio clips for instrument '{target_instrument}'")

    # Gather negative files from other instrument folders
    neg_files_pool = []
    for code, inst_name in IRMAS_MAP.items():
        if code == target_code:
            continue
        folder = os.path.join(data_dir, code)
        if os.path.isdir(folder):
            for f in os.listdir(folder):
                if f.lower().endswith((".wav", ".mp3", ".flac", ".ogg")):
                    neg_files_pool.append(os.path.join(folder, f))

    if not neg_files_pool:
        raise ValueError(f"No negative audio files found across other folders in {data_dir}")

    # Randomly sample negative files with 1:1 ratio
    random.shuffle(neg_files_pool)
    neg_files = neg_files_pool[:num_pos]
    logger.info(f"Sampled {len(neg_files)} negative audio clips from other instrument folders (1:1 ratio)")

    # Build labeled pairs
    all_pos = [(f, 1.0) for f in pos_files]
    all_neg = [(f, 0.0) for f in neg_files]

    # Split into 80% train, 20% val
    random.shuffle(all_pos)
    random.shuffle(all_neg)

    pos_split = int(0.8 * len(all_pos))
    neg_split = int(0.8 * len(all_neg))

    train_samples = all_pos[:pos_split] + all_neg[:neg_split]
    val_samples = all_pos[pos_split:] + all_neg[neg_split:]

    random.shuffle(train_samples)
    random.shuffle(val_samples)

    logger.info(f"Dataset split: {len(train_samples)} training samples, {len(val_samples)} validation samples")
    return train_samples, val_samples


def train_detector(
    instrument: str,
    data_dir: str,
    output_dir: str,
    epochs: int = 30,
    batch_size: int = 32,
    lr: float = 1e-4,
    device_name: str = "auto"
):
    """
    Train a binary InstrumentCNN detector for ONE musical instrument.
    """
    if device_name == "auto":
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    else:
        device = torch.device(device_name)

    logger.info(f"Starting training for instrument: {instrument} on device: {device}")

    # Prepare datasets
    train_samples, val_samples = collect_irmas_samples(data_dir, instrument)

    train_dataset = IRMASBinaryDataset(train_samples, cache_features=True)
    val_dataset = IRMASBinaryDataset(val_samples, cache_features=True)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False, num_workers=0)

    # Initialize model, loss, optimizer
    model = InstrumentCNN().to(device)
    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.5, patience=4)

    os.makedirs(output_dir, exist_ok=True)
    best_val_acc = 0.0
    best_checkpoint_path = os.path.join(output_dir, f"{instrument}_detector.pt")

    for epoch in range(1, epochs + 1):
        # Training phase
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        pbar = tqdm(train_loader, desc=f"Epoch {epoch:02d}/{epochs:02d} [Train]", leave=False)
        for x, y in pbar:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * len(y)
            preds = (torch.sigmoid(logits) >= 0.5).float()
            train_correct += (preds == y).sum().item()
            train_total += len(y)

            pbar.set_postfix({"loss": f"{loss.item():.4f}"})

        train_loss /= max(train_total, 1)
        train_acc = train_correct / max(train_total, 1)

        # Validation phase
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                logits = model(x)
                loss = criterion(logits, y)
                val_loss += loss.item() * len(y)
                preds = (torch.sigmoid(logits) >= 0.5).float()
                val_correct += (preds == y).sum().item()
                val_total += len(y)

        val_loss /= max(val_total, 1)
        val_acc = val_correct / max(val_total, 1)
        scheduler.step(val_acc)

        logger.info(
            f"Epoch {epoch:02d}/{epochs:02d} | "
            f"Train Loss: {train_loss:.4f} Acc: {train_acc:.4f} | "
            f"Val Loss: {val_loss:.4f} Acc: {val_acc:.4f}"
        )

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            checkpoint = {
                "instrument": instrument,
                "state_dict": model.state_dict(),
                "val_acc": val_acc,
                "val_loss": val_loss,
                "epoch": epoch,
                "timestamp": timestamp,
                "checkpoint_info": f"{instrument}_v1_epoch{epoch:02d}_acc{val_acc:.4f}_{timestamp}"
            }
            torch.save(checkpoint, best_checkpoint_path)
            logger.info(f"--> Saved new best checkpoint: {best_checkpoint_path} (Val Acc: {val_acc:.4f})")

    logger.info(
        f"Training complete for {instrument}. Best Validation Accuracy: {best_val_acc:.4f}. "
        f"Saved to: {best_checkpoint_path}"
    )
    return best_checkpoint_path, best_val_acc


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a binary InstrumentCNN detector on IRMAS data.")
    parser.add_argument(
        "--instrument",
        type=str,
        required=True,
        choices=list(INSTRUMENT_TO_FOLDER.keys()) + ["all"],
        help="Target instrument to train (or 'all' to train all 11 instruments sequentially)."
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=os.getenv("IRMAS_DATA_DIR", "data/IRMAS-TrainingData"),
        help="Path to IRMAS-TrainingData directory (defaults to 'data/IRMAS-TrainingData' or IRMAS_DATA_DIR env var)."
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"),
        help="Output directory for saved .pt model checkpoints."
    )
    parser.add_argument("--epochs", type=int, default=25, help="Number of training epochs.")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size.")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate.")
    parser.add_argument("--device", type=str, default="auto", help="Device (cpu, cuda, or auto).")

    args = parser.parse_args()

    if args.instrument == "all":
        for inst in INSTRUMENT_TO_FOLDER.keys():
            logger.info(f"\n{'='*60}\nTraining detector for: {inst.upper()}\n{'='*60}")
            train_detector(
                instrument=inst,
                data_dir=args.data_dir,
                output_dir=args.output_dir,
                epochs=args.epochs,
                batch_size=args.batch_size,
                lr=args.lr,
                device_name=args.device
            )
    else:
        train_detector(
            instrument=args.instrument,
            data_dir=args.data_dir,
            output_dir=args.output_dir,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            device_name=args.device
        )
