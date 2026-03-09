"""Tests for two-layer config merger.

Based on: docs/tech-spec.md Section 3.3 两层配置合并策略
Tests: merge_rules (拼接), merge_tools (取交集), merge_mcp (取并集), merge_skills (同名覆盖)
"""
from src.core.config_merger import merge_mcp, merge_rules, merge_skills, merge_tools


class TestMergeRules:
    """Rules合并策略: 全局在前 + 工作流在后，拼接。"""

    def test_both_present(self):
        """Global + workflow rules should concatenate."""
        result = merge_rules("Global rules", {"system_prompt": "Workflow rules"})
        assert "Global rules" in result
        assert "Workflow rules" in result
        assert result.index("Global rules") < result.index("Workflow rules")

    def test_global_only(self):
        """Only global rules present."""
        result = merge_rules("Global rules", None)
        assert result == "Global rules"

    def test_workflow_only(self):
        """Only workflow rules present."""
        result = merge_rules("", {"system_prompt": "Workflow rules"})
        assert result == "Workflow rules"

    def test_both_empty(self):
        """Both empty should return empty string."""
        result = merge_rules("", None)
        assert result == ""

    def test_workflow_without_system_prompt_key(self):
        """Workflow rules dict without system_prompt key."""
        result = merge_rules("Global", {"other_key": "value"})
        assert result == "Global"


class TestMergeTools:
    """工具白名单合并策略: 取交集 — 工作流只能收紧，不能放宽。"""

    def test_intersection(self):
        """Intersection of global and workflow tools."""
        result = merge_tools(["bash", "read", "glob", "write"], ["bash", "read"])
        assert set(result) == {"bash", "read"}

    def test_global_none(self):
        """Global tools is None → return workflow tools."""
        result = merge_tools(None, ["bash", "read"])
        assert result == ["bash", "read"]

    def test_workflow_none(self):
        """Workflow tools is None → return global tools."""
        result = merge_tools(["bash", "read"], None)
        assert result == ["bash", "read"]

    def test_both_none(self):
        """Both None → return None."""
        result = merge_tools(None, None)
        assert result is None

    def test_no_overlap(self):
        """No overlapping tools → empty list."""
        result = merge_tools(["bash", "read"], ["write", "glob"])
        assert result == []

    def test_workflow_cannot_expand(self):
        """Workflow cannot add tools beyond global scope."""
        result = merge_tools(["bash"], ["bash", "write", "glob"])
        assert set(result) == {"bash"}


class TestMergeMcp:
    """MCP服务合并策略: 取并集 — 全局 + 工作流各自的MCP服务都可用。"""

    def test_union(self):
        """Union of global and workflow MCP servers."""
        global_mcp = {"server_a": {"command": "a"}}
        workflow_mcp = {"server_b": {"command": "b"}}
        result = merge_mcp(global_mcp, workflow_mcp)
        assert "server_a" in result
        assert "server_b" in result

    def test_workflow_overrides_same_name(self):
        """Workflow MCP with same name should override global."""
        global_mcp = {"server_a": {"command": "old"}}
        workflow_mcp = {"server_a": {"command": "new"}}
        result = merge_mcp(global_mcp, workflow_mcp)
        assert result["server_a"]["command"] == "new"

    def test_global_only(self):
        """Only global MCP present."""
        result = merge_mcp({"server_a": {}}, None)
        assert "server_a" in result

    def test_both_empty(self):
        """Both empty → empty dict."""
        result = merge_mcp({}, None)
        assert result == {}


class TestMergeSkills:
    """Skills合并策略: 同名覆盖 — 工作流级同名Skill覆盖全局，不同名的保留。"""

    def test_merge_different_names(self):
        """Different skill names should all be kept."""
        global_skills = {"skill_a": "content_a"}
        workflow_skills = {"skill_b": "content_b"}
        result = merge_skills(global_skills, workflow_skills)
        assert result["skill_a"] == "content_a"
        assert result["skill_b"] == "content_b"

    def test_same_name_override(self):
        """Same skill name → workflow overrides global."""
        global_skills = {"skill_a": "global_content"}
        workflow_skills = {"skill_a": "workflow_content"}
        result = merge_skills(global_skills, workflow_skills)
        assert result["skill_a"] == "workflow_content"

    def test_global_only(self):
        """Only global skills present."""
        result = merge_skills({"skill_a": "content"}, None)
        assert result["skill_a"] == "content"

    def test_both_empty(self):
        """Both empty → empty dict."""
        result = merge_skills({}, None)
        assert result == {}
