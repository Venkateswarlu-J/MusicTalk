from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class SongCreate(BaseModel):
    title: str = Field(..., max_length=256)
    artist: str = Field(..., max_length=256)
    album: Optional[str] = Field(None, max_length=256)
    genre: Optional[str] = Field(None, max_length=128)
    duration_sec: Optional[float] = Field(None, ge=0)
    instruments: Optional[dict] = None
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = "DONE"
    file_hash: Optional[str] = None
    storage_path: Optional[str] = None


class SongUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=256)
    artist: Optional[str] = Field(None, max_length=256)
    album: Optional[str] = Field(None, max_length=256)
    genre: Optional[str] = Field(None, max_length=128)
    duration_sec: Optional[float] = Field(None, ge=0)
    instruments: Optional[dict] = None
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    file_hash: Optional[str] = None
    storage_path: Optional[str] = None


class SongResponse(BaseModel):
    id: str
    title: str
    artist: str
    album: Optional[str] = None
    genre: Optional[str] = None
    duration_sec: Optional[float] = None
    instruments: Optional[dict] = None
    audio_url: Optional[str] = None
    cover_url: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = "DONE"
    file_hash: Optional[str] = None
    storage_path: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SongListResponse(BaseModel):
    songs: List[SongResponse]
    total: int
    page: int
    page_size: int


class UploadResultItem(BaseModel):
    id: Optional[str] = None
    filename: str
    status: str  # "UPLOADED", "SKIPPED_DUPLICATE", "FAILED"
    title: Optional[str] = None
    message: Optional[str] = None


class UploadResponse(BaseModel):
    results: List[UploadResultItem]


class StatusResponse(BaseModel):
    id: str
    status: str
    title: Optional[str] = None
    artist: Optional[str] = None
    instruments: Optional[dict] = None
    duration_sec: Optional[float] = None
