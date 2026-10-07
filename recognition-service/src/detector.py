import os
import logging
from typing import Dict, Any, Optional
import torch

from src.model import InstrumentCNN
from src.feature_extraction import extract_features

logger = logging.getLogger(__name__)


class InstrumentDetector:
    """
    Detector for a single musical instrument.
    Encapsulates loading one trained .pt model checkpoint and running inference.

    Honesty Rule enforcement:
    If no trained model exists at model_path, predict() returns model_available=False
    and confidence=None. Never fakes or randomly generates a score.
    """

    def __init__(self, instrument_name: str, model_path: str, device: str = "cpu"):
        self.instrument_name = instrument_name
        self.model_path = model_path
        self.device = torch.device(device)
        self.model: Optional[InstrumentCNN] = None
        self.model_available = False
        self.checkpoint_info = "none"
        self._last_loaded_mtime: Optional[float] = None

        self._load_model()

    def _load_model(self):
        if not os.path.exists(self.model_path):
            logger.debug(
                f"[{self.instrument_name}] Model file not found at '{self.model_path}'."
            )
            self.model_available = False
            self.model = None
            return

        try:
            mtime = os.path.getmtime(self.model_path)
            model = InstrumentCNN().to(self.device)
            state = torch.load(self.model_path, map_location=self.device, weights_only=True)

            # Support both raw state_dict and checkpoint dict
            if isinstance(state, dict) and "state_dict" in state:
                model.load_state_dict(state["state_dict"])
                self.checkpoint_info = state.get("checkpoint_info", os.path.basename(self.model_path))
            elif isinstance(state, dict):
                model.load_state_dict(state)
                self.checkpoint_info = os.path.basename(self.model_path)
            else:
                raise ValueError(f"Unrecognized checkpoint format in {self.model_path}")

            model.eval()
            self.model = model
            self.model_available = True
            self._last_loaded_mtime = mtime
            logger.info(
                f"[{self.instrument_name}] Successfully loaded model checkpoint '{self.checkpoint_info}'"
            )
        except Exception as e:
            logger.error(
                f"[{self.instrument_name}] Failed to load model from '{self.model_path}': {e}"
            )
            self.model = None
            self.model_available = False

    def check_and_reload_if_needed(self):
        """Auto-detect if model checkpoint was newly created or updated on disk."""
        if os.path.exists(self.model_path):
            try:
                current_mtime = os.path.getmtime(self.model_path)
                if not self.model_available or self._last_loaded_mtime != current_mtime:
                    logger.info(f"[{self.instrument_name}] New model checkpoint detected on disk. Hot-loading...")
                    self._load_model()
            except Exception as e:
                logger.warning(f"[{self.instrument_name}] Could not check file mtime: {e}")
        elif self.model_available:
            self.model_available = False
            self.model = None

    def predict(self, audio_path: str) -> Dict[str, Any]:
        """
        Run inference on the FIRST 3 SECONDS of an audio file for this instrument.
        """
        self.check_and_reload_if_needed()

        if not self.model_available or self.model is None:
            return {
                "instrument": self.instrument_name,
                "confidence": None,
                "model_available": False,
                "checkpoint": "none"
            }

        features = extract_features(audio_path).to(self.device).unsqueeze(0)

        with torch.no_grad():
            logit = self.model(features)
            confidence = torch.sigmoid(logit).item()

        return {
            "instrument": self.instrument_name,
            "confidence": round(confidence, 4),
            "model_available": True,
            "checkpoint": self.checkpoint_info
        }

    def predict_windows(self, windows_data: list) -> list:
        """
        Run inference across multiple extracted window tensors.
        Returns a list of dicts: [{"start": x, "end": y, "confidence": c}]
        """
        self.check_and_reload_if_needed()

        results = []
        if not self.model_available or self.model is None or not windows_data:
            return results

        # Create a batched tensor for faster inference
        tensors = [w["tensor"] for w in windows_data]
        # Stack creates shape (Batch_Size, Channels, Mel_Bands, Time_Frames)
        batch_tensor = torch.stack(tensors, dim=0).to(self.device)

        with torch.no_grad():
            logits = self.model(batch_tensor)
            confidences = torch.sigmoid(logits).squeeze(-1).tolist()

        # Fallback to scalar list if single window returns float instead of list
        if not isinstance(confidences, list):
            confidences = [confidences]

        for i, w in enumerate(windows_data):
            results.append({
                "start": w["start"],
                "end": w["end"],
                "confidence": round(confidences[i], 4)
            })

        return results
