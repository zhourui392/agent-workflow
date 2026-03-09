"""Tests for workflow CRUD API endpoints.

Based on: docs/tech-spec.md Section 5.1 工作流管理 API
Tests: GET/POST/PUT/DELETE /api/workflows, toggle, export, import
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient

from tests.conftest import SAMPLE_WORKFLOW, SAMPLE_MULTI_STEP_WORKFLOW


@pytest.mark.asyncio
class TestWorkflowCRUD:
    """Test workflow CRUD operations — spec Section 5.1."""

    async def test_create_workflow(self, client: AsyncClient):
        """POST /api/workflows — 创建工作流。"""
        resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "test-workflow"
        assert data["description"] == "A test workflow"
        assert data["enabled"] is True
        assert len(data["steps"]) == 1
        assert data["steps"][0]["name"] == "step-1"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    async def test_create_workflow_name_unique(self, client: AsyncClient):
        """POST /api/workflows — 工作流名称必须唯一。"""
        await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        assert resp.status_code == 400
        assert "already exists" in resp.json()["detail"]

    async def test_create_workflow_requires_steps(self, client: AsyncClient):
        """POST /api/workflows — 必须至少有一个步骤。"""
        data = {**SAMPLE_WORKFLOW, "name": "no-steps", "steps": []}
        resp = await client.post("/api/workflows", json=data)
        assert resp.status_code == 400
        assert "at least one step" in resp.json()["detail"]

    async def test_list_workflows(self, client: AsyncClient):
        """GET /api/workflows — 获取工作流列表。"""
        await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        resp = await client.get("/api/workflows")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["name"] == "test-workflow"

    async def test_get_workflow(self, client: AsyncClient):
        """GET /api/workflows/{id} — 获取工作流详情。"""
        create_resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        wf_id = create_resp.json()["id"]

        resp = await client.get(f"/api/workflows/{wf_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == wf_id
        assert resp.json()["name"] == "test-workflow"

    async def test_get_workflow_not_found(self, client: AsyncClient):
        """GET /api/workflows/{id} — 不存在返回404。"""
        resp = await client.get("/api/workflows/nonexistent-id")
        assert resp.status_code == 404

    async def test_update_workflow(self, client: AsyncClient):
        """PUT /api/workflows/{id} — 更新工作流。"""
        create_resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        wf_id = create_resp.json()["id"]

        update_data = {"description": "Updated description", "on_failure": "skip"}
        resp = await client.put(f"/api/workflows/{wf_id}", json=update_data)
        assert resp.status_code == 200
        assert resp.json()["description"] == "Updated description"
        assert resp.json()["on_failure"] == "skip"

    async def test_update_workflow_name_conflict(self, client: AsyncClient):
        """PUT /api/workflows/{id} — 更新名称冲突返回400。"""
        await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        create_resp2 = await client.post(
            "/api/workflows",
            json={**SAMPLE_WORKFLOW, "name": "another-workflow"},
        )
        wf_id2 = create_resp2.json()["id"]

        resp = await client.put(
            f"/api/workflows/{wf_id2}",
            json={"name": "test-workflow"},
        )
        assert resp.status_code == 400

    async def test_delete_workflow(self, client: AsyncClient):
        """DELETE /api/workflows/{id} — 删除工作流。"""
        create_resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        wf_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/workflows/{wf_id}")
        assert resp.status_code == 204

        resp = await client.get(f"/api/workflows/{wf_id}")
        assert resp.status_code == 404

    async def test_delete_workflow_not_found(self, client: AsyncClient):
        """DELETE /api/workflows/{id} — 不存在返回404。"""
        resp = await client.delete("/api/workflows/nonexistent-id")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWorkflowToggle:
    """Test toggle enable/disable — spec Section 3.4 启用/停用机制。"""

    async def test_toggle_disable(self, client: AsyncClient):
        """PATCH /api/workflows/{id}/toggle — 停用工作流。"""
        create_resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        wf_id = create_resp.json()["id"]
        assert create_resp.json()["enabled"] is True

        resp = await client.patch(f"/api/workflows/{wf_id}/toggle")
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False

    async def test_toggle_enable(self, client: AsyncClient):
        """PATCH /api/workflows/{id}/toggle — 再次切换恢复启用。"""
        create_resp = await client.post(
            "/api/workflows",
            json={**SAMPLE_WORKFLOW, "enabled": True},
        )
        wf_id = create_resp.json()["id"]

        # Toggle off
        await client.patch(f"/api/workflows/{wf_id}/toggle")
        # Toggle on
        resp = await client.patch(f"/api/workflows/{wf_id}/toggle")
        assert resp.json()["enabled"] is True

    async def test_toggle_not_found(self, client: AsyncClient):
        """PATCH /api/workflows/{id}/toggle — 不存在返回404。"""
        resp = await client.patch("/api/workflows/nonexistent-id/toggle")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWorkflowExportImport:
    """Test export/import — spec P2 工作流导入/导出。"""

    async def test_export_workflow(self, client: AsyncClient):
        """GET /api/workflows/{id}/export — 导出不含id和时间戳。"""
        create_resp = await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        wf_id = create_resp.json()["id"]

        resp = await client.get(f"/api/workflows/{wf_id}/export")
        assert resp.status_code == 200
        data = resp.json()
        assert "id" not in data
        assert "created_at" not in data
        assert "updated_at" not in data
        assert data["name"] == "test-workflow"

    async def test_import_workflow(self, client: AsyncClient):
        """POST /api/workflows/import — 导入工作流，默认disabled。"""
        resp = await client.post("/api/workflows/import", json=SAMPLE_WORKFLOW)
        assert resp.status_code == 201
        data = resp.json()
        assert data["enabled"] is False  # Imported workflows start disabled
        assert data["name"] == "test-workflow"

    async def test_import_auto_rename(self, client: AsyncClient):
        """POST /api/workflows/import — 名称冲突自动重命名。"""
        await client.post("/api/workflows", json=SAMPLE_WORKFLOW)
        resp = await client.post("/api/workflows/import", json=SAMPLE_WORKFLOW)
        assert resp.status_code == 201
        assert resp.json()["name"] == "test-workflow (2)"

    async def test_export_not_found(self, client: AsyncClient):
        """GET /api/workflows/{id}/export — 不存在返回404。"""
        resp = await client.get("/api/workflows/nonexistent-id/export")
        assert resp.status_code == 404


@pytest.mark.asyncio
class TestWorkflowWithFullConfig:
    """Test creating workflows with complete config — spec Section 5.5。"""

    async def test_create_full_workflow(self, client: AsyncClient):
        """创建完整配置的多步骤工作流。"""
        resp = await client.post("/api/workflows", json=SAMPLE_MULTI_STEP_WORKFLOW)
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "multi-step-workflow"
        assert len(data["steps"]) == 2
        assert data["schedule"] == "0 9 * * 1-5"
        assert data["rules"]["system_prompt"] == "You are a code reviewer"
        assert data["limits"]["max_tokens"] == 200000
        assert data["on_failure"] == "stop"
