import os
import re
import hashlib
import logging
import mimetypes
from typing import Optional, List
from contextlib import asynccontextmanager

import httpx
import mutagen
from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks, Request, Response, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import init_db, get_db, async_session
from src.schemas import (
    SongCreate, SongUpdate, SongResponse, SongListResponse,
    UploadResponse, UploadResultItem, StatusResponse
)
from src.models import Song, SongStatus, _new_id
from src import crud

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("catalog-service")

# Project root songs directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
SONGS_DIR = os.getenv("SONGS_DIR", os.path.join(PROJECT_ROOT, "songs"))
os.makedirs(SONGS_DIR, exist_ok=True)

RECOGNITION_SERVICE_URL = os.getenv("RECOGNITION_SERVICE_URL", "http://localhost:8000")


def get_safe_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal."""
    cleaned = os.path.basename(filename)
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", cleaned)


def extract_file_id3(file_path: str) -> dict:
    """Extract ID3 tags using mutagen."""
    meta = {"title": None, "artist": None, "album": None, "genre": None, "duration_sec": None}
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
        logger.warning(f"Error reading ID3 tags from {file_path}: {e}")
    return meta


async def process_song_detection(song_id: str, file_path: str):
    """
    Background job:
    1. Set status to PROCESSING internally.
    2. Call Recognition Service to extract detected instruments + confidences.
    3. Update song with instruments, ID3 tags, and set status to DONE.
    4. Register as training sample for continuous learning.
    5. Trigger fine-tuning if enough samples collected.
    6. On failure, set status to FAILED (file remains intact for retry).
    """
    logger.info(f"[Background Job] Starting recognition for song_id={song_id}, file={file_path}")
    async with async_session() as session:
        song = await session.get(Song, song_id)
        if not song:
            logger.error(f"[Background Job] Song {song_id} not found in DB.")
            return

        # 1. Set to PROCESSING
        song.status = SongStatus.PROCESSING.value
        await session.commit()

        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Stored file '{file_path}' does not exist.")

            # ID3 tag extraction
            id3_meta = extract_file_id3(file_path)

            # 2. Call Recognition Service
            async with httpx.AsyncClient() as client:
                with open(file_path, "rb") as f:
                    file_content = f.read()
                    filename = os.path.basename(file_path)
                    files = {"file": (filename, file_content, "audio/mpeg")}
                    resp = await client.post(
                        f"{RECOGNITION_SERVICE_URL}/recognize",
                        files=files,
                        params={"threshold": 0.0},  # get all predictions
                        timeout=120,
                    )

            if resp.status_code != 200:
                raise RuntimeError(f"Recognition service returned {resp.status_code}: {resp.text}")

            recognition_data = resp.json()
            instruments_dict = {}

            # Populate instrument dictionary with occurrence and segment data for UI
            for item in recognition_data.get("instruments", []):
                inst_name = item.get("instrument")
                if inst_name:
                    instruments_dict[inst_name] = {
                        "confidence": item.get("confidence"),
                        "occurrence": item.get("occurrence"),
                        "segments": item.get("segments", [])
                    }

            # If no instruments hit the presence/occurrence threshold, grab just confidences
            if not instruments_dict:
                 for item in recognition_data.get("all_scores", []):
                     inst_name = item.get("instrument")
                     instruments_dict[inst_name] = {"confidence": item.get("confidence")}

            # Re-read or update song
            song = await session.get(Song, song_id)
            if song:
                song.instruments = instruments_dict
                if id3_meta.get("title") and (not song.title or song.title == "Unknown Title"):
                    song.title = id3_meta["title"]
                if id3_meta.get("artist") and (not song.artist or song.artist == "Unknown Artist"):
                    song.artist = id3_meta["artist"]
                if id3_meta.get("album") and not song.album:
                    song.album = id3_meta["album"]
                if id3_meta.get("genre") and not song.genre:
                    song.genre = id3_meta["genre"]
                if id3_meta.get("duration_sec"):
                    song.duration_sec = id3_meta["duration_sec"]

                song.audio_url = f"/api/catalog/songs/{song_id}/stream"
                song.status = SongStatus.DONE.value
                await session.commit()
                logger.info(f"[Background Job] Successfully processed song {song_id} -> DONE. Instruments: {instruments_dict}")

                # 4. Register as training sample for continuous learning
                abs_path = os.path.join(PROJECT_ROOT, song.storage_path) if song.storage_path else file_path
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            f"{RECOGNITION_SERVICE_URL}/admin/register-training-sample",
                            json={"file_path": abs_path, "confidences": instruments_dict},
                            timeout=30,
                        )
                    logger.info(f"[Continuous Learning] Registered {song_id} as training sample")
                except Exception as e:
                    logger.warning(f"[Continuous Learning] Failed to register training sample: {e}")

        except Exception as e:
            logger.error(f"[Background Job] Failed processing song {song_id}: {e}", exc_info=True)
            async with async_session() as fail_session:
                s = await fail_session.get(Song, song_id)
                if s:
                    s.status = SongStatus.FAILED.value
                    await fail_session.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing catalog database...")
    await init_db()
    logger.info(f"Catalog service ready. Local audio storage: {SONGS_DIR}")
    yield


app = FastAPI(
    title="MusicTalk Catalog Service",
    description="Microservice for music catalog — CRUD, upload, background detection, and streaming.",
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


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "catalog-service", "storage": SONGS_DIR}


# ── Songs Upload & Retry ──────────────────────────────────────────────────────

@app.post("/songs/upload", response_model=UploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_songs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Accepts one or more audio files for upload and background detection.
    1. Computes SHA-256 hash.
    2. If duplicate hash found -> returns status SKIPPED_DUPLICATE.
    3. If new -> saves file under songs/, creates Song row with status UPLOADED,
       and triggers background detection job.
    """
    results: List[UploadResultItem] = []

    for file in files:
        if not file.filename:
            continue

        try:
            content = await file.read()
            if not content:
                results.append(UploadResultItem(
                    filename=file.filename,
                    status=SongStatus.FAILED.value,
                    message="Empty file",
                ))
                continue

            file_hash = hashlib.sha256(content).hexdigest()

            # Check for existing song with this content hash
            existing = await crud.get_song_by_hash(db, file_hash)
            if existing:
                logger.info(f"Duplicate file uploaded: {file.filename} (hash={file_hash[:8]}...) -> Matches song {existing.id}")
                results.append(UploadResultItem(
                    id=existing.id,
                    filename=file.filename,
                    status="SKIPPED_DUPLICATE",
                    title=existing.title,
                    message="Already exists in catalog",
                ))
                continue

            # Save file to disk
            song_id = _new_id()
            safe_name = get_safe_filename(file.filename)
            saved_filename = f"{song_id}_{safe_name}"
            abs_path = os.path.join(SONGS_DIR, saved_filename)
            rel_path = f"songs/{saved_filename}"

            with open(abs_path, "wb") as f_out:
                f_out.write(content)

            # Initial ID3 extraction for immediate title/artist
            id3_meta = extract_file_id3(abs_path)
            title = id3_meta.get("title") or os.path.splitext(file.filename)[0]
            artist = id3_meta.get("artist") or "Unknown Artist"
            genre = id3_meta.get("genre")
            album = id3_meta.get("album")
            duration_sec = id3_meta.get("duration_sec")

            # Create Song record
            new_song = Song(
                id=song_id,
                title=title,
                artist=artist,
                album=album,
                genre=genre,
                duration_sec=duration_sec,
                status=SongStatus.UPLOADED.value,
                file_hash=file_hash,
                storage_path=rel_path,
                audio_url=f"/api/catalog/songs/{song_id}/stream",
            )
            db.add(new_song)
            await db.commit()
            await db.refresh(new_song)

            # Enqueue background detection
            background_tasks.add_task(process_song_detection, song_id, abs_path)

            results.append(UploadResultItem(
                id=song_id,
                filename=file.filename,
                status=SongStatus.UPLOADED.value,
                title=title,
                message="Uploaded and queued for analysis",
            ))

        except Exception as e:
            logger.error(f"Error handling upload for {file.filename}: {e}", exc_info=True)
            results.append(UploadResultItem(
                filename=file.filename,
                status=SongStatus.FAILED.value,
                message=f"Upload failed: {str(e)}",
            ))

    return UploadResponse(results=results)


