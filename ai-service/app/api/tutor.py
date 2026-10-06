from typing import List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.llm import groq_client

router = APIRouter(prefix="/ai", tags=["tutor"])

SYSTEM_PROMPT = (
    "You are a patient tutor helping an Indian engineering student prepare for campus placements. "
    "Explain step by step with a small, concrete example (short code where it helps). "
    "Keep answers under 250 words unless the student asks for more. "
    "When you point to study material, recommend ONLY items from the resource list, citing them by id "
    "like [R2]; never invent links or courses. If nothing in the list fits, say so briefly. "
    "If the question is a take-home or graded company assignment, explain the concepts and approach "
    "but do not write the full solution. "
    'Reply as JSON: {"answer": "<markdown>", "resources": ["R1", ...]}'
)


class TutorResource(BaseModel):
    id: str = Field(max_length=10)
    title: str = Field(max_length=200)
    type: str = Field(default="", max_length=30)
    provider: str = Field(default="", max_length=80)
    level: str = Field(default="", max_length=30)
    description: str = Field(default="", max_length=400)


class TutorTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class TutorRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1500)
    skill: Optional[str] = Field(default=None, max_length=80)
    studentSkills: List[str] = Field(default_factory=list, max_length=40)
    history: List[TutorTurn] = Field(default_factory=list, max_length=10)
    resources: List[TutorResource] = Field(default_factory=list, max_length=15)


class TutorResponse(BaseModel):
    answer: str
    resources: List[str] = Field(default_factory=list)
    source: Literal["llm", "unavailable"]


def _context(req: TutorRequest) -> str:
    lines = []
    if req.skill:
        lines.append(f"Topic the student is working on: {req.skill}")
    if req.studentSkills:
        lines.append(f"Skills already on their profile: {', '.join(req.studentSkills[:25])}")
    if req.resources:
        lines.append("Resource list:")
        for r in req.resources:
            meta = ", ".join(x for x in [r.type, r.provider, r.level] if x)
            lines.append(f"[{r.id}] {r.title} ({meta}) {r.description}".strip())
    else:
        lines.append("Resource list: (empty)")
    return "\n".join(lines)


@router.post("/tutor", response_model=TutorResponse)
def tutor(req: TutorRequest) -> TutorResponse:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _context(req)},
    ]
    messages += [{"role": t.role, "content": t.content} for t in req.history[-8:]]
    messages.append({"role": "user", "content": req.question})

    result = groq_client.chat_json(messages, max_tokens=1400, temperature=0.3)
    answer = (result or {}).get("answer")
    if not isinstance(answer, str) or not answer.strip():
        return TutorResponse(
            answer="The AI tutor is unavailable right now. The resources on this page are still a good place to start.",
            resources=[],
            source="unavailable",
        )

    known = {r.id for r in req.resources}
    cited = [r for r in (result or {}).get("resources", []) if isinstance(r, str) and r in known]
    return TutorResponse(answer=answer.strip(), resources=list(dict.fromkeys(cited)), source="llm")
