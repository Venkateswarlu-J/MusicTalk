# API Gateway (Python / FastAPI)

Unified entry point for all MusicTalk microservices. The frontend talks only to the gateway.

## Tech Stack
- Python 3.11+
- FastAPI & Uvicorn
- httpx (async HTTP client for proxying)

## Architecture

```
Frontend ──► Gateway (:3000) ──┬──► Recognition Service (:8000)
                               ├──► Catalog Service     (:8001)
                               └──► Recommendation Svc  (:8002)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RECOGNITION_SERVICE_URL` | `http://localhost:8000` | Recognition Service base URL |
| `CATALOG_SERVICE_URL` | `http://localhost:8001` | Catalog Service base URL |
| `RECOMMENDATION_SERVICE_URL` | `http://localhost:8002` | Recommendation Service base URL |

## Setup & Running

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the Gateway
```bash
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
```

## API Routes

| Prefix | Routes To | Description |
|--------|-----------|-------------|
| `/api/recognition/*` | Recognition Service | Audio instrument detection |
| `/api/catalog/*` | Catalog Service | Song CRUD & search |
| `/api/recommendations/*` | Recommendation Service | Music recommendations |
| `/health` | Gateway | Gateway status + downstream URLs |
