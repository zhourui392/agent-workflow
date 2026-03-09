"""Tests for execution history API endpoints.

Based on: docs/tech-spec.md Section 5.2 执行管理 API
Tests: GET /api/executions, GET /api/executions/{id}, GET /api/executions/stats
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime

from src.store.models import Execution, StepExecution, Workflow, generate_uuid


async def _create_workflow_and_execution(
    session: AsyncSession,
    workflow_name: str = "test-wf",
    status: str = "success",
    trigger_type: str = "manual",
    total_tokens: int = 1000,
) -> tuple[str, str]:
    """Helper: create a workflow and execution record directly in DB."""
    wf_id = generate_uuid()
    workflow = Workflow(
        id=wf_id,
        name=workflow_name,
        steps=[{"name": "s1", "prompt": "test"}],
        on_failure="stop",
    )
    session.add(workflow)

    ex_id = generate_uuid()
    execution = Execution(
        id=ex_id,
        workflow_id=wf_id,
        workflow_name=workflow_name,
        trigger_type=trigger_type,
        status=status,
        started_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
        current_step=1,
        total_steps=1,
        total_tokens=total_tokens,
    )
    session.add(execution)

    step_id = generate_uuid()
    step_exec = StepExecution(
        id=step_id,
        execution_id=ex_id,
        step_index=0,
        step_name="s1",
        status=status,
        started_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
        prompt_rendered="test prompt",
        output_text="test output",
        tokens_used=total_tokens,
        model_used="claude-sonnet-4-6",
    )
    session.add(step_exec)

    await session.commit()
    return wf_id, ex_id


@pytest.mark.asyncio
class TestExecutionList:
    """Test execution listing — spec Section 5.2."""

    async def test_list_executions_empty(self, client: AsyncClient):
        """GET /api/executions — 空列表。"""
        resp = await client.get("/api/executions")
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_executions(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions — 返回执行记录。"""
        await _create_workflow_and_execution(db_session)
        resp = await client.get("/api/executions")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["status"] == "success"
        assert data[0]["trigger_type"] == "manual"

    async def test_list_filter_by_workflow_id(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions?workflow_id=xxx — 按工作流过滤。"""
        wf_id, _ = await _create_workflow_and_execution(db_session, "wf-a")
        await _create_workflow_and_execution(db_session, "wf-b")

        resp = await client.get(f"/api/executions?workflow_id={wf_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert all(d["workflow_id"] == wf_id for d in data)

    async def test_list_filter_by_status(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions?status=failed — 按状态过滤。"""
        await _create_workflow_and_execution(db_session, "wf-ok", status="success")
        await _create_workflow_and_execution(db_session, "wf-fail", status="failed")

        resp = await client.get("/api/executions?status=failed")
        assert resp.status_code == 200
        data = resp.json()
        assert all(d["status"] == "failed" for d in data)

    async def test_list_pagination(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions?limit=1&offset=0 — 分页。"""
        await _create_workflow_and_execution(db_session, "wf-1")
        await _create_workflow_and_execution(db_session, "wf-2")

        resp = await client.get("/api/executions?limit=1&offset=0")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


@pytest.mark.asyncio
class TestExecutionDetail:
    """Test execution detail — spec Section 5.2."""

    async def test_get_execution_detail(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions/{id} — 返回执行详情含步骤明细。"""
        _, ex_id = await _create_workflow_and_execution(db_session)

        resp = await client.get(f"/api/executions/{ex_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == ex_id
        assert "step_executions" in data
        assert len(data["step_executions"]) == 1
        assert data["step_executions"][0]["step_name"] == "s1"
        assert data["step_executions"][0]["output_text"] == "test output"
        assert data["step_executions"][0]["tokens_used"] == 1000

    async def test_get_execution_not_found(self, client: AsyncClient):
        """GET /api/executions/{id} — 不存在返回404。"""
        resp = await client.get("/api/executions/nonexistent-id")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestExecutionStats:
    """Test execution stats — spec P2 执行统计。"""

    async def test_stats_empty(self, client: AsyncClient):
        """GET /api/executions/stats — 空数据应返回零值统计。"""
        resp = await client.get("/api/executions/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "daily" in data
        assert "summary" in data
        assert data["summary"]["total_executions"] == 0
        assert data["summary"]["success_rate"] == 0

    async def test_stats_with_data(self, client: AsyncClient, db_session: AsyncSession):
        """GET /api/executions/stats — 有数据时返回正确统计。"""
        await _create_workflow_and_execution(db_session, "wf-s1", status="success", total_tokens=500)
        await _create_workflow_and_execution(db_session, "wf-s2", status="success", total_tokens=300)
        await _create_workflow_and_execution(db_session, "wf-f1", status="failed", total_tokens=100)

        resp = await client.get("/api/executions/stats")
        data = resp.json()
        summary = data["summary"]
        assert summary["total_executions"] == 3
        assert summary["success_count"] == 2
        assert summary["failed_count"] == 1
        assert summary["total_tokens"] == 900
        assert summary["success_rate"] == pytest.approx(66.7, abs=0.1)

    async def test_stats_days_param(self, client: AsyncClient):
        """GET /api/executions/stats?days=7 — days参数控制时间范围。"""
        resp = await client.get("/api/executions/stats?days=7")
        assert resp.status_code == 200
        assert len(resp.json()["daily"]) == 7
