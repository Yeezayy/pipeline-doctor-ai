from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PipelineDiagnosis(BaseModel):
    summary: str = Field(min_length=1, max_length=2000)
    root_cause: str = Field(min_length=1, max_length=4000)
    severity: Literal["low", "medium", "high", "critical"]
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(
        max_length=12, description="Exact verbatim excerpts from supplied data"
    )
    hypotheses: list[str] = Field(max_length=10)
    suggested_fixes: list[str] = Field(min_length=1, max_length=12)
    explanation: str = Field(min_length=1, max_length=6000)
    fixes_tested: Literal[False] = False


class AnalyzeRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=40)
    pipeline_id: int = Field(gt=0)
    job_id: int = Field(gt=0)
    context: str = Field(default="", max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000, pattern=r"\S")


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    role: str
    content: str
    created_at: datetime


class AnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    pipeline_id: int
    job_id: int
    job_name: str
    source: str
    diagnosis: PipelineDiagnosis
    pipeline: dict[str, Any]
    created_at: datetime
    messages: list[MessageOut]
