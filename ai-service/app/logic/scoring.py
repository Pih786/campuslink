"""Match-scoring logic for POST /ai/match.

Implements the weighted scoring model exactly as specified in the TRD:

    overall = round(0.4*skill_match + 0.2*education + 0.1*projects
                     + 0.1*certifications + 0.1*assessment + 0.1*experience)

Every sub-score is an int on a 0-100 scale, so the weighted sum only needs to
be rounded once, at the end, for ``overall``. These weights and the response
shape are load-bearing for the Node backend integration and must not change.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from app.skills.dictionary import resolve_skill_name


def _clamp_round(value: float) -> int:
    return max(0, min(100, round(value)))


def _skill_requirements(requirements: List[dict]) -> List[dict]:
    return [r for r in requirements if r.get("type") == "SKILL"]


def _student_proficiency_by_skill(student_skills: List[dict]) -> Dict[str, float]:
    by_skill: Dict[str, float] = {}
    for s in student_skills or []:
        name = resolve_skill_name(s.get("name", ""))
        if not name:
            continue
        prof = s.get("proficiency") or 0
        if name not in by_skill or prof > by_skill[name]:
            by_skill[name] = prof
    return by_skill


def score_skill_match(
    requirements: List[dict], student_skills: List[dict]
) -> Tuple[int, List[str], List[str]]:
    """Weighted proficiency-satisfaction score over SKILL-type requirements.

    For each required skill: full credit (that requirement's weight) if the
    student meets/exceeds ``minimumProficiency``; partial credit
    (``weight * min(1, studentProficiency/minimumProficiency)``) if the
    student has the skill but below the minimum; zero if the student lacks
    it entirely. 100 if the job has no SKILL requirements at all.

    Returns (score, matched_skill_names, gap_skill_names) -- both lists
    canonical-cased, deduped, drawn only from SKILL-type requirements.
    """
    skill_reqs = _skill_requirements(requirements)
    if not skill_reqs:
        return 100, [], []

    student_by_skill = _student_proficiency_by_skill(student_skills)

    total_weight = 0.0
    earned_weight = 0.0
    matched: List[str] = []
    gap: List[str] = []
    seen_matched = set()
    seen_gap = set()

    for req in skill_reqs:
        skill_name = resolve_skill_name(req.get("skillName", "") or "")
        weight = req.get("weight")
        weight = 1.0 if weight is None else float(weight)
        min_prof = req.get("minimumProficiency") or 0
        total_weight += weight

        student_prof = student_by_skill.get(skill_name)
        if student_prof is None:
            if skill_name not in seen_gap:
                seen_gap.add(skill_name)
                gap.append(skill_name)
            continue

        if skill_name not in seen_matched:
            seen_matched.add(skill_name)
            matched.append(skill_name)

        if min_prof <= 0 or student_prof >= min_prof:
            earned_weight += weight
        else:
            earned_weight += weight * min(1.0, student_prof / min_prof)

    score = 100 if total_weight <= 0 else _clamp_round(100 * earned_weight / total_weight)
    return score, matched, gap


def score_education(requirements: List[dict], student_cgpa: Optional[float]) -> int:
    """100 if there's no CGPA requirement to fail against (nothing to fail).

    Otherwise 100 if the student meets/exceeds it, else a proportional
    ``round(100 * student_cgpa / required)`` capped at 100.
    """
    cgpa_reqs = [r for r in requirements if r.get("type") == "CGPA"]
    if not cgpa_reqs:
        return 100
    required = cgpa_reqs[0].get("value")
    if required is None or required <= 0:
        return 100
    if student_cgpa is None:
        return 0
    if student_cgpa >= required:
        return 100
    return _clamp_round(100 * student_cgpa / required)


def score_projects(requirements: List[dict], student_projects: List[dict]) -> int:
    """Overlap between the job's required skills and the student's project tech.

    100 if the job has no SKILL requirements to check against, 0 if the
    student has no projects at all, otherwise
    ``round(100 * |required ∩ project_technologies| / |required|)``.
    """
    required_names = {
        resolve_skill_name(r.get("skillName", "") or "")
        for r in requirements
        if r.get("type") == "SKILL"
    }
    if not required_names:
        return 100
    if not student_projects:
        return 0

    tech_set = set()
    for p in student_projects:
        for t in (p.get("technologies") or []):
            tech_set.add(resolve_skill_name(t))

    overlap = required_names & tech_set
    return _clamp_round(100 * len(overlap) / len(required_names))


def score_certifications(student_certifications: List[dict]) -> int:
    """30 points per verified certification, capped at 100; 0 if none."""
    verified_count = sum(1 for c in (student_certifications or []) if c.get("verified"))
    if verified_count <= 0:
        return 0
    return min(100, 30 * verified_count)


def estimate_assessment_proxy(requirements: List[dict], student_skills: List[dict]) -> int:
    """Placeholder standing in for a real assessment-submission pipeline.

    P0 has no assessment data yet, so this proxies with the average of the
    student's proficiencies (1-5) across skills that overlap the job's
    required SKILL requirements, scaled to 0-100. 50 (neutral) if there's no
    overlap to average over. Replace this once real assessment scores exist.
    """
    required_names = {
        resolve_skill_name(r.get("skillName", "") or "")
        for r in requirements
        if r.get("type") == "SKILL"
    }
    if not required_names:
        return 50

    profs = [
        (s.get("proficiency") or 0)
        for s in (student_skills or [])
        if resolve_skill_name(s.get("name", "")) in required_names
    ]
    if not profs:
        return 50

    avg = sum(profs) / len(profs)
    return _clamp_round(avg / 5 * 100)


def score_experience(experience_months: Optional[float]) -> int:
    """Linear: 0 months = 0, 12+ months = 100."""
    months = experience_months or 0
    return _clamp_round(min(100, months / 12 * 100))


def _build_explanation(
    requirements: List[dict],
    student: dict,
    matched_skills: List[str],
    gap_skills: List[str],
) -> List[str]:
    """Derive 2-4 short human-readable strings from the actual computed values."""
    lines: List[str] = []

    skill_reqs = _skill_requirements(requirements)
    if skill_reqs:
        lines.append(f"Matched {len(matched_skills)}/{len(skill_reqs)} required skills")
    if gap_skills:
        lines.append(f"Missing: {', '.join(gap_skills)}")

    cgpa_reqs = [r for r in requirements if r.get("type") == "CGPA"]
    if cgpa_reqs:
        required_cgpa = cgpa_reqs[0].get("value")
        student_cgpa = student.get("cgpa")
        if required_cgpa is not None and student_cgpa is not None:
            if student_cgpa >= required_cgpa:
                lines.append(f"CGPA {student_cgpa} meets the {required_cgpa} requirement")
            else:
                lines.append(f"CGPA below the required {required_cgpa}")

    verified_certs = sum(1 for c in (student.get("certifications") or []) if c.get("verified"))
    if verified_certs > 0:
        lines.append(f"{verified_certs} verified certification(s) boost this match")

    if not lines:
        lines.append("Limited data available to assess this match in detail")

    return lines[:4]


def compute_match(student: dict, job: dict) -> dict:
    requirements = job.get("requirements") or []
    student_skills = student.get("skills") or []

    skill_match, matched_skills, gap_skills = score_skill_match(requirements, student_skills)
    education = score_education(requirements, student.get("cgpa"))
    projects = score_projects(requirements, student.get("projects") or [])
    certifications = score_certifications(student.get("certifications") or [])
    assessment = estimate_assessment_proxy(requirements, student_skills)
    experience = score_experience(student.get("experienceMonths"))

    overall = _clamp_round(
        0.4 * skill_match
        + 0.2 * education
        + 0.1 * projects
        + 0.1 * certifications
        + 0.1 * assessment
        + 0.1 * experience
    )

    breakdown = {
        "skill_match": skill_match,
        "education": education,
        "projects": projects,
        "certifications": certifications,
        "assessment": assessment,
        "experience": experience,
    }

    return {
        "overall": overall,
        "breakdown": breakdown,
        "matched_skills": matched_skills,
        "gap_skills": gap_skills,
        "explanation": _build_explanation(requirements, student, matched_skills, gap_skills),
    }
