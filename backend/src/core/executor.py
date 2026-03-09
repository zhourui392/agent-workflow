"""Single step executor - calls Claude Agent SDK."""
import asyncio
import os
from dataclasses import dataclass, field
from typing import Optional

import structlog

logger = structlog.get_logger()


@dataclass
class StepResult:
    output: str = ""
    tokens_used: int = 0
    model_used: str = ""
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
        from claude_code_sdk import ClaudeCodeOptions, Message, query

        # Render prompt with context
        from src.core.template import render_template

        prompt = render_template(step_config.get("prompt", ""), context)

        # Build system prompt
        system_prompt = merged_config.get("system_prompt", "")
        step_rules = step_config.get("rules", {})
        if step_rules and step_rules.get("system_prompt"):
            system_prompt = f"{system_prompt}\n\n{step_rules['system_prompt']}"

        # Build options
        options_kwargs = {}
        if system_prompt:
            options_kwargs["system_prompt"] = system_prompt

        allowed_tools = merged_config.get("allowed_tools")
        if allowed_tools:
            options_kwargs["allowed_tools"] = allowed_tools

        max_turns = step_config.get("max_turns") or 30
        options_kwargs["max_turns"] = max_turns

        # MCP servers
        mcp_servers = merged_config.get("mcp_servers")
        if mcp_servers:
            options_kwargs["mcp_servers"] = mcp_servers

        model = step_config.get("model") or os.getenv("ANTHROPIC_MODEL")
        if model:
            options_kwargs["model"] = model

        options = ClaudeCodeOptions(**options_kwargs)

        # Apply timeout if configured
        max_duration = merged_config.get("max_duration")

        # Call Agent SDK
        output_parts = []
        total_tokens = 0
        model_used = ""

        async def run_query():
            nonlocal total_tokens, model_used
            async for message in query(prompt=prompt, options=options):
                if not hasattr(message, "type"):
                    continue

                # Handle "assistant" type messages with content blocks
                if message.type == "assistant":
                    if hasattr(message, "content"):
                        if isinstance(message.content, list):
                            for block in message.content:
                                if hasattr(block, "text"):
                                    output_parts.append(block.text)
                                elif isinstance(block, dict) and "text" in block:
                                    output_parts.append(block["text"])
                        elif isinstance(message.content, str):
                            output_parts.append(message.content)

                # Handle "result" type messages
                elif message.type == "result":
                    if hasattr(message, "content"):
                        if isinstance(message.content, str):
                            output_parts.append(message.content)

                # Handle "text" type messages
                elif message.type == "text":
                    if hasattr(message, "content") and isinstance(message.content, str):
                        output_parts.append(message.content)

                # Try to extract token usage
                if hasattr(message, "usage") and message.usage:
                    total_tokens += getattr(message.usage, "total_tokens", 0)
                if hasattr(message, "model") and message.model:
                    model_used = message.model

        if max_duration:
            await asyncio.wait_for(run_query(), timeout=max_duration)
        else:
            await run_query()

        output_text = "\n".join(output_parts) if output_parts else ""

        return StepResult(
            output=output_text,
            tokens_used=total_tokens,
            model_used=model_used,
        )

    except asyncio.TimeoutError:
        return StepResult(failed=True, error="Step execution timed out")
    except Exception as e:
        logger.error("step_execution_failed", error=str(e))
        return StepResult(failed=True, error=str(e))
