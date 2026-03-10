"""Pydantic schemas for API request/response."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# --- Step schema ---
class StepConfig(BaseModel):
    name: str
    prompt: str
    tools: Optional[list[str]] = None
    mcp_servers: Optional[dict] = None
    rules: Optional[dict] = None
    model: Optional[str] = None
    max_turns: Optional[int] = None
    when: Optional[str] = None


# --- Workflow schemas ---
class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    enabled: bool = True
    schedule: Optional[str] = None
    inputs: Optional[dict] = None
    steps: list[StepConfig]
    rules: Optional[dict] = None
    mcp_servers: Optional[dict] = None
    skills: Optional[dict] = None
    limits: Optional[dict] = None
    output: Optional[dict] = None
    on_failure: str = "stop"


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    schedule: Optional[str] = None
    inputs: Optional[dict] = None
    steps: Optional[list[StepConfig]] = None
    rules: Optional[dict] = None
    mcp_servers: Optional[dict] = None
    skills: Optional[dict] = None
    limits: Optional[dict] = None
    output: Optional[dict] = None
    on_failure: Optional[str] = None


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    enabled: bool
    schedule: Optional[str] = None
    inputs: Optional[dict] = None
    steps: list[dict]
    rules: Optional[dict] = None
    mcp_servers: Optional[dict] = None
    skills: Optional[dict] = None
    limits: Optional[dict] = None
    output: Optional[dict] = None
    on_failure: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Execution schemas ---
class ExecutionResponse(BaseModel):
    id: str
    workflow_id: str
    workflow_name: str
    trigger_type: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    current_step: Optional[int] = None
    total_steps: Optional[int] = None
    total_tokens: int = 0
    total_cost_usd: Optional[float] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class StepExecutionResponse(BaseModel):
    id: str
    execution_id: str
    step_index: int
    step_name: str
    status: str
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    prompt_rendered: Optional[str] = None
    output_text: Optional[str] = None
    tokens_used: int = 0
    cost_usd: Optional[float] = None
    model_used: Optional[str] = None
    error_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ExecutionDetailResponse(ExecutionResponse):
    step_executions: list[StepExecutionResponse] = []
