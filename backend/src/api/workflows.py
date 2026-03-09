"""Workflow CRUD API endpoints."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.store.database import get_session
from src.store.models import Workflow
from src.store.schemas import WorkflowCreate, WorkflowResponse, WorkflowUpdate

router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.get("", response_model=list[WorkflowResponse])
async def list_workflows(session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Workflow).order_by(Workflow.updated_at.desc()))
    return result.scalars().all()


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(data: WorkflowCreate, session: AsyncSession = Depends(get_session)):
    # Check name uniqueness
    existing = await session.execute(select(Workflow).where(Workflow.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Workflow name '{data.name}' already exists")
    if not data.steps:
        raise HTTPException(400, "Workflow must have at least one step")

    workflow = Workflow(
        name=data.name,
        description=data.description,
        enabled=data.enabled,
        schedule=data.schedule,
        inputs=data.inputs,
        steps=[s.model_dump() for s in data.steps],
        rules=data.rules,
        mcp_servers=data.mcp_servers,
        skills=data.skills,
        limits=data.limits,
        output=data.output,
        on_failure=data.on_failure,
    )
    session.add(workflow)
    await session.commit()
    await session.refresh(workflow)

    # Register cron if enabled and has schedule
    if workflow.enabled and workflow.schedule:
        try:
            from src.scheduler.cron_manager import register_workflow

            await register_workflow(workflow)
        except Exception:
            pass

    return workflow


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")
    return workflow


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str, data: WorkflowUpdate, session: AsyncSession = Depends(get_session)
):
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")

    update_data = data.model_dump(exclude_unset=True)
    if "steps" in update_data:
        update_data["steps"] = [
            s.model_dump() if hasattr(s, "model_dump") else s for s in update_data["steps"]
        ]

    if "name" in update_data and update_data["name"] != workflow.name:
        existing = await session.execute(
            select(Workflow).where(Workflow.name == update_data["name"])
        )
        if existing.scalar_one_or_none():
            raise HTTPException(400, f"Workflow name '{update_data['name']}' already exists")

    for key, value in update_data.items():
        setattr(workflow, key, value)

    await session.commit()
    await session.refresh(workflow)

    # Update scheduler
    try:
        from src.scheduler.cron_manager import register_workflow, unregister_workflow

        await unregister_workflow(workflow.id)
        if workflow.enabled and workflow.schedule:
            await register_workflow(workflow)
    except Exception:
        pass

    return workflow


@router.delete("/{workflow_id}", status_code=204)
async def delete_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")

    try:
        from src.scheduler.cron_manager import unregister_workflow

        await unregister_workflow(workflow_id)
    except Exception:
        pass

    await session.delete(workflow)
    await session.commit()


@router.patch("/{workflow_id}/toggle", response_model=WorkflowResponse)
async def toggle_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")

    workflow.enabled = not workflow.enabled
    await session.commit()
    await session.refresh(workflow)

    try:
        from src.scheduler.cron_manager import register_workflow, unregister_workflow

        if workflow.enabled and workflow.schedule:
            await register_workflow(workflow)
        else:
            await unregister_workflow(workflow.id)
    except Exception:
        pass

    return workflow


@router.post("/{workflow_id}/run")
async def run_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")

    from src.core.pipeline import execute_workflow

    execution_id = await execute_workflow(workflow, trigger_type="manual")

    return {"execution_id": execution_id}


@router.get("/{workflow_id}/export")
async def export_workflow(workflow_id: str, session: AsyncSession = Depends(get_session)):
    """Export a workflow as JSON (excludes id and timestamps)."""
    workflow = await session.get(Workflow, workflow_id)
    if not workflow:
        raise HTTPException(404, "Workflow not found")

    export_data = {
        "name": workflow.name,
        "description": workflow.description,
        "enabled": workflow.enabled,
        "schedule": workflow.schedule,
        "inputs": workflow.inputs,
        "steps": workflow.steps,
        "rules": workflow.rules,
        "mcp_servers": workflow.mcp_servers,
        "skills": workflow.skills,
        "limits": workflow.limits,
        "output": workflow.output,
        "on_failure": workflow.on_failure,
    }
    return JSONResponse(
        content=export_data,
        headers={"Content-Disposition": f'attachment; filename="{workflow.name}.json"'},
    )


@router.post("/import", response_model=WorkflowResponse, status_code=201)
async def import_workflow(data: WorkflowCreate, session: AsyncSession = Depends(get_session)):
    """Import a workflow from JSON. Auto-renames if name conflicts."""
    # Auto-rename on conflict
    base_name = data.name
    name = base_name
    suffix = 1
    while True:
        existing = await session.execute(select(Workflow).where(Workflow.name == name))
        if not existing.scalar_one_or_none():
            break
        suffix += 1
        name = f"{base_name} ({suffix})"

    workflow = Workflow(
        name=name,
        description=data.description,
        enabled=False,  # Imported workflows start disabled
        schedule=data.schedule,
        inputs=data.inputs,
        steps=[s.model_dump() for s in data.steps] if data.steps else [],
        rules=data.rules,
        mcp_servers=data.mcp_servers,
        skills=data.skills,
        limits=data.limits,
        output=data.output,
        on_failure=data.on_failure,
    )
    session.add(workflow)
    await session.commit()
    await session.refresh(workflow)
    return workflow
