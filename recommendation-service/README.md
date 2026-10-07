# Recommendation Service (Python / FastAPI)

Microservice for music recommendations based on instruments, genre, and user preferences.

## Tech Stack
- Python 3.11+
- FastAPI & Uvicorn
- httpx (communicates with Catalog Service)

## How it Works

1. **Instrument-based**: Takes detected instruments → expands using affinity mapping → queries catalog → scores by overlap
2. **Genre-based**: Fetches songs matching genre + songs matching typical instruments for that genre

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CATALOG_SERVICE_URL` | `http://localhost:8001` | Catalog Service base URL |

## Setup & Running

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8002 --reload
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/recommend/by-instruments?instruments=piano,violin&limit=10` | Recommend by instruments |
| `GET` | `/recommend/by-genre?genre=jazz&limit=10` | Recommend by genre |
