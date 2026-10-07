import logging
from typing import List, Optional, Dict, Any, Set

import httpx

from src.config import CATALOG_SERVICE_URL

logger = logging.getLogger("recommendation-service.engine")

# Instrument similarity groups — instruments that commonly appear together
INSTRUMENT_AFFINITY = {
    "piano": ["violin", "cello", "flute", "voice", "clarinet"],
    "acoustic_guitar": ["voice", "flute", "violin", "cello"],
    "electric_guitar": ["voice", "saxophone", "organ", "trumpet"],
    "violin": ["cello", "piano", "flute", "clarinet"],
    "cello": ["violin", "piano", "flute"],
    "flute": ["piano", "violin", "clarinet", "cello"],
    "clarinet": ["piano", "flute", "saxophone", "violin"],
    "saxophone": ["piano", "trumpet", "electric_guitar", "organ"],
    "trumpet": ["saxophone", "piano", "organ", "electric_guitar"],
    "organ": ["voice", "trumpet", "saxophone"],
    "voice": ["piano", "acoustic_guitar", "electric_guitar", "organ"],
}

# Genre-to-instrument mapping for genre-based recommendations
GENRE_INSTRUMENTS = {
    "classical": ["piano", "violin", "cello", "flute", "clarinet"],
    "jazz": ["saxophone", "trumpet", "piano", "clarinet"],
    "rock": ["electric_guitar", "voice", "organ"],
    "pop": ["voice", "piano", "acoustic_guitar"],
    "folk": ["acoustic_guitar", "voice", "flute", "violin"],
    "blues": ["electric_guitar", "voice", "saxophone", "piano"],
    "country": ["acoustic_guitar", "voice", "violin"],
    "electronic": ["voice", "piano"],
    "metal": ["electric_guitar", "voice"],
    "r&b": ["voice", "piano", "saxophone"],
}


async def _fetch_songs_by_instruments(instruments: List[str], limit: int) -> list:
    """Fetch PLAYABLE songs from catalog-service that match given instruments."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{CATALOG_SERVICE_URL}/songs/by-instruments/",
                params={"instruments": ",".join(instruments), "limit": limit},
                timeout=10,
            )
            if resp.status_code == 200:
                songs = resp.json()
                # Filter to only playable songs with storage_path
                playable = [s for s in songs if s.get('storage_path') or s.get('audio_url')]
                logger.info(f"Fetched {len(songs)} songs, {len(playable)} playable with storage")
                return playable
            logger.warning(f"Catalog returned {resp.status_code}: {resp.text}")
            return []
        except httpx.RequestError as e:
            logger.error(f"Cannot reach catalog-service: {e}")
            return []


async def _fetch_songs_by_genre(genre: str, limit: int) -> list:
    """Fetch PLAYABLE songs from catalog-service filtered by genre."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{CATALOG_SERVICE_URL}/songs",
                params={"genre": genre, "page_size": limit},
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                songs = data.get("songs", [])
                # Filter to only playable songs with storage_path
                playable = [s for s in songs if s.get('storage_path') or s.get('audio_url')]
                logger.info(f"Fetched {len(songs)} genre songs, {len(playable)} playable with storage")
                return playable
            return []
        except httpx.RequestError as e:
            logger.error(f"Cannot reach catalog-service: {e}")
            return []


def _expand_instruments(detected: List[str]) -> List[str]:
    """Expand detected instruments with related/similar ones."""
    expanded = set(detected)
    for instr in detected:
        related = INSTRUMENT_AFFINITY.get(instr.lower(), [])
        expanded.update(related)
    return list(expanded)


