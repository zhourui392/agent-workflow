"""Single step executor - calls Claude Agent SDK."""
import asyncio
import os
from dataclasses import dataclass
from typing import Optional

import structlog

logger = structlog.get_logger()

# Clean CLAUDECODE env var at module load to prevent nested session conflicts
os.environ.pop("CLAUDECODE", None)


@dataclass
class StepResult:
    output: str = ""
    tokens_used: int = 0
    model_used: str = ""
    cost_usd: Optional[float] = None
    duration_ms: int = 0
    session_id: str = ""
    num_turns: int = 0
    failed: bool = False
    error: Optional[str] = None


async def execute_step(step_config: dict, context: dict, merged_config: dict) -> StepResult:
    """Execute a single step by calling Claude Agent SDK.

    Args:
        step_config: Step configuration {name, prompt, tools, mcp, rules, model, max_turns}
        context: Current execution context with inputs and previous step outputs
        merged_config: Merged global + workflow config {system_prompt, allowed_tools, mcp_servers}
    """
    try:
        os.environ.pop("CLAUDECODE", None)

        from claude_agent_sdk import (
            AssistantMessage,
            ClaudeAgentOptions,
            ResultMessage,
            TextBlock,
            query,
        )

        # Render prompt with context
        from src.core.template import render_template

        prompt = render_template(step_config.get("prompt", ""), context)

        # Build system prompt
        system_prompt = merged_config.get("system_prompt", "")
        step_rules = step_config.get("rules", {})
        if step_rules and step_rules.get("system_prompt"):
            system_prompt = f"{system_prompt}\n\n{step_rules['system_prompt']}"

        # Build options
        options_kwargs = {"permission_mode": "bypassPermissions"}

        # Use claude_code preset for full CLI system prompt, append custom rules
        if system_prompt:
            options_kwargs["system_prompt"] = {
                "type": "preset",
                "preset": "claude_code",
                "append": system_prompt,
            }
        else:
            options_kwargs["system_prompt"] = {
                "type": "preset",
                "preset": "claude_code",
            }

        # Load CLI's Skills and MCP from user/project settings
        options_kwargs["setting_sources"] = ["user", "project"]

        allowed_tools = merged_config.get("allowed_tools")
        if allowed_tools:
            # Ensure Skill tool is available for CLI Skills integration
            if "Skill" not in allowed_tools:
                allowed_tools = [*allowed_tools, "Skill"]
            options_kwargs["allowed_tools"] = allowed_tools

        max_turns = step_config.get("max_turns") or 30
        options_kwargs["max_turns"] = max_turns

        # MCP servers
        mcp_servers = merged_config.get("mcp_servers")
        if mcp_servers:
            options_kwargs["mcp_servers"] = mcp_servers

        # Model from step config or environment variable
        model = step_config.get("model") or os.getenv("ANTHROPIC_MODEL")
        if model:
            options_kwargs["model"] = model

        options = ClaudeAgentOptions(**options_kwargs)

        # Apply timeout if configured
        max_duration = merged_config.get("max_duration")

        # Call Agent SDK
        output_parts = []
        total_tokens = 0
        model_used = ""
        cost_usd = None
        duration_ms = 0
        session_id = ""
        num_turns = 0

        async def run_query():
            nonlocal total_tokens, model_used, cost_usd, duration_ms, session_id, num_turns
            async for message in query(prompt=prompt, options=options):
                # Handle AssistantMessage: extract text from content blocks
                if isinstance(message, AssistantMessage):
                    if hasattr(message, "model") and message.model:
                        model_used = message.model
                    if hasattr(message, "content") and isinstance(message.content, list):
                        for block in message.content:
                            if isinstance(block, TextBlock):
                                output_parts.append(block.text)

                # Handle ResultMessage: extract usage stats and metadata
                elif isinstance(message, ResultMessage):
                    if message.result:
                        output_parts.append(message.result)
                    if message.total_cost_usd is not None:
                        cost_usd = message.total_cost_usd
                    duration_ms = message.duration_ms
                    session_id = message.session_id
                    num_turns = message.num_turns
                    if message.usage and isinstance(message.usage, dict):
                        total_tokens += message.usage.get("input_tokens", 0) + message.usage.get("output_tokens", 0)

        if max_duration:
            await asyncio.wait_for(run_query(), timeout=max_duration)
        else:
            await run_query()

        output_text = "\n".join(output_parts) if output_parts else ""

        return StepResult(
            output=output_text,
            tokens_used=total_tokens,
            model_used=model_used,
            cost_usd=cost_usd,
            duration_ms=duration_ms,
            session_id=session_id,
            num_turns=num_turns,
        )

    except asyncio.TimeoutError:
        return StepResult(failed=True, error="Step execution timed out")
    except ImportError as e:
        logger.error("sdk_import_failed", error=str(e))
        return StepResult(failed=True, error=f"Claude Agent SDK not installed: {e}")
    except Exception as e:
        # Provide specific error messages for known SDK exceptions
        error_type = type(e).__name__
        if error_type == "CLINotFoundError":
            msg = "Claude Code CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code"
        elif error_type == "CLIConnectionError":
            msg = f"Failed to connect to Claude Code CLI: {e}"
        elif error_type == "ProcessError":
            exit_code = getattr(e, "exit_code", None)
            stderr = getattr(e, "stderr", None)
            msg = f"Claude Code process failed (exit_code={exit_code}): {stderr or e}"
        elif error_type == "CLIJSONDecodeError":
            msg = f"Failed to parse Claude Code response: {e}"
        else:
            msg = str(e)
        logger.error("step_execution_failed", error=msg, error_type=error_type)
        return StepResult(failed=True, error=msg)
