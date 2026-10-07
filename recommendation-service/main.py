import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.config import CATALOG_SERVICE_URL
from src import engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recommendation-service")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Recommendation service starting (catalog → {CATALOG_SERVICE_URL})")
    yield


app = FastAPI(
    title="MusicTalk Recommendation Service",
    description="Microservice for music recommendations based on instruments, genre, and preferences.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "recommendation-service"}


@app.get("/recommend/by-instruments")
async def recommend_by_instruments(
    instruments: str = Query(..., description="Comma-separated instrument names"),
    limit: int = Query(10, ge=1, le=50),
    expand: bool = Query(True, description="Expand to related instruments"),
    exclude_song_id: Optional[str] = Query(None, description="Song ID to exclude (e.g. currently playing song)"),
    played_song_ids: Optional[str] = Query(None, description="Comma-separated IDs of already played songs in session"),
):
    """Recommend songs based on detected instruments using overlap_ratio * avg_confidence."""
    instrument_list = [i.strip() for i in instruments.split(",") if i.strip()]
    if not instrument_list:
        raise HTTPException(status_code=400, detail="At least one instrument required.")

    played_list = [p.strip() for p in played_song_ids.split(",") if p.strip()] if played_song_ids else None

    result = await engine.recommend_by_instruments(
        instruments=instrument_list,
        limit=limit,
        expand=expand,
        exclude_song_id=exclude_song_id,
        played_song_ids=played_list,
    )
    return result


@app.get("/recommend/by-genre")
async def recommend_by_genre(
    genre: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    exclude_song_id: Optional[str] = Query(None, description="Song ID to exclude"),
    played_song_ids: Optional[str] = Query(None, description="Comma-separated IDs of already played songs"),
):
    """Recommend songs based on genre."""
    played_list = [p.strip() for p in played_song_ids.split(",") if p.strip()] if played_song_ids else None
    result = await engine.recommend_by_genre(
        genre=genre,
        limit=limit,
        exclude_song_id=exclude_song_id,
        played_song_ids=played_list,
    )
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=True)
