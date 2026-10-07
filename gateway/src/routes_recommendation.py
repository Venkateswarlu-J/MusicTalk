import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Query, HTTPException

from src.config import RECOMMENDATION_SERVICE_URL

logger = logging.getLogger("gateway.recommendation")
router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.get("/health")
async def recommendation_health():
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{RECOMMENDATION_SERVICE_URL}/health", timeout=10)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recommendation service unreachable: {e}")


@router.get("/by-instruments")
async def recommend_by_instruments(
    instruments: str = Query(..., description="Comma-separated instrument names"),
    limit: int = Query(10, ge=1, le=50),
    expand: bool = Query(True, description="Expand to related instruments"),
    exclude_song_id: Optional[str] = Query(None, description="Song ID to exclude"),
    played_song_ids: Optional[str] = Query(None, description="Comma-separated IDs of already played songs"),
):
    """Get song recommendations based on detected instruments using overlap_ratio * avg_confidence."""
    async with httpx.AsyncClient() as client:
        try:
            params = {
                "instruments": instruments,
                "limit": limit,
                "expand": expand,
            }
            if exclude_song_id:
                params["exclude_song_id"] = exclude_song_id
            if played_song_ids:
                params["played_song_ids"] = played_song_ids

            resp = await client.get(
                f"{RECOMMENDATION_SERVICE_URL}/recommend/by-instruments",
                params=params,
                timeout=15,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recommendation service error: {e}")


@router.get("/by-genre")
async def recommend_by_genre(
    genre: str = Query(...),
    limit: int = Query(10, ge=1, le=50),
    exclude_song_id: Optional[str] = Query(None, description="Song ID to exclude"),
    played_song_ids: Optional[str] = Query(None, description="Comma-separated IDs of already played songs"),
):
    """Get song recommendations based on genre."""
    async with httpx.AsyncClient() as client:
        try:
            params = {"genre": genre, "limit": limit}
            if exclude_song_id:
                params["exclude_song_id"] = exclude_song_id
            if played_song_ids:
                params["played_song_ids"] = played_song_ids

            resp = await client.get(
                f"{RECOMMENDATION_SERVICE_URL}/recommend/by-genre",
                params=params,
                timeout=15,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recommendation service error: {e}")