@app.post("/songs/{song_id}/retry")
async def retry_song_detection(
    song_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Retry background detection for a FAILED song without re-uploading."""
    song = await crud.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")

    if song.status != SongStatus.FAILED.value:
        raise HTTPException(
            status_code=400,
            detail=f"Only FAILED songs can be retried. Current status is '{song.status}'."
        )

    # Resolve file path
    abs_path = None
    if song.storage_path:
        if os.path.isabs(song.storage_path):
            abs_path = song.storage_path
        else:
            abs_path = os.path.join(PROJECT_ROOT, song.storage_path)

    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk to retry.")

    # Set status back to UPLOADED and enqueue
    song.status = SongStatus.UPLOADED.value
    await db.commit()

    background_tasks.add_task(process_song_detection, song.id, abs_path)

    return {
        "id": song.id,
        "status": SongStatus.UPLOADED.value,
        "message": "Detection retry queued successfully."
    }


@app.get("/songs/{song_id}/status", response_model=StatusResponse)
async def get_song_status(song_id: str, db: AsyncSession = Depends(get_db)):
    """Lightweight endpoint for polling upload / detection status."""
    song = await crud.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")
    return {
        "id": song.id,
        "status": song.status,
        "title": song.title,
        "artist": song.artist,
        "instruments": song.instruments,
        "duration_sec": song.duration_sec,
    }


# ── Songs CRUD ────────────────────────────────────────────────────────────────

@app.post("/songs", response_model=SongResponse, status_code=201)
async def create_song(data: SongCreate, db: AsyncSession = Depends(get_db)):
    """Add a new song to the catalog."""
    song = await crud.create_song(db, data)
    return song.to_dict()


@app.get("/songs", response_model=SongListResponse)
async def list_songs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search in title, artist, album"),
    genre: Optional[str] = Query(None),
    instrument: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """List songs with optional filtering and pagination."""
    songs, total = await crud.list_songs(db, page, page_size, search, genre, instrument, status)
    return {
        "songs": [s.to_dict() for s in songs],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/songs/{song_id}", response_model=SongResponse)
async def get_song(song_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single song by ID."""
    song = await crud.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")
    return song.to_dict()


@app.put("/songs/{song_id}", response_model=SongResponse)
async def update_song(song_id: str, data: SongUpdate, db: AsyncSession = Depends(get_db)):
    """Update an existing song."""
    song = await crud.update_song(db, song_id, data)
    if not song:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")
    return song.to_dict()


@app.delete("/songs/{song_id}", status_code=204)
async def delete_song(song_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a song from the catalog."""
    deleted = await crud.delete_song(db, song_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")


# ── Instrument-based lookup (used by recommendation-service) ──────────────────

@app.get("/songs/by-instruments/", response_model=list[SongResponse])
async def songs_by_instruments(
    instruments: str = Query(..., description="Comma-separated instrument names"),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Find songs containing any of the specified instruments."""
    instrument_list = [i.strip() for i in instruments.split(",") if i.strip()]
    if not instrument_list:
        raise HTTPException(status_code=400, detail="At least one instrument name required.")
    songs = await crud.get_songs_by_instruments(db, instrument_list, limit)
    return [s.to_dict() for s in songs]


# ── Audio Streaming with HTTP Range Support ───────────────────────────────────

def stream_file_range(file_path: str, start: int, end: int, chunk_size: int = 64 * 1024):
    """Yield file chunks for HTTP 206 partial content response."""
    with open(file_path, "rb") as f:
        f.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = f.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data


@app.get("/songs/{song_id}/stream")
async def stream_song(
    song_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Stream audio file from local disk with HTTP Range request support (seeking).
    Supports HTML5 audio player seeking and progressive playback.
    """
    song = await crud.get_song(db, song_id)
    if not song:
        raise HTTPException(status_code=404, detail=f"Song '{song_id}' not found.")

    # Locate the file on disk
    abs_path = None
    if song.storage_path:
        if os.path.isabs(song.storage_path):
            abs_path = song.storage_path
        else:
            abs_path = os.path.join(PROJECT_ROOT, song.storage_path)

    # Fallback: search in SONGS_DIR by song_id
    if not abs_path or not os.path.exists(abs_path):
        candidates = [
            os.path.join(SONGS_DIR, f)
            for f in os.listdir(SONGS_DIR)
            if f.startswith(f"{song_id}_")
        ]
        if candidates:
            abs_path = candidates[0]

    if not abs_path or not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk.")

    file_size = os.path.getsize(abs_path)
    mime_type, _ = mimetypes.guess_type(abs_path)
    mime_type = mime_type or "audio/mpeg"

    range_header = request.headers.get("range") or request.headers.get("Range")

    if range_header:
        # Parse Range: bytes=start-end
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if not range_match:
            raise HTTPException(status_code=416, detail="Invalid Range header.")

        start = int(range_match.group(1))
        end = int(range_match.group(2)) if range_match.group(2) else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        content_length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": mime_type,
        }

        return StreamingResponse(
            stream_file_range(abs_path, start, end),
            status_code=206,
            headers=headers,
        )

    # No Range header: full stream with Accept-Ranges
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Content-Type": mime_type,
    }
    return StreamingResponse(
        stream_file_range(abs_path, 0, file_size - 1),
        status_code=200,
        headers=headers,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
