import os
import json
import logging
import argparse
from typing import Dict, Any

from src.aggregator import InstrumentAggregator

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def evaluate_baseline(test_dir: str, output_file: str, threshold: float = 0.0):
    """
    Evaluates the currently trained Baseline model on a set of real songs.
    Saves the exact probability scores into a JSON file for Step 2 tracking.
    """
    if not os.path.exists(test_dir):
        logger.error(f"Test directory not found: {test_dir}. Please place 15-20 test audio files here.")
        return

    audio_extensions = (".wav", ".mp3", ".flac", ".ogg")
    test_files = [
        f for f in os.listdir(test_dir)
        if f.lower().endswith(audio_extensions)
    ]

    if not test_files:
        logger.error(f"No audio files found in {test_dir}. Add some test songs to establish a baseline.")
        return

    logger.info(f"Found {len(test_files)} test songs. Initializing Instrument Aggregator...")

    # Initialize aggregator (loads all .pt models from models/ dir)
    # Using 'cpu' to ensure compatibility regardless of local CUDA setup
    aggregator = InstrumentAggregator(device="cpu")
    active = aggregator.get_active_detectors()
    logger.info(f"Active Baseline Detectors: {active}")

    results = []

    for file_name in test_files:
        file_path = os.path.join(test_dir, file_name)
        logger.info(f"Analyzing {file_name}...")

        # We pass threshold=0.0 so we capture EVERY raw probability, not just the thresholded ones
        detection_result = aggregator.detect_all(audio_path=file_path, threshold=0.0)

        # Format the result compactly, preserving the raw scores
        song_result: Dict[str, Any] = {
            "song": file_name,
        }

        instruments_detected = detection_result.get("instruments", [])
        for det in instruments_detected:
            if det["confidence"] is not None:
                # Add the raw confidence score to the result dict
                song_result[det["instrument"]] = det["confidence"]

        results.append(song_result)

    # Calculate some aggregated stats for the baseline
    stats = {}
    for inst in active:
        scores = [r.get(inst, 0.0) for r in results if inst in r]
        if scores:
            stats[inst] = {
                "avg_score": round(sum(scores) / len(scores), 4),
                "max_score": round(max(scores), 4),
                "min_score": round(min(scores), 4),
            }

    final_output = {
        "metadata": {
            "num_songs": len(test_files),
            "detectors_used": active,
            "note": "Raw probability scores (Baseline)"
        },
        "stats": stats,
        "results": results
    }

    # Save to JSON
    os.makedirs(os.path.dirname(output_file) or ".", exist_ok=True)
    with open(output_file, "w") as f:
        json.dump(final_output, f, indent=2)

    logger.info(f"✅ Baseline evaluation complete! Results saved to {output_file}")

    print("\n--- BASELINE STATS ---")
    for inst, istat in stats.items():
        print(f"{inst.ljust(15)} : Avg {istat['avg_score']:.3f} | Max {istat['max_score']:.3f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate baseline models on real songs.")
    parser.add_argument("--test-dir", type=str, default="../tests/audio", help="Directory containing test songs")
    parser.add_argument("--output", type=str, default="../v2_results.json", help="Output JSON file for baseline metrics")
    args = parser.parse_args()

    evaluate_baseline(args.test_dir, args.output)
