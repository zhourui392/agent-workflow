"""Global configuration API."""
from pathlib import Path
from typing import Optional

import structlog
import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = structlog.get_logger()

router = APIRouter(prefix="/api/config", tags=["config"])

GLOBAL_CONFIG_DIR = Path(__file__).parent.parent.parent / "global_config"


class GlobalConfigResponse(BaseModel):
    """Global configuration response."""

    system_prompt: str
    mcp_servers: list[dict]
    skills: list[dict]


class GlobalConfigUpdate(BaseModel):
    """Global configuration update request."""

    system_prompt: Optional[str] = None
    mcp_servers: Optional[list[dict]] = None


@router.get("", response_model=GlobalConfigResponse)
async def get_global_config():
    """Get global configuration."""
    system_prompt = ""
    rules_path = GLOBAL_CONFIG_DIR / "rules" / "system.md"
    if rules_path.exists():
        system_prompt = rules_path.read_text(encoding="utf-8")

    mcp_servers = []
    mcp_path = GLOBAL_CONFIG_DIR / "mcp" / "servers.yaml"
    if mcp_path.exists():
        content = yaml.safe_load(mcp_path.read_text(encoding="utf-8")) or {}
        for name, config in content.get("servers", {}).items():
            mcp_servers.append({"name": name, **config})

    skills = []
    skills_dir = GLOBAL_CONFIG_DIR / "skills"
    if skills_dir.exists():
        for md_file in skills_dir.glob("*.md"):
            skills.append({
                "name": md_file.stem,
                "content": md_file.read_text(encoding="utf-8"),
            })

    return GlobalConfigResponse(
        system_prompt=system_prompt,
        mcp_servers=mcp_servers,
        skills=skills,
    )


@router.put("")
async def update_global_config(config: GlobalConfigUpdate):
    """Update global configuration."""
    if config.system_prompt is not None:
        rules_path = GLOBAL_CONFIG_DIR / "rules" / "system.md"
        rules_path.parent.mkdir(parents=True, exist_ok=True)
        rules_path.write_text(config.system_prompt, encoding="utf-8")
        logger.info("global_system_prompt_updated")

    if config.mcp_servers is not None:
        mcp_path = GLOBAL_CONFIG_DIR / "mcp" / "servers.yaml"
        mcp_path.parent.mkdir(parents=True, exist_ok=True)
        servers_dict = {}
        for server in config.mcp_servers:
            name = server.pop("name", None)
            if name:
                servers_dict[name] = server
        mcp_path.write_text(
            yaml.dump({"servers": servers_dict}, allow_unicode=True),
            encoding="utf-8",
        )
        logger.info("global_mcp_servers_updated")

    return {"status": "ok"}
