from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logic.extraction import (
    extract_certifications,
    extract_cgpa,
    extract_degree,
    extract_experience,
    extract_projects,
)
from app.skills.dictionary import extract_skills

router = APIRouter(prefix="/ai/resume", tags=["resume"])


class ResumeRequest(BaseModel):
    text: str = ""


class ProjectOut(BaseModel):
    title: str
    technologies: List[str] = Field(default_factory=list)


class EducationOut(BaseModel):
    degree: Optional[str] = None
    cgpa: Optional[float] = None


class ResumeResponse(BaseModel):
    skills: List[str]
    projects: List[ProjectOut]
    education: EducationOut
    experience: List[str]
    certifications: List[str]


@router.post("/analyze", response_model=ResumeResponse)
def analyze_resume(payload: ResumeRequest) -> ResumeResponse:
    text = payload.text or ""

    return ResumeResponse(
        skills=extract_skills(text),
        projects=[ProjectOut(**p) for p in extract_projects(text)],
        education=EducationOut(degree=extract_degree(text), cgpa=extract_cgpa(text)),
        experience=extract_experience(text),
        certifications=extract_certifications(text),
    )
