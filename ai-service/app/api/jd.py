from typing import List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logic.jd_llm import analyze_job_description

router = APIRouter(prefix="/ai/jd", tags=["jd"])


class JDRequest(BaseModel):
    text: str = ""


class JDResponse(BaseModel):
    role: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    mandatorySkills: List[str] = Field(default_factory=list)
    optionalSkills: List[str] = Field(default_factory=list)
    minimumCgpa: Optional[float] = None
    branches: List[str] = Field(default_factory=list)
    experienceYears: Optional[float] = None
    location: Optional[str] = None
    responsibilities: List[str] = Field(default_factory=list)
    source: Literal["llm", "rules"] = "rules"


@router.post("/analyze", response_model=JDResponse)
def analyze_jd(payload: JDRequest) -> JDResponse:
    return JDResponse(**analyze_job_description(payload.text))
