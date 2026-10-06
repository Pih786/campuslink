from typing import List, Optional, Union

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logic.scoring import compute_match

router = APIRouter(prefix="/ai", tags=["matching"])


class StudentSkillIn(BaseModel):
    name: str
    proficiency: Optional[float] = 0
    verified: Optional[bool] = False


class StudentProjectIn(BaseModel):
    title: Optional[str] = None
    technologies: List[str] = Field(default_factory=list)


class StudentCertificationIn(BaseModel):
    name: Optional[str] = None
    verified: Optional[bool] = False


class StudentIn(BaseModel):
    id: Optional[str] = None
    cgpa: Optional[float] = None
    branch: Optional[str] = None
    skills: List[StudentSkillIn] = Field(default_factory=list)
    projects: List[StudentProjectIn] = Field(default_factory=list)
    certifications: List[StudentCertificationIn] = Field(default_factory=list)
    experienceMonths: Optional[float] = 0


class RequirementIn(BaseModel):
    type: str
    skillName: Optional[str] = None
    mandatory: Optional[bool] = None
    weight: Optional[float] = 1
    minimumProficiency: Optional[float] = None
    value: Optional[Union[float, List[str]]] = None


class JobIn(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    requirements: List[RequirementIn] = Field(default_factory=list)


class MatchRequest(BaseModel):
    student: StudentIn
    job: JobIn


class BreakdownOut(BaseModel):
    skill_match: int
    education: int
    projects: int
    certifications: int
    assessment: int
    experience: int


class MatchResponse(BaseModel):
    overall: int
    breakdown: BreakdownOut
    matched_skills: List[str]
    gap_skills: List[str]
    explanation: List[str]


@router.post("/match", response_model=MatchResponse)
def match(payload: MatchRequest) -> MatchResponse:
    result = compute_match(
        payload.student.model_dump(),
        payload.job.model_dump(),
    )
    return MatchResponse(**result)
