import logging
from typing import Optional

import httpx
from fastapi import APIRouter, UploadFile, File, Query, HTTPException

from src.config import RECOGNITION_SERVICE_URL

logger = logging.getLogger("gateway.recognition")
router = APIRouter(prefix="/api/recognition", tags=["Recognition"])


@router.get("/health")
async def recognition_health():
    """Proxy health check to recognition-service."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{RECOGNITION_SERVICE_URL}/health", timeout=10)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recognition service unreachable: {e}")


@router.post("/recognize")
async def recognize_audio(
    file: UploadFile = File(...),
    threshold: float = Query(default=0.5, ge=0.0, le=1.0),
):
    """Proxy audio recognition to recognition-service."""
    content = await file.read()
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{RECOGNITION_SERVICE_URL}/recognize",
                files={"file": (file.filename, content, file.content_type)},
                params={"threshold": threshold},
                timeout=60,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recognition service error: {e}")

@router.get("/models/status")
async def get_model_status():
    """Proxy model status fetching to recognition-service."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{RECOGNITION_SERVICE_URL}/models/status", timeout=10)
            return resp.json()
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Recognition service unreachable: {e}")
