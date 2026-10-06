from typing import List, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.llm import groq_client

router = APIRouter(prefix="/ai/cv", tags=["cv"])

SYSTEM_PROMPT = (
    "You write the summary paragraph at the top of a fresher's campus CV. "
    "Use ONLY the facts given. Never invent employers, numbers, awards or years. "
    "Write 2-3 sentences, at most 60 words, in the implied first person "
    "(no 'I', no name). Plain, specific and professional; no buzzwords like "
    "'passionate', 'hard-working' or 'go-getter'. "
    'Reply as JSON: {"summary": "..."}'
)


class CvProject(BaseModel):
    title: str = Field(max_length=120)
    tech: List[str] = Field(default_factory=list, max_length=15)


class CvSummaryRequest(BaseModel):
    headline: str = Field(default="", max_length=140)
    education: List[str] = Field(default_factory=list, max_length=6)
    skills: List[str] = Field(default_factory=list, max_length=40)
    projects: List[CvProject] = Field(default_factory=list, max_length=10)
    experience: List[str] = Field(default_factory=list, max_length=8)
    certifications: List[str] = Field(default_factory=list, max_length=12)


class CvSummaryResponse(BaseModel):
    summary: str
    source: Literal["llm", "template"]


def _join(items: List[str]) -> str:
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def template_summary(req: CvSummaryRequest) -> str:
    """Deterministic fallback built only from the supplied facts."""
    parts: List[str] = []
    lead = req.headline.strip() or (req.education[0] if req.education else "")
    if lead:
        parts.append(lead.rstrip(".") + ".")
    if req.skills:
        parts.append(f"Skilled in {_join(req.skills[:5])}.")
    project_titles = [p.title for p in req.projects if p.title][:2]
    if req.experience:
        parts.append(f"Experience as {_join(req.experience[:2])}.")
    elif project_titles:
        parts.append(f"Built projects including {_join(project_titles)}.")
    if req.certifications:
        parts.append(f"Certified in {_join(req.certifications[:2])}.")
    return " ".join(parts) or "Add your education, skills and projects to generate a summary."


@router.post("/summary", response_model=CvSummaryResponse)
def cv_summary(req: CvSummaryRequest) -> CvSummaryResponse:
    facts = req.model_dump()
    result = groq_client.chat_json(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"CV facts: {facts}"},
        ],
        max_tokens=400,
        temperature=0.4,
    )
    summary = (result or {}).get("summary")
    if isinstance(summary, str) and 20 <= len(summary.strip()) <= 600:
        return CvSummaryResponse(summary=summary.strip(), source="llm")
    return CvSummaryResponse(summary=template_summary(req), source="template")
