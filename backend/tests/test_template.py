"""Tests for template variable engine.

Based on: docs/tech-spec.md Section 3.6 模板变量
Tests: render_template and evaluate_condition
"""
from datetime import datetime, timedelta

from src.core.template import evaluate_condition, render_template


class TestRenderTemplate:
    """Test render_template function."""

    def test_builtin_today(self):
        """{{today}} should render current date YYYY-MM-DD."""
        result = render_template("Date: {{today}}", {})
        today = datetime.now().strftime("%Y-%m-%d")
        assert result == f"Date: {today}"

    def test_builtin_yesterday(self):
        """{{yesterday}} should render yesterday's date."""
        result = render_template("Since {{yesterday}}", {})
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        assert result == f"Since {yesterday}"

    def test_builtin_now(self):
        """{{now}} should render current datetime."""
        result = render_template("At {{now}}", {})
        assert result.startswith("At 20")
        assert len(result) > len("At 2026-03-09")

    def test_builtin_date(self):
        """{{date}} should be same as {{today}}."""
        result = render_template("{{date}}", {})
        today = datetime.now().strftime("%Y-%m-%d")
        assert result == today

    def test_builtin_time(self):
        """{{time}} should render current time HH:MM:SS."""
        result = render_template("{{time}}", {})
        assert len(result) == 8  # HH:MM:SS
        assert ":" in result

    def test_inputs_variable(self):
        """{{inputs.xxx}} should render from context inputs."""
        context = {"inputs": {"repo_path": "/my/repo", "branch": "main"}}
        result = render_template("Path: {{inputs.repo_path}}, branch: {{inputs.branch}}", context)
        assert result == "Path: /my/repo, branch: main"

    def test_inputs_missing(self):
        """Missing input variables should remain unreplaced."""
        context = {"inputs": {}}
        result = render_template("{{inputs.missing}}", context)
        assert result == "{{inputs.missing}}"

    def test_steps_output_variable(self):
        """{{steps.step_name.output}} should render previous step output."""
        context = {"step_collect": "Some collected data"}
        result = render_template("Review: {{steps.collect.output}}", context)
        assert result == "Review: Some collected data"

    def test_direct_step_reference(self):
        """{{step_name}} shorthand should also work."""
        context = {"step_collect": "Direct output"}
        result = render_template("Data: {{collect}}", context)
        assert result == "Data: Direct output"

    def test_empty_template(self):
        """Empty/None template should return as-is."""
        assert render_template("", {}) == ""
        assert render_template(None, {}) is None

    def test_no_variables(self):
        """Template without variables should pass through unchanged."""
        result = render_template("Hello world, no variables here", {})
        assert result == "Hello world, no variables here"

    def test_multiple_variables(self):
        """Multiple different variable types in one template."""
        context = {
            "inputs": {"repo": "/repo"},
            "step_collect": "collected data",
        }
        result = render_template(
            "Date: {{today}}, Repo: {{inputs.repo}}, Data: {{steps.collect.output}}",
            context,
        )
        today = datetime.now().strftime("%Y-%m-%d")
        assert result == f"Date: {today}, Repo: /repo, Data: collected data"

    def test_unresolved_variable_kept(self):
        """Unresolved variables should remain in the output."""
        result = render_template("{{unknown_var}}", {})
        assert result == "{{unknown_var}}"


class TestEvaluateCondition:
    """Test evaluate_condition function."""

    def test_empty_condition_is_true(self):
        """Empty or None condition should evaluate to True (always execute)."""
        assert evaluate_condition("", {}) is True
        assert evaluate_condition(None, {}) is True
        assert evaluate_condition("  ", {}) is True

    def test_literal_true(self):
        """Literal 'true' should evaluate to True."""
        assert evaluate_condition("true", {}) is True
        assert evaluate_condition("True", {}) is True
        assert evaluate_condition("1", {}) is True
        assert evaluate_condition("yes", {}) is True

    def test_literal_false(self):
        """Literal 'false' should evaluate to False."""
        assert evaluate_condition("false", {}) is False
        assert evaluate_condition("False", {}) is False
        assert evaluate_condition("0", {}) is False
        assert evaluate_condition("no", {}) is False

    def test_truthy_check_non_empty(self):
        """Non-empty resolved value should be truthy."""
        context = {"step_search": "found results"}
        assert evaluate_condition("{{steps.search.output}}", context) is True

    def test_truthy_check_unresolved(self):
        """Unresolved template variable should be falsy."""
        assert evaluate_condition("{{steps.missing.output}}", {}) is False

    def test_contains_match(self):
        """'contains' operator should check substring."""
        context = {"step_search": "Error: file not found"}
        assert evaluate_condition("{{steps.search.output}} contains 'Error'", context) is True

    def test_contains_no_match(self):
        """'contains' should return False when substring not found."""
        context = {"step_search": "All good, no issues"}
        assert evaluate_condition("{{steps.search.output}} contains 'Error'", context) is False

    def test_equality_check(self):
        """'==' operator should check exact equality."""
        context = {"step_check": "success"}
        assert evaluate_condition("{{steps.check.output}} == 'success'", context) is True
        assert evaluate_condition("{{steps.check.output}} == 'failed'", context) is False

    def test_inequality_check(self):
        """'!=' operator should check inequality."""
        context = {"step_check": "success"}
        assert evaluate_condition("{{steps.check.output}} != 'failed'", context) is True
        assert evaluate_condition("{{steps.check.output}} != 'success'", context) is False