async def recommend_by_instruments(
    instruments: List[str],
    limit: int = 10,
    expand: bool = True,
    exclude_song_id: Optional[str] = None,
    played_song_ids: Optional[List[str]] = None,
) -> dict:
    """
    Recommend songs based on detected instruments using the spec formula:
      score(candidate_song) = overlap_ratio * avg_confidence
      overlap_ratio  = |matched_instruments| / |total_instruments_in_candidate_song|
      avg_confidence = average(candidate_song's confidence for each matched instrument)

    Rules:
      - Exclude current song itself (exclude_song_id).
      - Exclude any song already played earlier in session (played_song_ids).
      - Sort candidates descending by score.
    """
    detected_set: Set[str] = {i.strip().lower() for i in instruments if i.strip()}
    if not detected_set:
        return {"recommendations": [], "detected_instruments": []}

    search_instruments = _expand_instruments(list(detected_set)) if expand else list(detected_set)
    songs = await _fetch_songs_by_instruments(search_instruments, max(limit * 3, 30))

    # Build excluded IDs set
    excluded_ids: Set[str] = set()
    if exclude_song_id:
        excluded_ids.add(exclude_song_id.strip())
    if played_song_ids:
        for pid in played_song_ids:
            if pid and pid.strip():
                excluded_ids.add(pid.strip())

    scored = []
    seen_ids: Set[str] = set()

    for song in songs:
        sid = song.get("id")
        if not sid or sid in excluded_ids or sid in seen_ids:
            continue

        song_instr: Dict[str, Any] = song.get("instruments") or {}
        if not isinstance(song_instr, dict) or len(song_instr) == 0:
            continue

        total_instruments = len(song_instr)

        # Direct matches with detected instruments
        matched_keys = [k for k in song_instr.keys() if k.lower() in detected_set]

        # If expand is enabled and no direct match, check expanded search instruments
        if not matched_keys and expand:
            search_set = {i.lower() for i in search_instruments}
            matched_keys = [k for k in song_instr.keys() if k.lower() in search_set]

        if not matched_keys:
            continue

        overlap_ratio = len(matched_keys) / float(total_instruments)

        # Average confidence for matched instruments in the candidate song
        conf_values = []
        for k in matched_keys:
            val = song_instr[k]
            if isinstance(val, dict):
                val = val.get("confidence", 1.0)
            try:
                conf_values.append(float(val))
            except (TypeError, ValueError):
                conf_values.append(1.0)

        avg_confidence = sum(conf_values) / len(conf_values) if conf_values else 1.0

        # Primary score formula
        score = overlap_ratio * avg_confidence

        scored.append({
            "song": song,
            "score": round(score, 4),
            "overlap_ratio": round(overlap_ratio, 4),
            "avg_confidence": round(avg_confidence, 4),
            "matched_instruments": matched_keys,
            "match_reason": "instruments",
        })
        seen_ids.add(sid)

    # Sort descending by score, then avg_confidence
    scored.sort(key=lambda x: (x["score"], x["avg_confidence"]), reverse=True)

    return {
        "recommendations": scored[:limit],
        "detected_instruments": list(detected_set),
        "search_instruments": search_instruments,
        "excluded_songs": list(excluded_ids),
    }


async def recommend_by_genre(
    genre: str,
    limit: int = 10,
    exclude_song_id: Optional[str] = None,
    played_song_ids: Optional[List[str]] = None,
) -> dict:
    """Recommend songs based on genre, excluding current and played session songs."""
    songs = await _fetch_songs_by_genre(genre, limit * 2)

    # Build excluded IDs set
    excluded_ids: Set[str] = set()
    if exclude_song_id:
        excluded_ids.add(exclude_song_id.strip())
    if played_song_ids:
        for pid in played_song_ids:
            if pid and pid.strip():
                excluded_ids.add(pid.strip())

    typical_instruments = GENRE_INSTRUMENTS.get(genre.lower(), [])
    instrument_songs = []
    if typical_instruments:
        instrument_songs = await _fetch_songs_by_instruments(typical_instruments, limit)

    seen_ids = set()
    merged = []
    for song in songs + instrument_songs:
        sid = song.get("id")
        if sid and sid not in seen_ids and sid not in excluded_ids:
            seen_ids.add(sid)
            merged.append({
                "song": song,
                "score": 1.0,
                "overlap_ratio": 1.0,
                "avg_confidence": 1.0,
                "matched_instruments": list((song.get("instruments") or {}).keys()),
                "match_reason": "genre",
            })

    return {
        "recommendations": merged[:limit],
        "genre": genre,
        "typical_instruments": typical_instruments,
    }
