import logging
from typing import Optional, List

import httpx
from fastapi import APIRouter, Query, HTTPException, UploadFile, File, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.config import CATALOG_SERVICE_URL

logger = logging.getLogger("gateway.catalog")
router = APIRouter(prefix="/api/catalog", tags=["Catalog"])


class SongCreate(BaseModel):
    title: str = Field(..., max_length=256)
    artist: str = Field(..., max_length=256)
    album: Optional[str] = None
    genre: Optional[str] = None
    duration_sec: Optional[float] = None
    instruments: Optional[dict] = None
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[list] = None
    status: Optional[str] = None


class SongUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    genre: Optional[str] = None
    duration_sec: Optional[float] = None
    instruments: Optional[dict] = None
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[list] = None
    status: Optional[str] = None


async def _proxy_get(path: str, params: dict = None):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{CATALOG_SERVICE_URL}{path}", params=params, timeout=10)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service unreachable: {e}")


@router.get("/health")
async def catalog_health():
    return await _proxy_get("/health")


# ── Upload & Retry ────────────────────────────────────────────────────────────

@router.post("/songs/upload", status_code=202)
async def upload_songs(files: List[UploadFile] = File(...)):
    """Proxy file upload to catalog-service for storage & background detection."""
    async with httpx.AsyncClient() as client:
        try:
            multipart_files = []
            for file in files:
                content = await file.read()
                multipart_files.append(("files", (file.filename, content, file.content_type or "audio/mpeg")))

            resp = await client.post(
                f"{CATALOG_SERVICE_URL}/songs/upload",
                files=multipart_files,
                timeout=60,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service error: {e}")


@router.post("/songs/{song_id}/retry")
async def retry_song_detection(song_id: str):
    """Proxy retry request for failed uploads."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(f"{CATALOG_SERVICE_URL}/songs/{song_id}/retry", timeout=15)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service error: {e}")


@router.get("/songs/{song_id}/status")
async def get_song_status(song_id: str):
    """Lightweight polling proxy for song upload/detection status."""
    return await _proxy_get(f"/songs/{song_id}/status")


# ── Streaming ─────────────────────────────────────────────────────────────────

@router.get("/songs/{song_id}/stream")
async def stream_song(song_id: str, request: Request):
    """Stream audio file from catalog-service, supporting HTTP Range requests."""
    range_header = request.headers.get("range") or request.headers.get("Range")
    headers = {}
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient()
    try:
        req = client.build_request(
            "GET",
            f"{CATALOG_SERVICE_URL}/songs/{song_id}/stream",
            headers=headers,
            timeout=30,
        )
        resp = await client.send(req, stream=True)

        if resp.status_code >= 400:
            content = await resp.aread()
            await client.aclose()
            raise HTTPException(status_code=resp.status_code, detail=content.decode("utf-8", errors="ignore"))

        response_headers = {
            k: v for k, v in resp.headers.items()
            if k.lower() in ["content-range", "accept-ranges", "content-length", "content-type"]
        }

        async def body_stream():
            try:
                async for chunk in resp.aiter_bytes():
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()

        return StreamingResponse(
            body_stream(),
            status_code=resp.status_code,
            headers=response_headers,
        )
    except httpx.RequestError as e:
        await client.aclose()
        raise HTTPException(status_code=502, detail=f"Catalog service streaming error: {e}")


# ── Songs CRUD ────────────────────────────────────────────────────────────────

@router.post("/songs", status_code=201)
async def create_song(data: SongCreate):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{CATALOG_SERVICE_URL}/songs",
                json=data.model_dump(exclude_none=True),
                timeout=10,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service error: {e}")


@router.get("/songs")
async def list_songs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    genre: Optional[str] = None,
    instrument: Optional[str] = None,
    status: Optional[str] = None,
):
    params = {"page": page, "page_size": page_size}
    if search:
        params["search"] = search
    if genre:
        params["genre"] = genre
    if instrument:
        params["instrument"] = instrument
    if status:
        params["status"] = status
    return await _proxy_get("/songs", params)


@router.get("/songs/{song_id}")
async def get_song(song_id: str):
    return await _proxy_get(f"/songs/{song_id}")


@router.put("/songs/{song_id}")
async def update_song(song_id: str, data: SongUpdate):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.put(
                f"{CATALOG_SERVICE_URL}/songs/{song_id}",
                json=data.model_dump(exclude_unset=True),
                timeout=10,
            )
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service error: {e}")


@router.delete("/songs/{song_id}", status_code=204)
async def delete_song(song_id: str):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(f"{CATALOG_SERVICE_URL}/songs/{song_id}", timeout=10)
            if resp.status_code >= 400:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Catalog service error: {e}")


@router.get("/songs/by-instruments/")
async def songs_by_instruments(
    instruments: str = Query(..., description="Comma-separated instrument names"),
    limit: int = Query(20, ge=1, le=100),
):
    return await _proxy_get("/songs/by-instruments/", {"instruments": instruments, "limit": limit})
