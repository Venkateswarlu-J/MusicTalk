import os
import glob
import logging
import numpy as np
from typing import List, Dict, Any, Optional

from src.detector import InstrumentDetector
from src.feature_extraction import extract_sliding_windows

logger = logging.getLogger(__name__)

# Base directory for model checkpoints
MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")

# ==============================================================================
# DETECTOR_CONFIG: Maps instrument names to their model checkpoint files.
# Adding a new instrument to Recognition Service requires ONLY:
#   1. Training the model: python -m src.train --instrument <name> ...
#   2. Adding one line below to DETECTOR_CONFIG (or placing in models/ folder).
# ==============================================================================
DETECTOR_CONFIG = {
    "piano": os.path.join(MODELS_DIR, "piano_detector.pt"),
    "acoustic_guitar": os.path.join(MODELS_DIR, "acoustic_guitar_detector.pt"),
    "electric_guitar": os.path.join(MODELS_DIR, "electric_guitar_detector.pt"),
    "violin": os.path.join(MODELS_DIR, "violin_detector.pt"),
    "cello": os.path.join(MODELS_DIR, "cello_detector.pt"),
    "flute": os.path.join(MODELS_DIR, "flute_detector.pt"),
    "clarinet": os.path.join(MODELS_DIR, "clarinet_detector.pt"),
    "saxophone": os.path.join(MODELS_DIR, "saxophone_detector.pt"),
    "trumpet": os.path.join(MODELS_DIR, "trumpet_detector.pt"),
    "organ": os.path.join(MODELS_DIR, "organ_detector.pt"),
    "voice": os.path.join(MODELS_DIR, "voice_detector.pt"),
    "drums": os.path.join(MODELS_DIR, "drums_detector.pt"),
    "bass": os.path.join(MODELS_DIR, "bass_detector.pt"),
    "synthesizer": os.path.join(MODELS_DIR, "synthesizer_detector.pt"),
    "cymbals": os.path.join(MODELS_DIR, "cymbals_detector.pt"),
    "mallet_percussion": os.path.join(MODELS_DIR, "mallet_percussion_detector.pt")
}

CONFIDENCE_THRESHOLD = 0.50


