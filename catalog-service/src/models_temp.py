import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, Float, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _new_id() -> str:
    return uuid.uuid4().hex[:12]

class SongStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PROCESSING = "PROCESSING"
    DONE = "DONE"
    FAILED = "FAILED"

class Instrument(Base):
    __tablename__ = "instruments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

class SongInstrument(Base):
    __tablename__ = "song_instruments"
    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_new_id)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id", ondelete="CASCADE"))
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.id", ondelete="CASCADE"))
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    occurrence: Mapped[float] = mapped_column(Float, nullable=False)
    
    song = relationship("Song", back_populates="song_instruments")
    instrument = relationship("Instrument")

class Song(Base):
    __tablename__ = "songs"

    id: Mapped[str] = mapped_column(String(12), primary_key=True, default=_new_id)
    title: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    artist: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    album: Mapped[str | None] = mapped_column(String(256), nullable=True)
    genre: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    duration_sec: Mapped[float | None] = mapped_column(Float, nullable=True)
    
    # Store the timeline directly on the song, or in a separate table
    timeline: Mapped[list | None] = mapped_column(JSON, nullable=True)
    
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=SongStatus.DONE.value, index=True)
    file_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    storage_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    song_instruments = relationship("SongInstrument", back_populates="song", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "genre": self.genre,
            "duration_sec": self.duration_sec,
            "timeline": self.timeline,
            "audio_url": self.audio_url,
            "cover_url": self.cover_url,
            "tags": self.tags,
            "status": self.status,
            "file_hash": self.file_hash,
            "storage_path": self.storage_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
