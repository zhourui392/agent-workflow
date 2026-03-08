"""APScheduler cron management."""
import asyncio
from typing import Optional

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = structlog.get_logger()

scheduler: Optional[AsyncIOScheduler] = None


def init_scheduler() -> AsyncIOScheduler:
    """Create and start APScheduler instance."""
    global scheduler
    scheduler = AsyncIOScheduler()
    scheduler.start()
    logger.info("scheduler_started")
    return scheduler


def shutdown_scheduler():
    """Shutdown scheduler."""
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_shutdown")


async def register_workflow(workflow):
    """Parse cron expression and add job for workflow."""
    global scheduler
    if not scheduler:
        logger.warning("scheduler_not_initialized")
        return

    if not workflow.schedule:
        return

    job_id = f"workflow_{workflow.id}"

    # Remove existing job if any
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    try:
        # Parse cron expression (5 fields: minute hour day month day_of_week)
        parts = workflow.schedule.strip().split()
        if len(parts) == 5:
            trigger = CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
            )
        elif len(parts) == 6:
            trigger = CronTrigger(
                second=parts[0],
                minute=parts[1],
                hour=parts[2],
                day=parts[3],
                month=parts[4],
                day_of_week=parts[5],
            )
        else:
            trigger = CronTrigger.from_crontab(workflow.schedule)

        scheduler.add_job(
            _trigger_workflow,
            trigger=trigger,
            id=job_id,
            args=[workflow.id],
            replace_existing=True,
            name=f"Workflow: {workflow.name}",
        )
        logger.info("workflow_registered", workflow_id=workflow.id, schedule=workflow.schedule)
    except Exception as e:
        logger.error("failed_to_register_workflow", workflow_id=workflow.id, error=str(e))


async def unregister_workflow(workflow_id: str):
    """Remove cron job for workflow."""
    global scheduler
    if not scheduler:
        return

    job_id = f"workflow_{workflow_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("workflow_unregistered", workflow_id=workflow_id)


async def sync_all():
    """Scan DB and register all enabled workflows with schedules."""
    from sqlalchemy import select

    from src.store.database import async_session
    from src.store.models import Workflow

    async with async_session() as session:
        result = await session.execute(
            select(Workflow).where(Workflow.enabled == True, Workflow.schedule.isnot(None))
        )
        workflows = result.scalars().all()

        for workflow in workflows:
            await register_workflow(workflow)

        logger.info("scheduler_synced", count=len(workflows))


def _trigger_workflow(workflow_id: str):
    """Callback for scheduled execution. Runs in the event loop."""
    asyncio.create_task(_execute_scheduled(workflow_id))


async def _execute_scheduled(workflow_id: str):
    """Execute a scheduled workflow."""
    from src.core.pipeline import execute_workflow
    from src.store.database import async_session
    from src.store.models import Workflow

    async with async_session() as session:
        workflow = await session.get(Workflow, workflow_id)
        if not workflow:
            logger.error("scheduled_workflow_not_found", workflow_id=workflow_id)
            return
        if not workflow.enabled:
            logger.info("scheduled_workflow_disabled", workflow_id=workflow_id)
            return

        execution_id = await execute_workflow(workflow, trigger_type="scheduled")
        logger.info(
            "scheduled_execution_started", workflow_id=workflow_id, execution_id=execution_id
        )