class InstrumentAggregator:
    """
    Coordinates all configured instrument detectors.
    Fans out incoming audio to every detector and dynamically syncs with models on disk.
    """

    def __init__(self, config: Optional[Dict[str, str]] = None, device: str = "cpu"):
        self.config = dict(config or DETECTOR_CONFIG)
        self.device = device
        self.detectors: Dict[str, InstrumentDetector] = {}
        self.reload_detectors()

    def sync_models_from_disk(self):
        """Discover any new .pt detector model files in the models directory."""
        if os.path.exists(MODELS_DIR):
            for file_path in glob.glob(os.path.join(MODELS_DIR, "*_detector.pt")):
                filename = os.path.basename(file_path)
                instrument_name = filename.replace("_detector.pt", "")
                if instrument_name not in self.detectors:
                    logger.info(f"Auto-discovered new instrument detector: {instrument_name} from {file_path}")
                    self.detectors[instrument_name] = InstrumentDetector(
                        instrument_name=instrument_name,
                        model_path=file_path,
                        device=self.device
                    )

        # Ensure all from DETECTOR_CONFIG exist in detectors map
        for inst_name, model_path in DETECTOR_CONFIG.items():
            if inst_name not in self.detectors:
                self.detectors[inst_name] = InstrumentDetector(
                    instrument_name=inst_name,
                    model_path=model_path,
                    device=self.device
                )

    def reload_detectors(self):
        """Initialize or reload all detectors from config and disk."""
        self.detectors.clear()
        for instrument_name, model_path in DETECTOR_CONFIG.items():
            detector = InstrumentDetector(
                instrument_name=instrument_name,
                model_path=model_path,
                device=self.device
            )
            self.detectors[instrument_name] = detector
        self.sync_models_from_disk()

    def get_active_detectors(self) -> List[str]:
        """Returns list of instrument names that have valid loaded model checkpoints."""
        self.sync_models_from_disk()
        for det in self.detectors.values():
            det.check_and_reload_if_needed()
        return [
            name for name, det in self.detectors.items()
            if det.model_available
        ]

    def detect_all(self, audio_path: str, threshold: float = CONFIDENCE_THRESHOLD) -> Dict[str, Any]:
        """
        Fan out audio to all detectors and aggregate predictions.
        Always return all configured detectors with their scores.
        """
        self.sync_models_from_disk()
        all_scores = []
        detected_instruments = []

        # Iterate in sorted order for consistent display
        for instrument_name in sorted(self.detectors.keys()):
            detector = self.detectors[instrument_name]
            result = detector.predict(audio_path)
            all_scores.append(result)

            if result["model_available"] and result["confidence"] is not None:
                if result["confidence"] >= threshold:
                    detected_instruments.append(result)

        # Sort detected instruments descending by confidence
        detected_instruments.sort(key=lambda x: x["confidence"], reverse=True)

        return {
            "instruments": detected_instruments,
            "all_scores": all_scores
        }

    def detect_timeline(self, audio_path: str, window_sec: float = 3.0, hop_sec: float = 1.5) -> Dict[str, Any]:
        """
        Step 16-20: Full Song Analysis with Timeline and Aggregation.
        Splits the audio into sliding windows, runs inference, and calculates occurrence.
        """
        self.sync_models_from_disk()

        # Step 18: Per-instrument thresholds. Default baseline is 0.50 for all until optimized via V2.
        THRESHOLDS = {
            "piano": 0.50,
            "acoustic_guitar": 0.50,
            "electric_guitar": 0.50,
            "violin": 0.50,
            "cello": 0.50,
            "flute": 0.50,
            "clarinet": 0.50,
            "saxophone": 0.50,
            "trumpet": 0.50,
            "organ": 0.50,
            "voice": 0.50,
            "drums": 0.50,
            "bass": 0.50,
            "synthesizer": 0.50,
            "cymbals": 0.50,
            "mallet_percussion": 0.50
        }

        # 1. Extract sliding windows
        try:
            windows_data = extract_sliding_windows(audio_path, window_sec=window_sec, hop_sec=hop_sec)
        except Exception as e:
            logger.error(f"Failed to extract windows from {audio_path}: {e}")
            return {"instruments": [], "all_scores": [], "error": str(e)}

        total_windows = len(windows_data)
        detected_instruments = []
        all_instrument_scores = []
        timeline = []

        if total_windows == 0:
            return {"instruments": [], "all_scores": [], "timeline": []}

        # 2. Run batched inference per detector
        for instrument_name in sorted(self.detectors.keys()):
            detector = self.detectors[instrument_name]
            threshold = THRESHOLDS.get(instrument_name, CONFIDENCE_THRESHOLD)

            if not detector.model_available:
                all_instrument_scores.append({
                    "instrument": instrument_name,
                    "confidence": None,
                    "occurrence": 0.0,
                    "model_available": False,
                    "checkpoint": "none"
                })
                continue

            window_results = detector.predict_windows(windows_data)
            if not window_results:
                all_instrument_scores.append({
                    "instrument": instrument_name,
                    "confidence": None,
                    "occurrence": 0.0,
                    "model_available": True,
                    "checkpoint": detector.checkpoint_info
                })
                continue

            confidences = [w["confidence"] for w in window_results]
            above_thresh = [c for c in confidences if c >= threshold]

            occurrence = len(above_thresh) / total_windows
            p90_conf = float(np.percentile(confidences, 90))

            instr_result = {
                "instrument": instrument_name,
                "confidence": round(p90_conf, 4),
                "occurrence": round(occurrence, 4),
                "threshold_used": threshold,
                "model_available": True,
                "checkpoint": detector.checkpoint_info
            }
            all_instrument_scores.append(instr_result)

            # Detected condition:
            # If occurrence > 0.15 OR (for short recordings <= 3 windows: at least 1 window above threshold)
            is_detected = (occurrence > 0.15) or (total_windows <= 3 and len(above_thresh) > 0 and p90_conf >= threshold)
            if is_detected:
                segments = []
                current_segment = None

                for w in window_results:
                    if w["confidence"] >= threshold:
                        if current_segment is None:
                            current_segment = {"start": w["start"], "end": w["end"]}
                        else:
                            current_segment["end"] = w["end"]
                    else:
                        if current_segment is not None:
                            segments.append(current_segment)
                            current_segment = None

                if current_segment is not None:
                    segments.append(current_segment)

                instr_result["segments"] = segments
                detected_instruments.append(instr_result)
                timeline.append({
                    "instrument": instrument_name,
                    "segments": segments
                })

        detected_instruments.sort(key=lambda x: x["confidence"] * x["occurrence"], reverse=True)

        return {
            "instruments": detected_instruments,
            "all_scores": all_instrument_scores,
            "timeline": timeline,
            "metadata": {
                "window_sec": window_sec,
                "hop_sec": hop_sec,
                "total_windows": total_windows
            }
        }
