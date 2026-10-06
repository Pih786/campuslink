from typing import List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.skills.dictionary import resolve_skill_name

router = APIRouter(prefix="/ai", tags=["skills"])


class SkillGapRequest(BaseModel):
    studentSkills: List[str] = Field(default_factory=list)
    requiredSkills: List[str] = Field(default_factory=list)


class SkillGapResponse(BaseModel):
    matched: List[str]
    missing: List[str]


@router.post("/skill-gap", response_model=SkillGapResponse)
def skill_gap(payload: SkillGapRequest) -> SkillGapResponse:
    # Resolve required skills to canonical form, deduped, preserving order.
    required_canonical: List[str] = []
    seen = set()
    for raw in payload.requiredSkills:
        canonical = resolve_skill_name(raw)
        if canonical not in seen:
            seen.add(canonical)
            required_canonical.append(canonical)

    student_set = {resolve_skill_name(s) for s in payload.studentSkills}

    matched = [s for s in required_canonical if s in student_set]
    missing = [s for s in required_canonical if s not in student_set]
    return SkillGapResponse(matched=matched, missing=missing)
