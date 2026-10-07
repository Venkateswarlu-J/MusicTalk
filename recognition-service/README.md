# Recognition Service (Python / FastAPI)

Microservice for independent binary musical instrument recognition from audio clips.

## Tech Stack
- Python 3.11+
- FastAPI & Uvicorn
- PyTorch (CPU or CUDA)
- Librosa & SoundFile for audio processing

## Architecture
- **Stateless**: Accepts audio uploads, extracts fixed-size normalized log-mel spectrograms (128 mel bands, 3 seconds @ 22050 Hz), and evaluates independently against all trained instrument models.
- **Dynamic Extensibility**: Adding an instrument model requires only:
  1. Training the model: `python -m src.train --instrument <name>`
  2. Adding the `.pt` path in `src/aggregator.py:DETECTOR_CONFIG`
- **Honesty Rule**: If a model checkpoint does not exist, the API explicitly returns `"model_available": false` and `null` confidence. Never generates fake scores.

## Setup & Running

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Train Models (on IRMAS dataset)
To train a single instrument (e.g. Piano):
```bash
python -m src.train --instrument piano --data-dir "M:\204\archive\IRMAS-TrainingData" --epochs 25
```

To train all 11 instruments sequentially:
```bash
python -m src.train --instrument all --data-dir "M:\204\archive\IRMAS-TrainingData" --epochs 25
```

### 3. Start the Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

- `GET /health` — Check service status and list active detectors
- `POST /recognize` — Multipart upload of audio file (`.wav`, `.mp3`, etc.)
- `POST /admin/reload-models` — Reload model checkpoints from disk without server restart
