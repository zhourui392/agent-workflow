"""SQLite connection management with async SQLAlchemy."""
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_DIR = Path(__file__).parent.parent.parent / "data"
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_DIR / 'agent_workflow.db'}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session():
    async with async_session() as session:
        yield session


async def init_db():
    from src.store.models import Base

    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
