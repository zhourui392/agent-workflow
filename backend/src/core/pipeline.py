"""Pipeline engine - orchestrates multi-step workflow execution."""
import asyncio
from datetime import datetime

import structlog

from src.api.ws import broadcast
from src.core.config_merger import merge_config
from src.core.executor import execute_step
from src.core.output_handler import handle_output
from src.store.database import async_session
from src.store.models import Execution, StepExecution, Workflow, generate_uuid

logger = structlog.get_logger()

DEFAULT_MAX_RETRIES = 3
DEFAULT_BASE_DELAY = 1.0
DEFAULT_MAX_DELAY = 30.0


async def _retry_step_with_backoff(
    step: dict,
    context: dict,
    merged_config: dict,
    execution_id: str,
    step_id: str,
    step_name: str,
    max_retries: int = DEFAULT_MAX_RETRIES,
    base_delay: float = DEFAULT_BASE_DELAY,
    max_delay: float = DEFAULT_MAX_DELAY,
) -> tuple:
    """Retry a failed step with exponential backoff.

    Args:
        step: Step configuration
        context: Execution context
        merged_config: Merged configuration
        execution_id: Current execution ID
        step_id: Current step execution ID
        step_name: Step name for logging
        max_retries: Maximum retry attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay cap in seconds

    Returns:
        Tuple of (StepResult, total_tokens_used_in_retries)
    """
    from src.core.executor import StepResult

    total_retry_tokens = 0

    for attempt in range(1, max_retries + 1):
        delay = min(base_delay * (2 ** (attempt - 1)), max_delay)

        logger.info(
            "step_retry_scheduled",
            execution_id=execution_id,
            step_name=step_name,
            attempt=attempt,
            max_retries=max_retries,
            delay=delay,
        )

        await broadcast(execution_id, {
            "type": "step_retry",
            "step_name": step_name,
            "attempt": attempt,
            "max_retries": max_retries,
            "delay": delay,
        })

        await asyncio.sleep(delay)

        result = await execute_step(step, context, merged_config)
        total_retry_tokens += result.tokens_used

        async with async_session() as session:
            step_exec = await session.get(StepExecution, step_id)
            if step_exec:
                step_exec.tokens_used = (step_exec.tokens_used or 0) + result.tokens_used
                if not result.failed:
                    step_exec.status = "success"
                    step_exec.output_text = result.output
                    step_exec.error_message = None
                    step_exec.finished_at = datetime.utcnow()
                await session.commit()

        if not result.failed:
            logger.info(
                "step_retry_succeeded",
                execution_id=execution_id,
                step_name=step_name,
                attempt=attempt,
            )
            await broadcast(execution_id, {
                "type": "step_retry_success",
                "step_name": step_name,
                "attempt": attempt,
            })
            return result, total_retry_tokens

        logger.warning(
            "step_retry_failed",
            execution_id=execution_id,
            step_name=step_name,
            attempt=attempt,
            error=result.error,
        )

    return result, total_retry_tokens


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
    start_time = datetime.utcnow()

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

        await broadcast(execution_id, {
            "type": "step_start",
            "step_index": i,
            "step_name": step_name,
            "total_steps": len(steps),
        })

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

        await broadcast(execution_id, {
            "type": "step_complete",
            "step_index": i,
            "step_name": step_name,
            "status": "failed" if result.failed else "success",
            "tokens_used": result.tokens_used,
            "output_preview": (result.output[:500] + "...") if len(result.output) > 500 else result.output,
            "error": result.error,
        })

        if result.failed:
            on_failure = workflow.on_failure or "stop"
            if on_failure == "retry":
                result, retry_tokens = await _retry_step_with_backoff(
                    step, context, merged_config, execution_id, step_id, step_name
                )
                total_tokens += retry_tokens
                if result.failed:
                    final_status = "failed"
                    error_message = f"Step '{step_name}' failed after retries: {result.error}"
                    break
                context[f"step_{step_name}"] = result.output
            elif on_failure == "stop":
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

    await broadcast(execution_id, {
        "type": "execution_complete",
        "status": final_status,
        "total_tokens": total_tokens,
        "error_message": error_message,
    })

    # Handle output (file write / webhook)
    if steps:
        last_step_name = steps[-1].get("name", f"step_{len(steps)}")
        context["final_output"] = context.get(f"step_{last_step_name}", "")

    duration = (datetime.utcnow() - start_time).total_seconds()
    await handle_output(
        workflow.output,
        context,
        workflow.name,
        final_status,
        total_tokens,
        duration,
    )
