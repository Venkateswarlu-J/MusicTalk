"""Validate MusicTalk's shaped dataset manifest and feature tensors without training."""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import torch


def validate(data_dir: str):
    root = Path(data_dir).resolve()
    manifest_path = root / "dataset_manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("Manifest must be a non-empty JSON list")

    errors = []
    source_counts = Counter()
    label_counts = defaultdict(Counter)
    state_counts = defaultdict(Counter)
    seen = set()
    for i, item in enumerate(manifest):
        if not isinstance(item, dict):
            errors.append(f"row {i}: expected object")
            continue
        source = str(item.get("source", "unknown"))
        source_counts[source] += 1
        tensor_name = item.get("tensor_file")
        if not tensor_name:
            errors.append(f"row {i}: missing tensor_file")
        else:
            tensor_path = root / tensor_name
            if not tensor_path.is_file():
                errors.append(f"row {i}: tensor missing: {tensor_name}")
            else:
                try:
                    tensor = torch.load(tensor_path, map_location="cpu", weights_only=True)
                    if not isinstance(tensor, torch.Tensor) or tuple(tensor.shape) != (1, 128, 130):
                        errors.append(f"row {i}: invalid tensor shape/type: {tensor_name}")
                    elif not torch.isfinite(tensor).all():
                        errors.append(f"row {i}: non-finite tensor values: {tensor_name}")
                except Exception as exc:
                    errors.append(f"row {i}: cannot load {tensor_name}: {exc}")
        key = (source, str(item.get("audio_path", "")), str(tensor_name))
        if key in seen:
            errors.append(f"row {i}: duplicate manifest entry for {key}")
        seen.add(key)

        labels = item.get("instrument_labels", [])
        if not isinstance(labels, list):
            errors.append(f"row {i}: instrument_labels must be a list")
            labels = []
        for label in labels:
            label_counts[source][str(label)] += 1

        states = item.get("label_states")
        if source.lower() == "openmic":
            if not isinstance(states, dict):
                errors.append(
                    f"row {i}: OpenMIC label_states missing; legacy manifests cannot safely "
                    "treat absent labels as negatives. Re-run audio_shaper."
                )
            else:
                for label, state in states.items():
                    state = str(state).lower()
                    if state not in {"positive", "negative", "unknown"}:
                        errors.append(f"row {i}: invalid OpenMIC state {state!r} for {label!r}")
                    state_counts[str(label)][state] += 1
                    if state == "positive" and label not in labels:
                        errors.append(f"row {i}: positive label {label!r} missing from instrument_labels")

    print(f"Manifest: {manifest_path}")
    print(f"Samples: {len(manifest)}")
    print("Sources:", dict(source_counts))
    print("Positive labels by source:", {k: dict(v) for k, v in label_counts.items()})
    if state_counts:
        print("OpenMIC label states:", {k: dict(v) for k, v in state_counts.items()})
    print(f"Errors: {len(errors)}")
    for error in errors[:100]:
        print(f"ERROR: {error}")
    if len(errors) > 100:
        print(f"... {len(errors) - 100} additional errors omitted")
    return 1 if errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", default="../data/processed")
    args = parser.parse_args()
    raise SystemExit(validate(args.data_dir))
