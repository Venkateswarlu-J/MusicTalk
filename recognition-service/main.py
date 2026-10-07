import os
import shutil
import tempfile
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, UploadFile, File, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mutagen

from src.aggregator import InstrumentAggregator, CONFIDENCE_THRESHOLD
from src.continuous_learner import ContinuousLearner
from src.model_status import get_model_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recognition-service")

app = FastAPI(
    title="MusicTalk Recognition Service",
    description="Microservice for independent binary musical instrument recognition.",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize aggregator and continuous learner
aggregator = InstrumentAggregator()
models_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
continuous_learner = ContinuousLearner(models_dir)


def extract_id3_metadata(file_path: str) -> Dict[str, Any]:
    """Extract audio metadata (title, artist, album, genre, duration) using mutagen."""
    meta: Dict[str, Any] = {
        "title": None,
        "artist": None,
        "album": None,
        "genre": None,
        "duration_sec": None,
    }
    try:
        audio = mutagen.File(file_path, easy=True)
        if audio is not None:
            if hasattr(audio, "info") and audio.info and hasattr(audio.info, "length"):
                meta["duration_sec"] = round(float(audio.info.length), 2)
            if "title" in audio and audio["title"]:
                meta["title"] = str(audio["title"][0]).strip()
            if "artist" in audio and audio["artist"]:
                meta["artist"] = str(audio["artist"][0]).strip()
            if "album" in audio and audio["album"]:
                meta["album"] = str(audio["album"][0]).strip()
            if "genre" in audio and audio["genre"]:
                meta["genre"] = str(audio["genre"][0]).strip()
    except Exception as e:
        logger.warning(f"Could not extract ID3 tags from {file_path}: {e}")
    return meta


class InstrumentScore(BaseModel):
    instrument: str
    confidence: Optional[float] = None
    model_available: bool
    checkpoint: str


class RecognitionResponse(BaseModel):
    instruments: List[InstrumentScore]
    all_scores: List[InstrumentScore]
    metadata: Optional[Dict[str, Any]] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    active_detectors: List[str]
    trained_detectors: List[str]
    untrained_detectors: List[str]
    total_configured_detectors: int


@app.get("/health", response_model=HealthResponse)
def health_check():
    """Returns service health status and list of currently active instrument detectors."""
    active = aggregator.get_active_detectors()
    trained = [name for name, det in aggregator.detectors.items() if det.model_available]
    untrained = [name for name, det in aggregator.detectors.items() if not det.model_available]
    return {
        "status": "ok",
        "service": "recognition-service",
        "active_detectors": active,
        "trained_detectors": trained,
        "untrained_detectors": untrained,
        "total_configured_detectors": len(aggregator.detectors)
    }


@app.post("/recognize")
async def recognize_audio(
    file: UploadFile = File(...),
):
    """
    Accepts an audio file upload, extracts sliding log-mel windows, and runs all
    instrument detectors to build a timeline and calculate aggregated occurrence.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Uploaded file has no filename.")

    # Validate file extension
    valid_extensions = (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".webm", ".wma", ".opus")
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{file.filename}'. Supported: {valid_extensions}"
        )

    # Save to temporary file for audio decoding
    suffix = os.path.splitext(file.filename)[1].lower()
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        shutil.copyfileobj(file.file, temp_file)
        temp_file.close()

        logger.info(f"Processing audio recognition for: {file.filename}")
        # V2: Run timeline detection (Step 19-22)
        results = aggregator.detect_timeline(temp_file.name, window_sec=3.0, hop_sec=1.5)

        # In case timeline fails
        if "error" in results:
            raise ValueError(results["error"])

        results["metadata"] = extract_id3_metadata(temp_file.name)
        return results

    except ValueError as e:
        logger.error(f"Audio processing error: {e}")
        raise HTTPException(status_code=422, detail=f"Audio decoding error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during recognition: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Recognition failed: {str(e)}")
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file.name):
            try:
                os.remove(temp_file.name)
            except Exception:
                pass


@app.post("/admin/reload-models")
def reload_models():
    """Reload all instrument detector models from disk (e.g., after training new models)."""
    aggregator.reload_detectors()
    active = aggregator.get_active_detectors()
    return {
        "status": "reloaded",
        "active_detectors": active
    }


@app.post("/admin/register-training-sample")
async def register_training_sample(
    file_path: str,
    confidences: Dict[str, float],
    background_tasks: BackgroundTasks
):
    """
    Register an uploaded file as a training sample for continuous learning.
    Automatically triggers fine-tuning if enough samples are collected.
    """
    continuous_learner.register_training_sample(file_path, confidences)

    # Trigger asynchronous fine-tuning for instruments with enough samples
    for instrument in confidences.keys():
        stats = continuous_learner.get_training_stats(instrument)
        if stats["total_samples_collected"] >= 10:  # Fine-tune when we have 10+ samples
            background_tasks.add_task(
                continuous_learner.fine_tune_model_async,
                instrument,
                epochs=3,
                batch_size=8,
                learning_rate=1e-4
            )
            logger.info(f"Scheduled fine-tuning for {instrument} ({stats['total_samples_collected']} samples)")

    return {
        "status": "registered",
        "file_path": file_path,
        "instruments": list(confidences.keys())
    }


@app.get("/admin/training-stats")
def get_training_stats():
    """Get continuous learning training statistics for all instruments."""
    instruments = ["piano", "acoustic_guitar", "electric_guitar", "violin", "cello",
                   "flute", "clarinet", "saxophone", "trumpet", "organ", "voice"]
    stats = {instr: continuous_learner.get_training_stats(instr) for instr in instruments}
    return {"training_stats": stats}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

@app.get("/models/status")
def model_status():
    """Dynamically return the status of all configured instrument models and their baseline accuracy."""
    return get_model_status(aggregator)
