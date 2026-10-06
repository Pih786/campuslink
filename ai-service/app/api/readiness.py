from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logic.readiness import compute_readiness

router = APIRouter(prefix="/ai", tags=["readiness"])


class ReadinessSkillIn(BaseModel):
    name: str
    proficiency: Optional[float] = 0


class ReadinessRequest(BaseModel):
    studentSkills: List[ReadinessSkillIn] = Field(default_factory=list)
    requiredSkills: List[str] = Field(default_factory=list)


class ReadinessResponse(BaseModel):
    score: int
    band: str


@router.post("/readiness", response_model=ReadinessResponse)
def readiness(payload: ReadinessRequest) -> ReadinessResponse:
    result = compute_readiness(
        [s.model_dump() for s in payload.studentSkills],
        payload.requiredSkills,
    )
    return ReadinessResponse(**result)
