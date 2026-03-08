"""Agent Workflow System - FastAPI application entry point."""
from contextlib import asynccontextmanager

import structlog
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup/shutdown events."""
    logger.info("agent_workflow_starting")

    # Initialize database
    from src.store.database import init_db

    await init_db()
    logger.info("database_initialized")

    # Initialize scheduler
    from src.scheduler.cron_manager import init_scheduler, shutdown_scheduler, sync_all

    init_scheduler()
    await sync_all()

    yield

    # Shutdown
    shutdown_scheduler()
    logger.info("agent_workflow_shutting_down")


app = FastAPI(
    title="Agent Workflow System",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from src.api.executions import router as executions_router
from src.api.workflows import router as workflows_router

app.include_router(workflows_router)
app.include_router(executions_router)


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)
