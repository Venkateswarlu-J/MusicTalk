import asyncio
import logging
from src.database import init_db, async_session
from src.models import Song

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("catalog-seed")

SAMPLE_SONGS = [
    {
        "id": "s001",
        "title": "Moonlight Sonata (Movement 1)",
        "artist": "Ludwig van Beethoven",
        "album": "Classical Masterpieces",
        "genre": "classical",
        "duration_sec": 360.0,
        "instruments": {"piano": 0.98},
        "tags": ["classical", "piano", "solo", "calm"],
    },
    {
        "id": "s002",
        "title": "Clair de Lune",
        "artist": "Claude Debussy",
        "album": "Suite Bergamasque",
        "genre": "classical",
        "duration_sec": 305.0,
        "instruments": {"piano": 0.95},
        "tags": ["impressionism", "piano", "relaxing"],
    },
    {
        "id": "s003",
        "title": "Blackbird",
        "artist": "The Beatles",
        "album": "The White Album",
        "genre": "folk",
        "duration_sec": 138.0,
        "instruments": {"acoustic_guitar": 0.92, "voice": 0.88},
        "tags": ["folk", "acoustic", "classic rock"],
    },
    {
        "id": "s004",
        "title": "Hotel California (Acoustic Live)",
        "artist": "Eagles",
        "album": "Hell Freezes Over",
        "genre": "rock",
        "duration_sec": 432.0,
        "instruments": {"acoustic_guitar": 0.95, "voice": 0.90},
        "tags": ["rock", "acoustic", "live"],
    },
    {
        "id": "s005",
        "title": "Sultans of Swing",
        "artist": "Dire Straits",
        "album": "Dire Straits",
        "genre": "rock",
        "duration_sec": 348.0,
        "instruments": {"electric_guitar": 0.96, "voice": 0.85},
        "tags": ["rock", "guitar solo", "classic"],
    },
    {
        "id": "s006",
        "title": "Eruption",
        "artist": "Van Halen",
        "album": "Van Halen",
        "genre": "rock",
        "duration_sec": 102.0,
        "instruments": {"electric_guitar": 0.99},
        "tags": ["rock", "guitar solo", "legendary"],
    },
    {
        "id": "s007",
        "title": "Someone Like You",
        "artist": "Adele",
        "album": "21",
        "genre": "pop",
        "duration_sec": 285.0,
        "instruments": {"piano": 0.92, "voice": 0.98},
        "tags": ["pop", "ballad", "vocal", "piano"],
    },
    {
        "id": "s008",
        "title": "All of Me",
        "artist": "John Legend",
        "album": "Love in the Future",
        "genre": "r&b",
        "duration_sec": 269.0,
        "instruments": {"piano": 0.94, "voice": 0.96},
        "tags": ["r&b", "soul", "piano", "ballad"],
    },
    {
        "id": "s009",
        "title": "The Four Seasons: Spring",
        "artist": "Antonio Vivaldi",
        "album": "The Four Seasons",
        "genre": "classical",
        "duration_sec": 210.0,
        "instruments": {"violin": 0.98, "cello": 0.85},
        "tags": ["baroque", "violin", "orchestral"],
    },
    {
        "id": "s010",
        "title": "Cello Suite No. 1 in G Major: Prelude",
        "artist": "Johann Sebastian Bach",
        "album": "Cello Suites",
        "genre": "classical",
        "duration_sec": 160.0,
        "instruments": {"cello": 0.99},
        "tags": ["classical", "cello", "solo", "baroque"],
    },
    {
        "id": "s011",
        "title": "Take Five",
        "artist": "Dave Brubeck Quartet",
        "album": "Time Out",
        "genre": "jazz",
        "duration_sec": 324.0,
        "instruments": {"saxophone": 0.95, "piano": 0.88},
        "tags": ["jazz", "saxophone", "cool jazz"],
    },
    {
        "id": "s012",
        "title": "So What",
        "artist": "Miles Davis",
        "album": "Kind of Blue",
        "genre": "jazz",
        "duration_sec": 562.0,
        "instruments": {"trumpet": 0.97, "saxophone": 0.90, "piano": 0.82},
        "tags": ["jazz", "modal jazz", "trumpet"],
    },
    {
        "id": "s013",
        "title": "A Whiter Shade of Pale",
        "artist": "Procol Harum",
        "album": "Procol Harum",
        "genre": "rock",
        "duration_sec": 243.0,
        "instruments": {"organ": 0.96, "voice": 0.91},
        "tags": ["psychedelic rock", "organ", "classic"],
    },
    {
        "id": "s014",
        "title": "Badinerie (Orchestral Suite No. 2)",
        "artist": "Johann Sebastian Bach",
        "album": "Orchestral Suites",
        "genre": "classical",
        "duration_sec": 84.0,
        "instruments": {"flute": 0.97},
        "tags": ["baroque", "flute", "cheerful"],
    },
    {
        "id": "s015",
        "title": "Rhapsody in Blue (Opening)",
        "artist": "George Gershwin",
        "album": "American Classics",
        "genre": "classical",
        "duration_sec": 180.0,
        "instruments": {"clarinet": 0.96, "piano": 0.90},
        "tags": ["orchestral", "clarinet", "jazz fusion", "classical"],
    }
]


async def seed():
    logger.info("Initializing MySQL tables...")
    await init_db()

    async with async_session() as session:
        for song_data in SAMPLE_SONGS:
            existing = await session.get(Song, song_data["id"])
            if not existing:
                song = Song(**song_data, status="DONE")
                session.add(song)
                logger.info(f"Added: {song_data['title']} ({song_data['artist']})")
            else:
                existing.status = "DONE"
                logger.info(f"Already exists: {song_data['title']} (status set to DONE)")

        await session.commit()
        logger.info("Catalog database seeded successfully!")


if __name__ == "__main__":
    asyncio.run(seed())
