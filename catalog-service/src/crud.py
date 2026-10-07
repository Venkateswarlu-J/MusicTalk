from typing import Optional, List, Dict, Any

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import Song, SongStatus
from src.schemas import SongCreate, SongUpdate


async def create_song(db: AsyncSession, data: SongCreate) -> Song:
    song = Song(**data.model_dump(exclude_none=True))
    db.add(song)
    await db.commit()
    await db.refresh(song)
    return song


async def get_song(db: AsyncSession, song_id: str) -> Optional[Song]:
    return await db.get(Song, song_id)


async def get_song_by_hash(db: AsyncSession, file_hash: str) -> Optional[Song]:
    """Find a song by its SHA-256 file hash for deduplication."""
    query = select(Song).where(Song.file_hash == file_hash)
    result = await db.execute(query)
    return result.scalars().first()


async def list_songs(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    genre: Optional[str] = None,
    instrument: Optional[str] = None,
    status: Optional[str] = None,
) -> tuple[List[Song], int]:
    """List uploaded playable songs with optional filtering. Returns (songs, total_count)."""
    # Only return playable uploaded songs with storage_path
    query = select(Song).where(True)
    count_query = select(func.count()).select_from(Song).where(True)

    if status:
        query = query.where(Song.status == status)
        count_query = count_query.where(Song.status == status)

    # Full-text search on title, artist, album
    if search:
        pattern = f"%{search}%"
        search_filter = or_(
            Song.title.ilike(pattern),
            Song.artist.ilike(pattern),
            Song.album.ilike(pattern),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    # Filter by genre
    if genre:
        query = query.where(Song.genre.ilike(f"%{genre}%"))
        count_query = count_query.where(Song.genre.ilike(f"%{genre}%"))

    # Filter by instrument (JSON field)
    if instrument:
        query = query.where(Song.instruments.isnot(None))
        count_query = count_query.where(Song.instruments.isnot(None))

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(Song.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    songs = list(result.scalars().all())

    # Post-filter by instrument in Python (JSON field)
    if instrument:
        instrument_lower = instrument.lower()
        songs = [
            s for s in songs
            if s.instruments and instrument_lower in [k.lower() for k in s.instruments.keys()]
        ]
        total = len(songs)

    return songs, total


async def update_song(db: AsyncSession, song_id: str, data: SongUpdate) -> Optional[Song]:
    song = await db.get(Song, song_id)
    if not song:
        return None
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(song, field, value)
    await db.commit()
    await db.refresh(song)
    return song


async def update_song_status(
    db: AsyncSession,
    song_id: str,
    status: str,
    **kwargs: Any
) -> Optional[Song]:
    song = await db.get(Song, song_id)
    if not song:
        return None
    song.status = status
    for key, value in kwargs.items():
        if hasattr(song, key) and value is not None:
            setattr(song, key, value)
    await db.commit()
    await db.refresh(song)
    return song


async def delete_song(db: AsyncSession, song_id: str) -> bool:
    song = await db.get(Song, song_id)
    if not song:
        return False
    await db.delete(song)
    await db.commit()
    return True


async def get_songs_by_instruments(
    db: AsyncSession, instrument_names: List[str], limit: int = 50
) -> List[Song]:
    """Find uploaded playable songs that contain any of the given instruments."""
    query = select(Song).where(
        Song.instruments.isnot(None),
        True
    ).limit(limit * 3)
    result = await db.execute(query)
    all_songs = list(result.scalars().all())

    instrument_set = {name.lower() for name in instrument_names}
    matched = []
    for song in all_songs:
        if song.instruments:
            song_instruments = {k.lower() for k in song.instruments.keys()}
            if song_instruments & instrument_set:
                overlap = len(song_instruments & instrument_set)
                matched.append((overlap, song))

    matched.sort(key=lambda x: x[0], reverse=True)
    return [song for _, song in matched[:limit]]
