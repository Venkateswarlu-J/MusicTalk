import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

load_dotenv()

# MySQL connection settings
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "musictalk_catalog")

DEFAULT_MYSQL_URL = (
    f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4"
)

DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_MYSQL_URL)


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_recycle=3600,
    pool_pre_ping=True
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


from sqlalchemy import text


async def init_db():
    """Create all MySQL tables on startup if they do not exist, and ensure schema migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Ensure new columns exist on existing table
        alter_statements = [
            "ALTER TABLE songs ADD COLUMN status VARCHAR(32) DEFAULT 'DONE'",
            "ALTER TABLE songs ADD COLUMN file_hash VARCHAR(64) NULL",
            "ALTER TABLE songs ADD COLUMN storage_path VARCHAR(512) NULL",
            "ALTER TABLE songs ADD UNIQUE INDEX uq_songs_file_hash (file_hash)",
            "ALTER TABLE songs ADD INDEX ix_songs_status (status)",
        ]
        for stmt in alter_statements:
            try:
                await conn.execute(text(stmt))
            except Exception:
                # Column / index already exists, ignore
                pass


async def get_db() -> AsyncSession:
    """Dependency: yields an async MySQL session."""
    async with async_session() as session:
        yield session