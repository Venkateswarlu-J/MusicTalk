# MusicTalk 🎵

<p align="center">
  <img src="frontend/public/musictalk.svg" alt="MusicTalk Logo" width="90" height="90" />
</p>

<p align="center">
  <strong>An AI-powered Music Instrument Recognition & Recommendation Platform</strong><br>
  Built with PyTorch, FastAPI, MySQL, React 18, and Microservices Architecture.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch" />
  <img src="https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License: MIT" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Supported Instruments](#-supported-instruments-11)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Quick Start Guide](#-quick-start-guide)
  - [Option A: Docker Compose (Fastest)](#option-a-docker-compose-fastest)
  - [Option B: One-Click Startup Scripts](#option-b-one-click-startup-scripts)
  - [Option C: Manual Service Launch](#option-c-manual-service-launch)
- [Configuration & Environment Variables](#-configuration--environment-variables)
- [API Reference](#-api-reference)
- [Model Training & IRMAS Dataset](#-model-training--irmas-dataset)
- [Continuous Learning Pipeline](#-continuous-learning-pipeline)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🌟 Overview

**MusicTalk** is an intelligent audio-analysis and discovery platform. It identifies specific musical instruments present in audio recordings (from uploaded `.mp3`/`.wav` files or live microphone streams) using a bank of independent binary **Convolutional Neural Networks (CNNs)**. It then provides personalized track recommendations based on detected instrument signatures, affinity graphs, and genre matching.

---

## 🏗️ System Architecture

```
                                  ┌────────────────────────┐
                                  │   Frontend (React/Vite)│
                                  │   http://localhost:5173│
                                  └───────────┬────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────┐
                                  │  API Gateway (FastAPI) │
                                  │   http://localhost:3000│
                                  └─────┬──────┬──────┬────┘
                                        │      │      │
                  ┌─────────────────────┘      │      └─────────────────────┐
                  ▼                            ▼                            ▼
        ┌───────────────────┐        ┌───────────────────┐        ┌───────────────────┐
        │Recognition Service│        │  Catalog Service  │        │Recommendation Svc │
        │  (PyTorch/FastAPI)│        │  (MySQL / FastAPI)│        │     (FastAPI)     │
        │   Port: 8000      │        │    Port: 8001     │        │    Port: 8002     │
        └───────────────────┘        └───────────────────┘        └───────────────────┘
                  ▲                            │
                  │                            ▼
        ┌───────────────────┐        ┌───────────────────┐
        │  PyTorch Models   │        │   MySQL Database  │
        │(11 Instrument CNN)│        │(Catalog & Tags DB)│
        └───────────────────┘        └───────────────────┘
```

---

## 🎻 Supported Instruments (11)

Each instrument is detected via an independent binary classifier trained on log-mel spectrogram features ($128$ mel bins, $22,050\text{ Hz}$, $3.0\text{s}$ window):

| Instrument | Code | Model Checkpoint | Status |
| :--- | :---: | :--- | :---: |
| 🎹 **Piano** | `pia` | `piano_detector.pt` | ✅ Trained |
| 🎸 **Acoustic Guitar** | `gac` | `acoustic_guitar_detector.pt` | ✅ Trained |
| ⚡ **Electric Guitar** | `gel` | `electric_guitar_detector.pt` | ✅ Trained |
| 🎤 **Voice / Vocals** | `voi` | `voice_detector.pt` | ✅ Trained |
| 🎻 **Violin** | `vio` | `violin_detector.pt` | ✅ Trained |
| 🎻 **Cello** | `cel` | `cello_detector.pt` | ✅ Trained |
| 🪈 **Flute** | `flu` | `flute_detector.pt` | ✅ Trained |
| 🎷 **Saxophone** | `sax` | `saxophone_detector.pt` | ✅ Trained |
| 🎺 **Trumpet** | `tru` | `trumpet_detector.pt` | ✅ Trained |
| 🎼 **Clarinet** | `cla` | `clarinet_detector.pt` | ✅ Trained |
| 🎹 **Organ** | `org` | `organ_detector.pt` | ✅ Trained |

---

## ✨ Key Features

1. **Multi-Model Audio Recognition**:
   - Independent evaluation of 11 musical instruments.
   - Outputs confidence scores with threshold gating ($0.50$ default).
   - "Honesty Rule": Explicitly reports `model_available: false` if weights are absent rather than hallucinating scores.

2. **Real-time Microphone Capture**:
   - High-fidelity in-browser recording with 16-bit PCM WAV encoding.
   - Visual waveform & timer animations with instant recognition.

3. **Intelligent Recommendation Engine**:
   - Instrument Affinity Graph mapping (e.g. Piano $\leftrightarrow$ Cello / Violin; Electric Guitar $\leftrightarrow$ Drums / Bass).
   - Multi-factor scoring combining instrument overlap, confidence, and genre weighting.

4. **Dynamic Music Catalog**:
   - Asynchronous MySQL backend with SQLAlchemy 2.0 (`aiomysql`).
   - Automatic ID3 metadata extraction and background audio analysis upon upload.
   - In-app audio player with streaming playback.

5. **Continuous Learning Loop**:
   - Feedback ingestion pipeline allowing fine-tuning of detector weights from user-confirmed audio segments.

---

## 📂 Project Structure

```
MusicTalk/
├── catalog-service/              # Song Catalog Microservice (:8001)
│   ├── src/
│   │   ├── crud.py               # Database CRUD operations
│   │   ├── database.py           # Async SQLAlchemy & MySQL session
│   │   ├── models.py             # Song data models
│   │   ├── schemas.py            # Pydantic request/response schemas
│   │   └── seed.py               # Database seeder
│   ├── main.py                   # FastAPI server entry point
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                     # React 18 + Vite Web App (:5173)
│   ├── src/
│   │   ├── components/           # UI components (Navbar, InstrumentCard, etc.)
│   │   ├── pages/                # Pages (Recognize, LiveRecord, Catalog, Discover)
│   │   ├── services/             # Axios API client
│   │   └── utils/                # Audio utilities (wavRecorder.js)
│   ├── public/                   # Static assets & SVG icons
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── gateway/                      # Unified Reverse Proxy Gateway (:3000)
│   ├── src/
│   │   ├── config.py             # Service URL endpoints
│   │   ├── routes_catalog.py
│   │   ├── routes_recognition.py
│   │   └── routes_recommendation.py
│   ├── main.py                   # FastAPI gateway entry point
│   ├── requirements.txt
│   └── Dockerfile
│
├── recognition-service/          # PyTorch Instrument Recognition (:8000)
│   ├── models/                   # Pre-trained .pt binary detector weights
│   ├── src/
│   │   ├── aggregator.py         # Multi-model inference coordinator
│   │   ├── continuous_learner.py # Continuous learning pipeline
│   │   ├── detector.py           # Single detector wrapper
│   │   ├── feature_extraction.py # Log-mel spectrogram extraction
│   │   ├── model.py              # CNN PyTorch architecture
│   │   └── train.py              # Training script for IRMAS dataset
│   ├── main.py                   # FastAPI recognition entry point
│   ├── requirements.txt
│   └── Dockerfile
│
├── recommendation-service/       # Music Recommendation Microservice (:8002)
│   ├── src/
│   │   ├── config.py
│   │   └── engine.py             # Affinity graph & recommendation logic
│   ├── main.py                   # FastAPI recommendation entry point
│   ├── requirements.txt
│   └── Dockerfile
│
├── songs/                        # Local audio storage for uploaded tracks
├── docker-compose.yml            # Multi-container Docker deployment
├── start_all.bat                 # Windows 1-Click Launch Script
├── start_all.ps1                 # PowerShell 1-Click Launch Script
├── start_all.sh                  # Linux / macOS Launch Script
├── requirements.txt              # Consolidated Python dependencies
└── README.md
```

---

## 🚀 Quick Start Guide

### Prerequisites

- **Python**: 3.11+ (with `pip`)
- **Node.js**: 18+ (with `npm`)
- **MySQL**: 8.0+ (local, XAMPP, or Docker)
- **FFmpeg**: (Recommended for audio decoding)

---

### Option A: Docker Compose (Fastest)

Run the complete multi-service ecosystem (MySQL, Python microservices, and Frontend Nginx) with a single command:

```bash
docker-compose up --build
```

- Open **`http://localhost:5173`** in your browser!

---

### Option B: One-Click Startup Scripts

#### On Windows:
```cmd
start_all.bat
```
*Or using PowerShell:*
```powershell
.\start_all.ps1
```

#### On Linux / macOS:
```bash
chmod +x start_all.sh
./start_all.sh
```

---

### Option C: Manual Service Launch

#### 1. Install Dependencies

Install all Python dependencies across microservices:
```bash
pip install -r requirements.txt
```

Install frontend dependencies:
```bash
cd frontend
npm install
cd ..
```

#### 2. Set Up MySQL Database

Create the database in MySQL:
```sql
CREATE DATABASE IF NOT EXISTS musictalk_catalog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

*(Optional)* Seed sample tracks:
```bash
cd catalog-service
python -m src.seed
cd ..
```

#### 3. Start Each Service (in separate terminal windows)

| Service | Command | Port |
| :--- | :--- | :---: |
| **Recognition Service** | `cd recognition-service && uvicorn main:app --port 8000 --reload` | `8000` |
| **Catalog Service** | `cd catalog-service && uvicorn main:app --port 8001 --reload` | `8001` |
| **Recommendation Service** | `cd recommendation-service && uvicorn main:app --port 8002 --reload` | `8002` |
| **API Gateway** | `cd gateway && uvicorn main:app --port 3000 --reload` | `3000` |
| **Frontend** | `cd frontend && npm run dev` | `5173` |

Then visit **`http://localhost:5173`** 🎉

---

## ⚙️ Configuration & Environment Variables

Copy `.env.example` to `.env` or set environment variables as needed:

| Variable | Default | Service | Description |
| :--- | :--- | :---: | :--- |
| `DB_USER` | `root` | Catalog | MySQL Username |
| `DB_PASSWORD` | `root` | Catalog | MySQL Password |
| `DB_HOST` | `localhost` | Catalog | MySQL Host address |
| `DB_PORT` | `3306` | Catalog | MySQL Port |
| `DB_NAME` | `musictalk_catalog` | Catalog | Database Name |
| `RECOGNITION_SERVICE_URL` | `http://localhost:8000` | Gateway/Catalog | Recognition Service URL |
| `CATALOG_SERVICE_URL` | `http://localhost:8001` | Gateway/Rec | Catalog Service URL |
| `RECOMMENDATION_SERVICE_URL` | `http://localhost:8002` | Gateway | Recommendation Service URL |
| `DEVICE` | `auto` | Recognition | PyTorch execution device (`cpu`, `cuda`, `auto`) |
| `CONFIDENCE_THRESHOLD` | `0.50` | Recognition | Minimum confidence threshold |

---

## 📡 API Reference

All requests from the Frontend route through the **API Gateway** at `http://localhost:3000`:

### Recognition Endpoints (`/api/recognition`)
- `POST /api/recognition/recognize` — Multipart upload of audio file (`.wav`, `.mp3`, etc.) to get instrument predictions.
- `GET /api/recognition/health` — Returns status and list of active loaded detector models.
- `POST /api/recognition/admin/reload-models` — Hot-reloads `.pt` models from disk.

### Catalog Endpoints (`/api/catalog`)
- `GET /api/catalog/songs` — List songs with optional pagination and filters (`search`, `genre`, `instrument`).
- `POST /api/catalog/songs` — Add a new song with metadata and instrument tags.
- `POST /api/catalog/upload` — Upload an audio file with automatic ID3 extraction and instrument analysis.
- `GET /api/catalog/stream/{song_id}` — Stream song audio directly.
- `GET /api/catalog/songs/{song_id}` — Retrieve details of a specific song.
- `DELETE /api/catalog/songs/{song_id}` — Delete a track from the catalog.

### Recommendation Endpoints (`/api/recommendations`)
- `GET /api/recommendations/recommend/by-instruments?instruments=piano,violin&limit=10` — Recommend songs based on instrument signatures.
- `GET /api/recommendations/recommend/by-genre?genre=jazz&limit=10` — Recommend songs by musical genre.

---

## 🧠 Model Training & IRMAS Dataset

You can train or fine-tune binary detector models on the **IRMAS (Instrument Recognition in Musical Audio Signals)** dataset.

```bash
cd recognition-service

# Train a single instrument (e.g. Piano)
python -m src.train --instrument piano --data-dir "path/to/IRMAS-TrainingData" --epochs 25 --batch-size 32

# Train all 11 instruments sequentially
python -m src.train --instrument all --data-dir "path/to/IRMAS-TrainingData" --epochs 25
```

Checkpoints with the best validation accuracy are automatically saved to `recognition-service/models/<instrument>_detector.pt`.

---

## 🔄 Continuous Learning Pipeline

MusicTalk features an active learning and model refinement framework:
1. User records audio or uploads a track.
2. If predictions need correction, user flags or validates true instrument presence.
3. Audio slices are saved with metadata to `recognition-service/continuous_learning/`.
4. `continuous_learner.py` fine-tunes existing checkpoints with balanced replay memory.

---

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on branching, commit guidelines, and pull requests.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
