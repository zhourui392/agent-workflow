"""Tests for pipeline engine and executor.

Based on: docs/tech-spec.md Section 3.1 单步执行 & Section 3.2 Pipeline 执行
Tests: execute_workflow, step failure strategies, token budget, condition evaluation
"""
from unittest.mock import patch

import pytest

from src.core.executor import StepResult
from src.store.models import Base, Execution, Workflow, generate_uuid

from tests.conftest import test_engine, test_session_factory


def _make_workflow(
    steps: list = None,
    on_failure: str = "stop",
    limits: dict = None,
    inputs: dict = None,
) -> Workflow:
    """Create a Workflow ORM object with unique name."""
    return Workflow(
        id=generate_uuid(),
        name=f"pipeline-{generate_uuid()[:8]}",
        steps=steps or [{"name": "s1", "prompt": "do something"}],
        on_failure=on_failure,
        limits=limits,
        inputs=inputs,
    )


async def _setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def _teardown_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def _create_execution(workflow: Workflow, total_steps: int = 1) -> str:
    execution_id = generate_uuid()
    async with test_session_factory() as session:
        session.add(workflow)
        execution = Execution(
            id=execution_id,
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            trigger_type="manual",
            status="pending",
            total_steps=total_steps,
        )
        session.add(execution)
        await session.commit()
    return execution_id


MOCK_EXECUTE = "src.core.pipeline.execute_step"
MOCK_MERGE = "src.core.pipeline.merge_config"
MOCK_BROADCAST = "src.core.pipeline.broadcast"
MOCK_OUTPUT = "src.core.pipeline.handle_output"

DEFAULT_MERGED = {"system_prompt": "", "allowed_tools": None, "mcp_servers": {}}


@pytest.fixture(autouse=True)
def _patch_session():
    """Replace pipeline's async_session with test session factory."""
    with patch("src.core.pipeline.async_session", test_session_factory):
        yield


@pytest.mark.asyncio
class TestPipelineExecution:
    """Test pipeline orchestration logic."""

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_single_step_success(self, mock_output, mock_broadcast, mock_merge, mock_execute):
        """单步工作流成功执行。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.return_value = StepResult(output="step output", tokens_used=100)
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow()
            execution_id = await _create_execution(workflow)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            mock_execute.assert_called_once()
            async with test_session_factory() as session:
                ex = await session.get(Execution, execution_id)
                assert ex.status == "success"
                assert ex.total_tokens == 100
        finally:
            await _teardown_db()

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_step_failure_stop_strategy(
        self, mock_output, mock_broadcast, mock_merge, mock_execute
    ):
        """失败策略=stop时，步骤失败应终止pipeline。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.return_value = StepResult(failed=True, error="Something went wrong")
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow(
                steps=[{"name": "s1", "prompt": "first"}, {"name": "s2", "prompt": "second"}],
                on_failure="stop",
            )
            execution_id = await _create_execution(workflow, total_steps=2)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            assert mock_execute.call_count == 1
            async with test_session_factory() as session:
                ex = await session.get(Execution, execution_id)
                assert ex.status == "failed"
                assert "s1" in ex.error_message
        finally:
            await _teardown_db()

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_step_failure_skip_strategy(
        self, mock_output, mock_broadcast, mock_merge, mock_execute
    ):
        """失败策略=skip时，步骤失败应跳过继续执行后续步骤。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.side_effect = [
                StepResult(failed=True, error="first failed"),
                StepResult(output="second ok", tokens_used=50),
            ]
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow(
                steps=[{"name": "s1", "prompt": "first"}, {"name": "s2", "prompt": "second"}],
                on_failure="skip",
            )
            execution_id = await _create_execution(workflow, total_steps=2)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            assert mock_execute.call_count == 2
            async with test_session_factory() as session:
                ex = await session.get(Execution, execution_id)
                assert ex.status == "success"
        finally:
            await _teardown_db()

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_token_budget_exceeded(
        self, mock_output, mock_broadcast, mock_merge, mock_execute
    ):
        """Token预算超限应终止执行。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.return_value = StepResult(output="ok", tokens_used=1000)
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow(
                steps=[{"name": "s1", "prompt": "first"}, {"name": "s2", "prompt": "second"}],
                limits={"max_tokens": 500},
            )
            execution_id = await _create_execution(workflow, total_steps=2)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            async with test_session_factory() as session:
                ex = await session.get(Execution, execution_id)
                assert ex.status == "failed"
                assert "Token budget" in ex.error_message
        finally:
            await _teardown_db()

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_step_condition_skip(
        self, mock_output, mock_broadcast, mock_merge, mock_execute
    ):
        """when条件不满足时应跳过步骤。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.return_value = StepResult(output="ok", tokens_used=100)
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow(
                steps=[
                    {"name": "s1", "prompt": "first"},
                    {"name": "s2", "prompt": "second", "when": "false"},
                ],
            )
            execution_id = await _create_execution(workflow, total_steps=2)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            assert mock_execute.call_count == 1
        finally:
            await _teardown_db()

    @patch(MOCK_EXECUTE)
    @patch(MOCK_MERGE)
    @patch(MOCK_BROADCAST)
    @patch(MOCK_OUTPUT)
    async def test_multi_step_context_passing(
        self, mock_output, mock_broadcast, mock_merge, mock_execute
    ):
        """多步骤间上下文传递：前步输出应存入context供后步使用。"""
        from src.core.pipeline import _run_pipeline

        await _setup_db()
        try:
            mock_merge.return_value = DEFAULT_MERGED
            mock_execute.side_effect = [
                StepResult(output="step1 output data", tokens_used=100),
                StepResult(output="step2 output data", tokens_used=200),
            ]
            mock_broadcast.return_value = None
            mock_output.return_value = None

            workflow = _make_workflow(
                steps=[
                    {"name": "collect", "prompt": "collect data"},
                    {"name": "review", "prompt": "review {{steps.collect.output}}"},
                ],
            )
            execution_id = await _create_execution(workflow, total_steps=2)

            await _run_pipeline(execution_id, workflow, workflow.steps)

            assert mock_execute.call_count == 2
            second_call_context = mock_execute.call_args_list[1][0][1]
            assert second_call_context.get("step_collect") == "step1 output data"

            async with test_session_factory() as session:
                ex = await session.get(Execution, execution_id)
                assert ex.status == "success"
                assert ex.total_tokens == 300
        finally:
            await _teardown_db()
