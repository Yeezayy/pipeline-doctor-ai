from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ShortText = Annotated[str, Field(min_length=1, max_length=1000)]


class FixEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    old_text: str = Field(min_length=1, max_length=6000)
    new_text: str = Field(max_length=6000)


class FixProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["ready", "needs_context"]
    summary: ShortText
    explanation: str = Field(min_length=1, max_length=4000)
    edits: list[FixEdit] = Field(max_length=6)
    verification_steps: list[ShortText] = Field(max_length=8)
    limitations: list[ShortText] = Field(max_length=8)
    fixes_tested: Literal[False]

    @model_validator(mode="after")
    def coherent_proposal(self):
        if self.status == "ready" and (not self.edits or not self.verification_steps):
            raise ValueError("A ready patch needs edits and verification steps")
        if self.status == "needs_context" and self.edits:
            raise ValueError("An incomplete proposal must not include edits")
        return self


class FixOut(BaseModel):
    analysis_id: str
    base_sha: str
    path: Literal[".gitlab-ci.yml"] = ".gitlab-ci.yml"
    source: str
    status: Literal["ready", "needs_context"]
    summary: str
    explanation: str
    diff: str | None
    applicability_checked: bool
    yaml_syntax_valid: bool | None
    verification_steps: list[str]
    limitations: list[str]
    fixes_tested: Literal[False] = False
