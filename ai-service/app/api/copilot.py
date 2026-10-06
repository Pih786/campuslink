from typing import Any, Dict, List, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logic.copilot import answer_question

router = APIRouter(prefix="/ai", tags=["copilot"])


class CopilotRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    facts: Dict[str, Any] = Field(default_factory=dict)
    audience: str = Field(default="placement officer", max_length=60)


class CopilotResponse(BaseModel):
    answer: str
    source: Literal["llm", "unavailable"]
    unverifiedNumbers: List[str] = Field(default_factory=list)


@router.post("/copilot", response_model=CopilotResponse)
def copilot(payload: CopilotRequest) -> CopilotResponse:
    return CopilotResponse(**answer_question(payload.question, payload.facts, payload.audience))
