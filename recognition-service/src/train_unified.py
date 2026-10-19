"""Train one binary detector from the unified manifest.

OpenMIC labels are partial. Only explicit positive/negative states are used for a
target instrument; unknown/missing states are excluded from that target's dataset.
IRMAS is treated as single-label folder classification for its supported classes.
"""
import argparse
import json
import logging
import os
import random
from datetime import datetime
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from tqdm import tqdm

from src.model import InstrumentCNN

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("train_unified")


def label_for(item: dict, target: str):
    """Return 1, 0, or None (unknown/not labeled) for one target."""
    target = target.strip().lower()
    source = str(item.get("source", "")).strip().lower()
    labels = {str(x).strip().lower() for x in item.get("instrument_labels", [])}

    if source == "irmas":
        # IRMAS-TrainingData uses one instrument folder per sample.
        return 1 if target in labels else 0

    states = item.get("label_states")
    if isinstance(states, dict):
        state = str(states.get(target, "unknown")).strip().lower()
        if state in {"positive", "present", "1", "true"}:
            return 1
        if state in {"negative", "absent", "0", "false"}:
            return 0
        return None

    # Old OpenMIC manifests contain only positives and cannot safely define negatives.
    if source == "openmic":
        raise ValueError(
            "This OpenMIC manifest has no label_states. Re-run src.audio_shaper to "
            "create a manifest with positive/negative/unknown labels; do not train "
            "by treating missing OpenMIC labels as negatives."
        )

    # Explicitly labeled third-party formats can use the legacy single/multilabel contract.
    return 1 if target in labels else 0


class UnifiedBinaryDataset(Dataset):
    def __init__(self, items, target, data_dir, augment=False):
        self.data_dir = Path(data_dir)
        self.target = target.lower()
        self.augment = augment
        self.samples = []
        self.skipped_missing_tensor = 0
        for item in items:
            label = label_for(item, self.target)
            if label is None:
                continue
            tensor_path = self.data_dir / item.get("tensor_file", "")
            if not tensor_path.is_file():
                self.skipped_missing_tensor += 1
                continue
            self.samples.append((item, float(label)))

        self.pos_count = sum(label == 1.0 for _, label in self.samples)
        self.neg_count = sum(label == 0.0 for _, label in self.samples)
        self.pos_weight = self.neg_count / self.pos_count if self.pos_count else 1.0

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        item, label = self.samples[idx]
        path = self.data_dir / item["tensor_file"]
        tensor = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(tensor, torch.Tensor):
            raise TypeError(f"Feature file is not a tensor: {path}")
        if tuple(tensor.shape) != (1, 128, 130):
            raise ValueError(f"Unexpected feature shape {tuple(tensor.shape)} in {path}; expected (1, 128, 130)")
        if not torch.isfinite(tensor).all():
            raise ValueError(f"Non-finite feature values in {path}")

        # Features are normalized to [0, 1] by feature_extraction.py.
        if self.augment and random.random() < 0.5:
            gain = random.uniform(0.9, 1.1)
            tensor = (tensor * gain).clamp(0.0, 1.0)
        return tensor, torch.tensor([label], dtype=torch.float32)


