# Catalog Service (Python / FastAPI)

Microservice for the MusicTalk song catalog — CRUD operations and search.

## Tech Stack
- Python 3.11+
- FastAPI & Uvicorn
- SQLAlchemy (async) + aiomysql
- MySQL Database

## Environment Variables / Configuration
Set in `.env` or system environment variables:
- `DB_USER` (default: `root`)
- `DB_PASSWORD` (default: `root`)
- `DB_HOST` (default: `localhost`)
- `DB_PORT` (default: `3306`)
- `DB_NAME` (default: `musictalk_catalog`)
- Or directly provide `DATABASE_URL`:
  `mysql+aiomysql://<user>:<password>@<host>:<port>/<dbname>`

## Setup & Running

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start the Service
```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

The database is created automatically on first startup.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `POST` | `/songs` | Add a new song |
| `GET` | `/songs` | List songs (with search, genre, instrument filters, pagination) |
| `GET` | `/songs/{id}` | Get a song by ID |
| `PUT` | `/songs/{id}` | Update a song |
| `DELETE` | `/songs/{id}` | Delete a song |
| `GET` | `/songs/by-instruments/` | Find songs by instrument names (comma-separated) |

## Data Model

Each song has:
- `title`, `artist`, `album`, `genre`
- `duration_sec` — length in seconds
- `instruments` — JSON dict of instrument → confidence (e.g. `{"piano": 0.92, "violin": 0.78}`)
- `audio_url`, `cover_url` — links to audio file and cover art
- `tags` — JSON list of free-form tags
