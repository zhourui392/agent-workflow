"""Execution history API endpoints."""
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
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


@router.get("/stats")
async def get_execution_stats(
    days: int = Query(30, ge=1, le=365),
    session: AsyncSession = Depends(get_session),
):
    """Get execution statistics aggregated by day."""
    since = datetime.utcnow() - timedelta(days=days)
    result = await session.execute(
        select(Execution).where(Execution.started_at >= since)
    )
    executions = result.scalars().all()

    # Aggregate by date
    daily_map: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "success": 0, "failed": 0, "total_tokens": 0}
    )
    total_executions = 0
    success_count = 0
    failed_count = 0
    total_tokens = 0

    for ex in executions:
        date_key = ex.started_at.strftime("%Y-%m-%d") if ex.started_at else "unknown"
        daily_map[date_key]["total"] += 1
        daily_map[date_key]["total_tokens"] += ex.total_tokens or 0
        if ex.status == "success":
            daily_map[date_key]["success"] += 1
            success_count += 1
        elif ex.status == "failed":
            daily_map[date_key]["failed"] += 1
            failed_count += 1
        total_executions += 1
        total_tokens += ex.total_tokens or 0

    # Build sorted daily list (fill in missing dates)
    daily = []
    for i in range(days):
        date = (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%Y-%m-%d")
        entry = daily_map.get(date, {"total": 0, "success": 0, "failed": 0, "total_tokens": 0})
        daily.append({"date": date, **entry})

    return {
        "daily": daily,
        "summary": {
            "total_executions": total_executions,
            "success_count": success_count,
            "failed_count": failed_count,
            "total_tokens": total_tokens,
            "success_rate": round(success_count / total_executions * 100, 1) if total_executions else 0,
        },
    }


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