def train_unified(instrument, data_dir, output_dir, epochs=30, batch_size=32,
                  lr=1e-4, device_name="auto", seed=42):
    if epochs < 1 or batch_size < 1:
        raise ValueError("epochs and batch-size must be positive integers")
    device = torch.device(
        "cuda" if device_name == "auto" and torch.cuda.is_available()
        else "cpu" if device_name == "auto" else device_name
    )
    data_path = Path(data_dir).resolve()
    manifest_path = data_path / "dataset_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Manifest not found: {manifest_path}. Run src.audio_shaper first.")
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("dataset_manifest.json must contain a non-empty JSON list")

    # Deterministic sample-level split. A source-level group split can be added once the
    # shaper records reliable original recording/group identifiers for every dataset.
    rng = random.Random(seed)
    ordered = list(manifest)
    rng.shuffle(ordered)
    if len(ordered) < 2:
        raise ValueError("At least two manifest entries are required for train/validation split")
    split = min(max(int(len(ordered) * 0.8), 1), len(ordered) - 1)
    train_items, val_items = ordered[:split], ordered[split:]

    train_ds = UnifiedBinaryDataset(train_items, instrument, data_path, augment=True)
    val_ds = UnifiedBinaryDataset(val_items, instrument, data_path, augment=False)
    if not len(train_ds) or not len(val_ds):
        raise ValueError(
            f"No usable labeled examples for '{instrument}' in train/validation split. "
            "Check label mapping and OpenMIC label_states."
        )
    if train_ds.pos_count == 0 or train_ds.neg_count == 0:
        raise ValueError(
            f"Training split for '{instrument}' needs both positive and negative labels; "
            f"got positive={train_ds.pos_count}, negative={train_ds.neg_count}."
        )
    if val_ds.pos_count == 0 or val_ds.neg_count == 0:
        logger.warning(
            "Validation split does not contain both classes (positive=%d, negative=%d); "
            "precision/recall/F1 may be incomplete.",
            val_ds.pos_count, val_ds.neg_count
        )

    logger.info(
        "%s | device=%s | train pos/neg=%d/%d | val pos/neg=%d/%d | skipped missing tensors=%d",
        instrument, device, train_ds.pos_count, train_ds.neg_count,
        val_ds.pos_count, val_ds.neg_count,
        train_ds.skipped_missing_tensor + val_ds.skipped_missing_tensor
    )
    generator = torch.Generator().manual_seed(seed)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, generator=generator)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    model = InstrumentCNN().to(device)
    criterion = nn.BCEWithLogitsLoss(
        pos_weight=torch.tensor([train_ds.pos_weight], dtype=torch.float32, device=device)
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=1e-4)
    best_f1 = -1.0
    best_state = None
    best_metrics = {}

    for epoch in range(1, epochs + 1):
        model.train()
        train_loss_sum = 0.0
        train_count = 0
        for x, y in tqdm(train_loader, desc=f"{instrument} epoch {epoch}/{epochs}", leave=False):
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            train_loss_sum += loss.item() * len(y)
            train_count += len(y)

        model.eval()
        val_loss_sum = 0.0
        tp = fp = fn = 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                logits = model(x)
                val_loss_sum += criterion(logits, y).item() * len(y)
                pred = torch.sigmoid(logits) >= 0.5
                truth = y >= 0.5
                tp += int((pred & truth).sum().item())
                fp += int((pred & ~truth).sum().item())
                fn += int((~pred & truth).sum().item())

        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        train_loss = train_loss_sum / max(train_count, 1)
        val_loss = val_loss_sum / max(len(val_ds), 1)
        logger.info(
            "epoch=%d train_loss=%.5f val_loss=%.5f precision=%.4f recall=%.4f f1=%.4f",
            epoch, train_loss, val_loss, precision, recall, f1
        )
        if f1 > best_f1:
            best_f1 = f1
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
            best_metrics = {
                "val_loss": val_loss, "val_precision": precision, "val_recall": recall,
                "val_f1": f1, "epoch": epoch
            }

    # Never overwrite a live checkpoint. Save to a unique candidate filename and require
    # an explicit later promotion step after evaluation/review.
    output_path = Path(output_dir).resolve()
    output_path.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    candidate = output_path / f"{instrument}_candidate_{timestamp}.pt"
    if candidate.exists():
        raise FileExistsError(f"Refusing to overwrite existing candidate checkpoint: {candidate}")
    torch.save({
        "instrument": instrument,
        "state_dict": best_state,
        **best_metrics,
        "threshold": 0.5,
        "seed": seed,
        "dataset_manifest": str(manifest_path),
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "checkpoint_info": f"{instrument}_candidate_{timestamp}"
    }, candidate)
    logger.info("Saved candidate checkpoint (not promoted): %s", candidate)
    return str(candidate), best_metrics


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a candidate binary detector from the unified dataset.")
    parser.add_argument("--instrument", required=True, help="Instrument name or 'all'")
    parser.add_argument("--data-dir", default="../data/processed", help="Directory containing manifest and .pt tensors")
    parser.add_argument("--output-dir", default="../models/candidates", help="Candidate checkpoint directory; never live models/")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--device", default="auto", help="auto, cpu, cuda, or cuda:0")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if args.instrument.lower() == "all":
        with open(Path(args.data_dir).resolve() / "dataset_manifest.json", encoding="utf-8") as f:
            manifest = json.load(f)
        names = sorted({label for item in manifest for label in item.get("instrument_labels", [])})
        names = sorted(set(names) | {
            label for item in manifest for label, state in item.get("label_states", {}).items()
            if state in {"positive", "negative"}
        })
        if not names:
            raise SystemExit("No instrument labels found in manifest.")
        for name in names:
            train_unified(name, args.data_dir, args.output_dir, args.epochs,
                          args.batch_size, args.lr, args.device, args.seed)
    else:
        train_unified(args.instrument, args.data_dir, args.output_dir, args.epochs,
                      args.batch_size, args.lr, args.device, args.seed)
