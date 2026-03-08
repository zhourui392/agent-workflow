"""Two-layer config merger: global (disk) + workflow (DB)."""
from pathlib import Path
from typing import Optional

import structlog
import yaml

logger = structlog.get_logger()

GLOBAL_CONFIG_DIR = Path(__file__).parent.parent.parent / "global_config"


def load_global_system_prompt() -> str:
    """Load global system prompt from rules/system.md."""
    path = GLOBAL_CONFIG_DIR / "rules" / "system.md"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


def load_global_mcp_servers() -> dict:
    """Load global MCP servers from mcp/servers.yaml."""
    path = GLOBAL_CONFIG_DIR / "mcp" / "servers.yaml"
    if path.exists():
        content = yaml.safe_load(path.read_text(encoding="utf-8"))
        return content if isinstance(content, dict) else {}
    return {}


def load_global_skills() -> dict:
    """Scan global skills from skills/*.md."""
    skills_dir = GLOBAL_CONFIG_DIR / "skills"
    skills = {}
    if skills_dir.exists():
        for md_file in skills_dir.glob("*.md"):
            skills[md_file.stem] = md_file.read_text(encoding="utf-8")
    return skills


def merge_rules(global_prompt: str, workflow_rules: Optional[dict]) -> str:
    """Merge rules: global system.md + workflow rules.system_prompt (concatenate)."""
    parts = []
    if global_prompt:
        parts.append(global_prompt)
    if workflow_rules and workflow_rules.get("system_prompt"):
        parts.append(workflow_rules["system_prompt"])
    return "\n\n".join(parts)


def merge_tools(
    global_tools: Optional[list], workflow_tools: Optional[list]
) -> Optional[list]:
    """Merge tools: intersection (workflow can only restrict)."""
    if global_tools is None and workflow_tools is None:
        return None
    if global_tools is None:
        return workflow_tools
    if workflow_tools is None:
        return global_tools
    return list(set(global_tools) & set(workflow_tools))


def merge_mcp(global_mcp: dict, workflow_mcp: Optional[dict]) -> dict:
    """Merge MCP: union (both available)."""
    merged = dict(global_mcp) if global_mcp else {}
    if workflow_mcp:
        merged.update(workflow_mcp)
    return merged


def merge_skills(global_skills: dict, workflow_skills: Optional[dict]) -> dict:
    """Merge skills: same name -> workflow overrides, different names -> keep both."""
    merged = dict(global_skills) if global_skills else {}
    if workflow_skills:
        merged.update(workflow_skills)
    return merged


async def merge_config(workflow) -> dict:
    """Merge all config layers for a workflow execution."""
    global_prompt = load_global_system_prompt()
    global_mcp = load_global_mcp_servers()
    global_skills = load_global_skills()

    # Get workflow-level config
    workflow_rules = workflow.rules if hasattr(workflow, "rules") else None
    workflow_mcp = workflow.mcp_servers if hasattr(workflow, "mcp_servers") else None
    workflow_skills_data = workflow.skills if hasattr(workflow, "skills") else None

    # Global tools (from rules config or None)
    global_tools = None
    workflow_tools = None
    if workflow_rules and isinstance(workflow_rules, dict):
        workflow_tools = workflow_rules.get("allowed_tools")

    return {
        "system_prompt": merge_rules(global_prompt, workflow_rules),
        "allowed_tools": merge_tools(global_tools, workflow_tools),
        "mcp_servers": merge_mcp(global_mcp, workflow_mcp),
        "skills": merge_skills(global_skills, workflow_skills_data),
    }
