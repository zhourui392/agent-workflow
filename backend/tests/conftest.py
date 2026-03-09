"""Shared test fixtures for all test modules."""
import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from src.store.models import Base
from src.store.database import get_session

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"
test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
test_session_factory = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for the test session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create tables and provide a test DB session."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with test_session_factory() as session:
        yield session

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP test client with overridden DB session."""
    from src.main import app

    async def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# --- Reusable test data ---

SAMPLE_WORKFLOW = {
    "name": "test-workflow",
    "description": "A test workflow",
    "enabled": True,
    "schedule": None,
    "steps": [
        {
            "name": "step-1",
            "prompt": "Hello, do something",
            "tools": ["bash", "read"],
            "model": "claude-sonnet-4-6",
            "max_turns": 10,
        }
    ],
    "on_failure": "stop",
}

SAMPLE_MULTI_STEP_WORKFLOW = {
    "name": "multi-step-workflow",
    "description": "A workflow with multiple steps and template variables",
    "enabled": True,
    "schedule": "0 9 * * 1-5",
    "inputs": {"repo_path": "/tmp/repo", "since": "{{yesterday}}"},
    "steps": [
        {
            "name": "collect",
            "prompt": "Check changes in {{inputs.repo_path}} since {{inputs.since}}",
            "tools": ["bash", "read"],
            "model": "claude-sonnet-4-6",
        },
        {
            "name": "review",
            "prompt": "Review: {{steps.collect.output}}",
            "tools": ["read"],
            "model": "claude-opus-4-6",
        },
    ],
    "rules": {
        "system_prompt": "You are a code reviewer",
        "allowed_tools": ["bash", "read", "glob"],
    },
    "limits": {"max_tokens": 200000, "max_duration": 1800},
    "output": {"file": "/tmp/review-{{today}}.md"},
    "on_failure": "stop",
}
