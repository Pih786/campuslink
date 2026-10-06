"""Scoring logic for POST /ai/readiness."""
from __future__ import annotations

from typing import Dict, List

from app.skills.dictionary import resolve_skill_name

# TRD bands, used verbatim.
_BAND_HIGHLY_EMPLOYABLE = "Highly Employable"
_BAND_READY = "Ready"
_BAND_DEVELOPING = "Developing"
_BAND_NOT_READY = "Not Ready"


def _band_for(score: int) -> str:
    if score >= 80:
        return _BAND_HIGHLY_EMPLOYABLE
    if score >= 60:
        return _BAND_READY
    if score >= 40:
        return _BAND_DEVELOPING
    return _BAND_NOT_READY


def compute_readiness(student_skills: List[dict], required_skills: List[str]) -> Dict[str, object]:
    """Average, over each required skill, of proficiency/5*100 (0 if absent).

    An empty ``required_skills`` list is an explicit edge case: "nothing to
    be ready for" is scored as Not Ready (0), not as fully ready -- there is
    nothing to have demonstrated readiness against.
    """
    if not required_skills:
        return {"score": 0, "band": _BAND_NOT_READY}

    student_by_skill: Dict[str, float] = {}
    for s in student_skills or []:
        name = resolve_skill_name(s.get("name", ""))
        if not name:
            continue
        prof = s.get("proficiency") or 0
        if name not in student_by_skill or prof > student_by_skill[name]:
            student_by_skill[name] = prof

    per_skill_scores: List[float] = []
    for raw_skill in required_skills:
        skill = resolve_skill_name(raw_skill)
        prof = student_by_skill.get(skill)
        if prof is None:
            per_skill_scores.append(0.0)
        else:
            per_skill_scores.append(max(0.0, min(5.0, prof)) / 5 * 100)

    score = max(0, min(100, round(sum(per_skill_scores) / len(per_skill_scores))))
    return {"score": score, "band": _band_for(score)}
