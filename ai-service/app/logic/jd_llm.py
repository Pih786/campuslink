"""LLM-assisted job-description analysis, grounded against the JD text.

The LLM is better than regexes at telling required from preferred skills and
at pulling out role/location/experience, but it can also "helpfully" infer
technologies the JD never mentions. So its output is treated as a proposal:
every skill must literally appear in the JD (or be something the rule-based
dictionary scan already found there), numbers must be in range and present
in the text, and branches are normalized to our fixed codes.
"""

import re
from typing import Any, Dict, List, Optional

from app.llm import groq_client
from app.logic.extraction import (
    extract_branches,
    extract_minimum_cgpa,
    extract_role,
    split_mandatory_optional,
)
from app.skills.dictionary import ALIASES, extract_skills, resolve_skill_name

VALID_BRANCHES = {"CSE", "IT", "ECE", "EEE", "ME", "Civil"}
MAX_JD_CHARS = 12000
MAX_RESPONSIBILITIES = 6

SYSTEM_PROMPT = """You extract structured hiring requirements from a job description for a campus placement platform.
Return ONLY a JSON object with exactly these keys:
- "role": job title (string or null)
- "mandatorySkills": array of required skills
- "optionalSkills": array of preferred / nice-to-have skills
- "minimumCgpa": minimum CGPA on a 10-point scale (number or null)
- "branches": eligible branches as codes from [CSE, IT, ECE, EEE, ME, Civil] (array)
- "experienceYears": minimum years of experience (number or null)
- "location": work location (string or null)
- "responsibilities": up to 6 short responsibility phrases (array)
Rules:
- Only include skills explicitly written in the text. Never add related or implied technologies.
- Skills are technologies, tools, languages or technical concepts (e.g. "React", "SQL", "System Design"), not soft skills or sentences.
- If the text does not distinguish required from preferred skills, put every skill in "mandatorySkills".
- Use null or [] when something is not stated. Do not guess."""


def _canonical(name: str) -> str:
    resolved = resolve_skill_name(name)
    if resolved != name.strip():
        return resolved
    lowered = name.strip().lower()
    if lowered.endswith("s") and lowered[:-1] in ALIASES:
        return ALIASES[lowered[:-1]]
    return name.strip()


def _appears_in_text(term: str, text: str) -> bool:
    term = term.strip()
    if not term:
        return False
    pattern = r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])"
    return re.search(pattern, text, re.IGNORECASE) is not None


def _grounded_skills(
    candidates: Any, text: str, rule_skills: set
) -> List[str]:
    if not isinstance(candidates, list):
        return []
    accepted: List[str] = []

    def add(skill: str) -> None:
        if skill not in accepted:
            accepted.append(skill)

    for raw in candidates:
        if not isinstance(raw, str) or not raw.strip() or len(raw) > 60:
            continue
        canonical = _canonical(raw)
        if canonical in rule_skills:
            add(canonical)
            continue

        # Phrases like "CI/CD pipelines" or "Strong JavaScript" map to the
        # dictionary skill(s) they contain, when those were found in the JD.
        embedded = [s for s in extract_skills(raw) if s in rule_skills]
        if embedded:
            for skill in embedded:
                add(skill)
            continue

        if _appears_in_text(raw, text) or _appears_in_text(canonical, text):
            add(canonical)
    return accepted


def _grounded_number(
    value: Any, text: str, low: float, high: float, allow_low: bool = False
) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    in_range = (low <= float(value) <= high) if allow_low else (low < float(value) <= high)
    if not in_range:
        return None
    as_float = float(value)
    candidates = {f"{as_float:g}", f"{as_float:.1f}", f"{as_float:.2f}"}
    if any(re.search(r"(?<![\d.])" + re.escape(c) + r"(?![\d])", text) for c in candidates):
        return as_float
    return None


def _normalize_branches(raw: Any) -> List[str]:
    if not isinstance(raw, list):
        return []
    found: List[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        if item in VALID_BRANCHES:
            codes = [item]
        else:
            codes = extract_branches(item) or extract_branches(item.upper())
        for code in codes:
            if code not in found:
                found.append(code)
    return found


def _short_strings(raw: Any, limit: int, max_len: int = 140) -> List[str]:
    if not isinstance(raw, list):
        return []
    return [s.strip()[:max_len] for s in raw if isinstance(s, str) and s.strip()][:limit]


def _rule_based(text: str) -> Dict[str, Any]:
    all_skills = extract_skills(text)
    mandatory, optional = split_mandatory_optional(text, all_skills)
    return {
        "role": extract_role(text),
        "skills": all_skills,
        "mandatorySkills": mandatory,
        "optionalSkills": optional,
        "minimumCgpa": extract_minimum_cgpa(text),
        "branches": extract_branches(text),
        "experienceYears": None,
        "location": None,
        "responsibilities": [],
        "source": "rules",
    }


def analyze_job_description(text: str) -> Dict[str, Any]:
    text = (text or "")[:MAX_JD_CHARS]
    base = _rule_based(text)

    if not text.strip() or not groq_client.is_enabled():
        return base

    llm = groq_client.chat_json(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        max_tokens=900,
        temperature=0,
    )
    if llm is None:
        return base

    rule_skills = set(base["skills"])
    mandatory = _grounded_skills(llm.get("mandatorySkills"), text, rule_skills)
    optional = [
        s for s in _grounded_skills(llm.get("optionalSkills"), text, rule_skills) if s not in mandatory
    ]

    # Anything the dictionary scan definitely found in the text but the LLM
    # skipped is still included, tiered by the rule-based required/preferred cues.
    for skill in base["skills"]:
        if skill in mandatory or skill in optional:
            continue
        (optional if skill in base["optionalSkills"] else mandatory).append(skill)

    role = llm.get("role") if isinstance(llm.get("role"), str) and llm["role"].strip() else None
    location = llm.get("location") if isinstance(llm.get("location"), str) and llm["location"].strip() else None
    minimum_cgpa = _grounded_number(llm.get("minimumCgpa"), text, 0, 10)
    experience = _grounded_number(llm.get("experienceYears"), text, 0, 40, allow_low=True)

    branches = _normalize_branches(llm.get("branches"))
    for code in base["branches"]:
        if code not in branches:
            branches.append(code)

    return {
        "role": (role or base["role"] or "")[:100] or None,
        "skills": mandatory + optional,
        "mandatorySkills": mandatory,
        "optionalSkills": optional,
        "minimumCgpa": minimum_cgpa if minimum_cgpa is not None else base["minimumCgpa"],
        "branches": branches,
        "experienceYears": experience,
        "location": location[:100] if location else None,
        "responsibilities": _short_strings(llm.get("responsibilities"), MAX_RESPONSIBILITIES),
        "source": "llm",
    }
