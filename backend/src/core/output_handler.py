"""Output handler - file writing and webhook notifications."""
from datetime import datetime
from pathlib import Path
from typing import Optional

import httpx
import structlog

from src.core.template import render_template

logger = structlog.get_logger()


async def handle_output(
    output_config: Optional[dict],
    context: dict,
    workflow_name: str,
    status: str,
    total_tokens: int,
    duration_seconds: float,
):
    """Handle workflow output: write file and/or send webhook."""
    if not output_config:
        return

    final_output = context.get("final_output", "")

    if output_config.get("file"):
        await write_output_file(output_config["file"], final_output, context)

    if output_config.get("notify"):
        await send_webhook(
            output_config["notify"],
            workflow_name,
            status,
            final_output,
            total_tokens,
            duration_seconds,
        )


async def write_output_file(file_path: str, content: str, context: dict):
    """Write output to file, supporting template variables in path."""
    try:
        rendered_path = render_template(file_path, context)
        path = Path(rendered_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        logger.info("output_file_written", path=str(path))
    except Exception as e:
        logger.error("output_file_write_failed", path=file_path, error=str(e))


async def send_webhook(
    notify_config: dict,
    workflow_name: str,
    status: str,
    output_summary: str,
    total_tokens: int,
    duration_seconds: float,
):
    """Send webhook notification."""
    url = notify_config.get("url")
    if not url:
        return

    payload = {
        "workflow_name": workflow_name,
        "status": status,
        "summary": output_summary[:1000] if output_summary else "",
        "total_tokens": total_tokens,
        "duration_seconds": round(duration_seconds, 2),
        "timestamp": datetime.utcnow().isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        logger.info("webhook_sent", url=url, status_code=response.status_code)
    except Exception as e:
        logger.error("webhook_send_failed", url=url, error=str(e))
