"""Pipeline engine - orchestrates multi-step workflow execution."""
import asyncio
from datetime import datetime

import structlog

from src.core.config_merger import merge_config
from src.core.executor import execute_step
from src.store.database import async_session
from src.store.models import Execution, StepExecution, Workflow, generate_uuid

logger = structlog.get_logger()


async def execute_workflow(workflow: Workflow, trigger_type: str = "manual") -> str:
    """Execute a workflow. Creates execution record and runs steps.

    Returns execution_id immediately, runs in background via create_task.
    """
    execution_id = generate_uuid()
    steps = workflow.steps or []

    # Create execution record
    async with async_session() as session:
        execution = Execution(
            id=execution_id,
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            trigger_type=trigger_type,
            status="pending",
            total_steps=len(steps),
            current_step=0,
        )
        session.add(execution)
        await session.commit()

    # Run in background
    asyncio.create_task(_run_pipeline(execution_id, workflow, steps))

    return execution_id


async def _run_pipeline(execution_id: str, workflow: Workflow, steps: list):
    """Internal: run all steps sequentially."""
    context = {"inputs": workflow.inputs or {}}
    total_tokens = 0
    final_status = "success"
    error_message = None

    # Update status to running
    async with async_session() as session:
        execution = await session.get(Execution, execution_id)
        if execution:
            execution.status = "running"
            execution.started_at = datetime.utcnow()
            await session.commit()

    # Merge config (global + workflow level)
    merged_config = await merge_config(workflow)

    # Check token budget
    max_tokens = None
    if workflow.limits:
        max_tokens = workflow.limits.get("max_tokens")
        max_duration = workflow.limits.get("max_duration")
        if max_duration:
            merged_config["max_duration"] = max_duration

    for i, step in enumerate(steps):
        step_id = generate_uuid()
        step_name = step.get("name", f"step_{i + 1}")

        logger.info("step_starting", execution_id=execution_id, step=i + 1, name=step_name)

        # Create step execution record
        async with async_session() as session:
            step_exec = StepExecution(
                id=step_id,
                execution_id=execution_id,
                step_index=i,
                step_name=step_name,
                status="running",
                started_at=datetime.utcnow(),
            )
            session.add(step_exec)

            execution = await session.get(Execution, execution_id)
            if execution:
                execution.current_step = i + 1
            await session.commit()

        # Token budget check
        if max_tokens and total_tokens >= max_tokens:
            async with async_session() as session:
                step_exec = await session.get(StepExecution, step_id)
                if step_exec:
                    step_exec.status = "failed"
                    step_exec.finished_at = datetime.utcnow()
                    step_exec.error_message = (
                        f"Token budget exceeded: {total_tokens}/{max_tokens}"
                    )
                    await session.commit()
            final_status = "failed"
            error_message = f"Token budget exceeded at step {i + 1}"
            break

        # Execute step
        result = await execute_step(step, context, merged_config)

        # Update step execution record
        async with async_session() as session:
            step_exec = await session.get(StepExecution, step_id)
            if step_exec:
                step_exec.status = "failed" if result.failed else "success"
                step_exec.finished_at = datetime.utcnow()
                step_exec.output_text = result.output
                step_exec.tokens_used = result.tokens_used
                step_exec.model_used = result.model_used
                step_exec.error_message = result.error
                # Store rendered prompt
                from src.core.template import render_template

                step_exec.prompt_rendered = render_template(step.get("prompt", ""), context)
                await session.commit()

        total_tokens += result.tokens_used

        if result.failed:
            on_failure = workflow.on_failure or "stop"
            if on_failure == "stop":
                final_status = "failed"
                error_message = f"Step '{step_name}' failed: {result.error}"
                break
            elif on_failure == "skip":
                context[f"step_{step_name}"] = f"[SKIPPED: {result.error}]"
                continue
        else:
            # Store output in context for next steps
            context[f"step_{step_name}"] = result.output

    # Update final execution status
    async with async_session() as session:
        execution = await session.get(Execution, execution_id)
        if execution:
            execution.status = final_status
            execution.finished_at = datetime.utcnow()
            execution.total_tokens = total_tokens
            execution.error_message = error_message
            await session.commit()

    logger.info(
        "workflow_completed", execution_id=execution_id, status=final_status, tokens=total_tokens
    )
