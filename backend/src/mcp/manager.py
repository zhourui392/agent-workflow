"""MCP (Model Context Protocol) service manager."""
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import structlog
import yaml

logger = structlog.get_logger()

GLOBAL_CONFIG_DIR = Path(__file__).parent.parent.parent / "global_config"


@dataclass
class McpServerConfig:
    """MCP server configuration."""

    name: str
    command: str
    args: list[str]
    env: Optional[dict[str, str]] = None


def load_global_mcp_servers() -> list[McpServerConfig]:
    """Load MCP servers from global_config/mcp/servers.yaml."""
    path = GLOBAL_CONFIG_DIR / "mcp" / "servers.yaml"
    if not path.exists():
        return []

    try:
        content = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not content or not isinstance(content, dict):
            return []

        servers = []
        for name, config in content.get("servers", {}).items():
            if isinstance(config, dict):
                servers.append(McpServerConfig(
                    name=name,
                    command=config.get("command", ""),
                    args=config.get("args", []),
                    env=config.get("env"),
                ))
        return servers
    except Exception as e:
        logger.warning("mcp_config_load_failed", error=str(e))
        return []


def parse_workflow_mcp(mcp_config: Optional[list]) -> list[McpServerConfig]:
    """Parse MCP config from workflow DB field."""
    if not mcp_config:
        return []

    servers = []
    for item in mcp_config:
        if isinstance(item, dict):
            servers.append(McpServerConfig(
                name=item.get("name", ""),
                command=item.get("command", ""),
                args=item.get("args", []),
                env=item.get("env"),
            ))
    return servers


def merge_mcp_servers(
    global_servers: list[McpServerConfig],
    workflow_servers: list[McpServerConfig],
) -> list[McpServerConfig]:
    """Merge MCP servers: union, workflow overrides global by name."""
    merged = {s.name: s for s in global_servers}
    for s in workflow_servers:
        merged[s.name] = s
    return list(merged.values())


def to_sdk_format(servers: list[McpServerConfig]) -> list[dict]:
    """Convert MCP servers to Claude Agent SDK format."""
    result = []
    for s in servers:
        config = {
            "name": s.name,
            "command": s.command,
            "args": s.args,
        }
        if s.env:
            config["env"] = s.env
        result.append(config)
    return result


def get_merged_mcp_for_workflow(workflow_mcp: Optional[list]) -> list[dict]:
    """Get merged MCP servers for a workflow in SDK format."""
    global_servers = load_global_mcp_servers()
    workflow_servers = parse_workflow_mcp(workflow_mcp)
    merged = merge_mcp_servers(global_servers, workflow_servers)
    return to_sdk_format(merged)
