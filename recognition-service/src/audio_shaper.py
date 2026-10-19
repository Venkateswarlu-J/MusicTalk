import os
import json
import logging
import argparse
from typing import List, Dict, Tuple
import numpy as np
import librosa
import torch
from tqdm import tqdm

from src.feature_extraction import extract_features_from_audio, SAMPLE_RATE, NUM_SAMPLES

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audio_shaper")

def load_instrument_mapping(mapping_path: str) -> dict:
    """Load standard instrument names mapping."""
    if not os.path.exists(mapping_path):
        logger.warning(f"Mapping file {mapping_path} not found. Returning empty map.")
        return {}
    with open(mapping_path, 'r') as f:
        return json.load(f)

def normalize_label(raw_label: str, mapping: dict) -> str:
    """Normalize a dataset-specific label into our standard vocabulary."""
    raw_label_lower = raw_label.lower().strip()
    for standard_name, aliases in mapping.items():
        if raw_label_lower == standard_name.lower():
            return standard_name
        for alias in aliases:
            if raw_label_lower == alias.lower():
                return standard_name
    return raw_label_lower  # fallback if not found

class UniversalAudioShaper:
    """
    Step 7 & 8: Universal Audio Shaper.
    Converts various datasets (IRMAS, OpenMIC, MedleyDB) into a unified,
    fixed-size Log-Mel Spectrogram format for standardized training.
    """
    def __init__(self, data_root: str, output_dir: str, mapping_path: str):
        self.data_root = data_root
        self.output_dir = output_dir
        self.mapping = load_instrument_mapping(mapping_path)
        self.manifest = []
        os.makedirs(self.output_dir, exist_ok=True)

    def process_audio(self, audio_path: str) -> torch.Tensor:
        """Loads audio, normalizes sample rate, pads/trims to exact duration, extracts Log-Mel."""
        y, sr = librosa.load(audio_path, sr=SAMPLE_RATE, mono=True)
        # Peak normalization must work for both positive and negative waveforms.
        peak = float(np.max(np.abs(y))) if y.size else 0.0
        if peak > 1e-8:
            y = y / peak

        # We reuse the exact extraction logic the live inference uses
        return extract_features_from_audio(y, sr)

    def parse_irmas(self):
        """Parse IRMAS dataset (one instrument per folder)."""
        irmas_dir = os.path.join(self.data_root, "IRMAS-TrainingData")
        if not os.path.exists(irmas_dir):
            logger.warning(f"IRMAS directory not found at {irmas_dir}. Skipping.")
            return

        logger.info(f"Scanning IRMAS dataset at {irmas_dir}...")
        for folder in os.listdir(irmas_dir):
            folder_path = os.path.join(irmas_dir, folder)
            if not os.path.isdir(folder_path):
                continue

            # Subfolder name is the raw label
            standard_label = normalize_label(folder, self.mapping)

            audio_files = [f for f in os.listdir(folder_path) if f.lower().endswith((".wav", ".mp3", ".flac"))]
            for file_name in tqdm(audio_files, desc=f"Shaping IRMAS: {folder} -> {standard_label}"):
                file_path = os.path.join(folder_path, file_name)

                try:
                    tensor = self.process_audio(file_path)

                    # Save standard tensor
                    save_name = f"irmas_{folder}_{file_name}.pt"
                    save_path = os.path.join(self.output_dir, save_name)
                    torch.save(tensor, save_path)

                    # Add to manifest
                    self.manifest.append({
                        "source": "IRMAS",
                        "audio_path": file_path,
                        "tensor_file": save_name,
                        "instrument_labels": [standard_label] # multi-label format
                    })
                except Exception as e:
                    logger.error(f"Failed to process {file_path}: {e}")

    def parse_openmic(self):
        """Parse OpenMIC-2018 dataset."""
        openmic_dir = os.path.join(self.data_root, "openmic-2018")
        if not os.path.exists(openmic_dir):
            logger.info("OpenMIC dataset not present. Skipping.")
            return

        logger.info(f"Scanning OpenMIC dataset at {openmic_dir}...")
        import pandas as pd

        csv_path = os.path.join(openmic_dir, 'openmic-2018-aggregated-labels.csv')
        audio_dir = os.path.join(openmic_dir, 'audio')

        if not os.path.exists(csv_path) or not os.path.exists(audio_dir):
            logger.warning(f"OpenMIC aggregated labels CSV or audio folder missing at {csv_path}. Skipping.")
            return

        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            logger.error(f"Failed to read OpenMIC CSV: {e}")
            return

        # OpenMIC labels are not exhaustive: finite relevance values are known labels,
        # while blank/NaN relevance values are unknown and must be masked during training.
        audio_labels = {}
        for _, row in df.iterrows():
            sample_key = str(row.get("sample_key", "")).strip()
            instrument = str(row.get("instrument", "")).strip()
            if not sample_key or not instrument:
                continue
            standard_label = normalize_label(instrument, self.mapping)
            raw_relevance = row.get("relevance")
            try:
                relevance = float(raw_relevance)
            except (TypeError, ValueError):
                relevance = float("nan")
            if sample_key not in audio_labels:
                audio_labels[sample_key] = {}
            if not np.isfinite(relevance):
                audio_labels[sample_key][standard_label] = "unknown"
            else:
                audio_labels[sample_key][standard_label] = "positive" if relevance >= 0.5 else "negative"

        logger.info(f"Found {len(audio_labels)} OpenMIC clips with label-state records.")

        # Process each audio clip; skip clips with no known positive labels.
        for sample_key, label_states in tqdm(audio_labels.items(), desc="Shaping OpenMIC"):
            labels = [name for name, state in label_states.items() if state == "positive"]
            if not labels:
                # A clip may still contain useful known negatives, but keeping only clips
                # with at least one positive avoids writing mostly unlabeled audio here.
                # The validator/trainer still supports negative states for every retained clip.
                continue
            subfolder = sample_key[:3]
            file_name = f"{sample_key}.ogg"
            file_path = os.path.join(audio_dir, subfolder, file_name)

            if not os.path.exists(file_path):
                continue

            try:
                tensor = self.process_audio(file_path)
                save_name = f"openmic_{sample_key}.pt"
                save_path = os.path.join(self.output_dir, save_name)
                torch.save(tensor, save_path)

                self.manifest.append({
                    "source": "OpenMIC",
                    "audio_path": file_path,
                    "tensor_file": save_name,
                    "instrument_labels": labels,
                    "label_states": label_states
                })
            except Exception as e:
                logger.error(f"Failed to process OpenMIC {file_path}: {e}")

    def save_manifest(self):
        manifest_path = os.path.join(self.output_dir, "dataset_manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(self.manifest, f, indent=2)
        logger.info(f"Unified dataset manifest saved! Total samples: {len(self.manifest)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the Universal Audio Shaper.")
    parser.add_argument("--data-root", type=str, default="../data", help="Root folder for raw datasets (e.g., IRMAS, OpenMIC)")
    parser.add_argument("--output-dir", type=str, default="../data/processed", help="Output directory for unified tensors")
    parser.add_argument("--mapping", type=str, default="../data/instrument_mapping.json", help="Path to instrument mapping vocabulary")
    args = parser.parse_args()

    shaper = UniversalAudioShaper(
        data_root=args.data_root,
        output_dir=args.output_dir,
        mapping_path=args.mapping
    )

    # Process the datasets
    shaper.parse_irmas()
    shaper.parse_openmic()
    shaper.save_manifest()
