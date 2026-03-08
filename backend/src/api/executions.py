"""Execution history API endpoints."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.store.database import get_session
from src.store.models import Execution
from src.store.schemas import ExecutionDetailResponse, ExecutionResponse

router = APIRouter(prefix="/api/executions", tags=["executions"])


@router.get("", response_model=list[ExecutionResponse])
async def list_executions(
    workflow_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    session: AsyncSession = Depends(get_session),
):
    query = select(Execution).order_by(desc(Execution.started_at))

    if workflow_id:
        query = query.where(Execution.workflow_id == workflow_id)
    if status:
        query = query.where(Execution.status == status)

    query = query.offset(offset).limit(limit)
    result = await session.execute(query)
    return result.scalars().all()


@router.get("/{execution_id}", response_model=ExecutionDetailResponse)
async def get_execution(execution_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Execution)
        .options(selectinload(Execution.step_executions))
        .where(Execution.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, "Execution not found")

    # Sort step_executions by step_index
    execution.step_executions.sort(key=lambda s: s.step_index)
    return execution
