"""Feature vector for the predictive placement-likelihood model.

Deliberately reuses the hand-set matching engine's own sub-scores
(score_skill_match, score_education, ...) as features, rather than
duplicating that logic. That makes the two systems directly comparable: the
hand-set formula combines these six sub-scores with fixed weights
(0.4/0.2/0.1/0.1/0.1/0.1); the trained model instead *learns* how to combine
them (plus one extra signal, verified_ratio) from historical outcomes.

Every feature here comes from information a recruiter's screening page
already shows (declared/verified skills, CGPA, projects, certifications,
experience) -- never anything hidden or synthetic-only.
"""
from __future__ import annotations

from typing import Dict, List

from app.logic.scoring import (
    estimate_assessment_proxy,
    score_certifications,
    score_education,
    score_experience,
    score_projects,
    score_skill_match,
)
from app.skills.dictionary import resolve_skill_name

# Fixed order -- must match training and serving exactly.
FEATURE_NAMES: List[str] = [
    "skill_match",
    "education",
    "projects",
    "certifications",
    "assessment_proxy",
    "experience",
    "verified_ratio",
]


def _verified_ratio(requirements: List[dict], student_skills: List[dict]) -> float:
    """Fraction of the job's required skills the student has *and verified*.

    The hand-set formula's skill_match treats a declared "4" and a verified
    "4" identically. This feature lets the trained model discover, from
    outcomes, that verified evidence is more trustworthy than a self-declared
    number -- a distinction the current formula can't make.
    """
    required = {resolve_skill_name(r.get("skillName", "") or "") for r in requirements if r.get("type") == "SKILL"}
    if not required:
        return 0.0
    verified = {
        resolve_skill_name(s.get("name", ""))
        for s in (student_skills or [])
        if s.get("verified")
    }
    return len(required & verified) / len(required)


def build_features(student: dict, job: dict) -> Dict[str, float]:
    """Same (student, job) shapes as ``compute_match`` -- see app/logic/scoring.py."""
    requirements = job.get("requirements") or []
    student_skills = student.get("skills") or []

    skill_match, _matched, _gap = score_skill_match(requirements, student_skills)
    return {
        "skill_match": float(skill_match),
        "education": float(score_education(requirements, student.get("cgpa"))),
        "projects": float(score_projects(requirements, student.get("projects") or [])),
        "certifications": float(score_certifications(student.get("certifications") or [])),
        "assessment_proxy": float(estimate_assessment_proxy(requirements, student_skills)),
        "experience": float(score_experience(student.get("experienceMonths"))),
        "verified_ratio": _verified_ratio(requirements, student_skills),
    }


def feature_vector(student: dict, job: dict) -> List[float]:
    features = build_features(student, job)
    return [features[name] for name in FEATURE_NAMES]
