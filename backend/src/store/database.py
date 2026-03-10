"""SQLite connection management with async SQLAlchemy."""
from pathlib import Path

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

logger = structlog.get_logger()

DATABASE_DIR = Path(__file__).parent.parent.parent / "data"
DATABASE_URL = f"sqlite+aiosqlite:///{DATABASE_DIR / 'agent_workflow.db'}"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session():
    async with async_session() as session:
        yield session


async def _migrate_add_column(conn, table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't exist (SQLite)."""
    result = await conn.execute(text(f"PRAGMA table_info({table})"))
    columns = [row[1] for row in result.fetchall()]
    if column not in columns:
        await conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
        logger.info("db_migration", table=table, column=column, action="added")


async def init_db():
    from src.store.models import Base

    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Incremental migrations for existing databases
        await _migrate_add_column(conn, "executions", "total_cost_usd", "REAL")
        await _migrate_add_column(conn, "step_executions", "cost_usd", "REAL")
