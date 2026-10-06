"""Shared resume/JD text-extraction helpers.

Pure regex + heuristics, no ML. Every extractor here is best-effort: when a
field can't be confidently found, it returns ``None``/``[]`` rather than
guessing -- callers (the resume and JD endpoints) rely on that contract.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Pattern, Tuple

from app.skills.dictionary import extract_skills

# ---------------------------------------------------------------------------
# Education: degree + CGPA/percentage
# ---------------------------------------------------------------------------

# Ordered most-specific-first. ``canonical is None`` means "keep the matched
# text" (used for spelled-out degrees like "Bachelor of Computer Applications"
# which vary too much to squash into one fixed label).
_DEGREE_RULES: List[Tuple[str, Optional[str]]] = [
    (r"Bachelor of [A-Za-z.&\- ]+", None),
    (r"Master of [A-Za-z.&\- ]+", None),
    (r"Ph\.?\s?D\.?", "PhD"),
    (r"B\.?\s?Tech\.?", "B.Tech"),
    (r"M\.?\s?Tech\.?", "M.Tech"),
    (r"BCA", "BCA"),
    (r"MCA", "MCA"),
    (r"MBA", "MBA"),
    (r"B\.?\s?E\.?", "B.E."),
    (r"B\.?\s?Sc\.?", "BSc"),
    (r"M\.?\s?Sc\.?", "MSc"),
    (r"B\.?\s?Com\.?", "B.Com"),
    (r"M\.?\s?Com\.?", "M.Com"),
]


def extract_degree(text: str) -> Optional[str]:
    if not text:
        return None
    for pattern, canonical in _DEGREE_RULES:
        m = re.search(
            r"(?<![A-Za-z])(" + pattern + r")(?![A-Za-z])", text, re.IGNORECASE
        )
        if m:
            if canonical:
                return canonical
            cleaned = re.sub(r"\s+", " ", m.group(1)).strip().rstrip(".,;")
            return cleaned or None
    return None


# CGPA-labeled value, then "x/10" scale, then a bare percentage. All are
# "best effort" per the spec -- a matched percentage is returned as-is in the
# same numeric field rather than converted to a 10-point scale, since the
# spec explicitly treats "CGPA/percentage" as one best-effort field.
_CGPA_PATTERN = re.compile(
    r"CGPA[:\s]*(?:>=|≥|of|at least)?\s*([0-9](?:\.[0-9]{1,2})?)",
    re.IGNORECASE,
)
_CGPA_OUT_OF_10_PATTERN = re.compile(r"([0-9](?:\.[0-9]{1,2})?)\s*/\s*10")
_PERCENTAGE_PATTERN = re.compile(r"([0-9]{1,3}(?:\.[0-9]{1,2})?)\s*%")


def extract_cgpa(text: str) -> Optional[float]:
    if not text:
        return None
    for pattern in (_CGPA_PATTERN, _CGPA_OUT_OF_10_PATTERN, _PERCENTAGE_PATTERN):
        m = pattern.search(text)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                continue
    return None


def extract_education(text: str) -> Dict[str, Optional[object]]:
    return {"degree": extract_degree(text), "cgpa": extract_cgpa(text)}


# ---------------------------------------------------------------------------
# JD-only: minimum CGPA, role, branches, mandatory/optional split
# ---------------------------------------------------------------------------

# Per spec, the JD's minimum-CGPA field uses only the labeled "CGPA: x"
# pattern (no /10 or % fallback -- a JD that states a bare percentage cutoff
# without the word CGPA is ambiguous enough that guessing would be worse than
# returning null).
def extract_minimum_cgpa(text: str) -> Optional[float]:
    if not text:
        return None
    m = _CGPA_PATTERN.search(text)
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


def extract_role(text: str) -> Optional[str]:
    if not text or not text.strip():
        return None
    m = re.search(r"(?:role|position|title)\s*[:\-]\s*(.+)", text, re.IGNORECASE)
    if m:
        candidate = m.group(1).strip().splitlines()[0].strip()
        if candidate:
            return candidate[:100]
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line[:100]
    return None


# Full department names are matched case-insensitively; the short
# abbreviations (CSE/IT/ECE/EEE/ME) are matched only in ALL-CAPS form
# (case-sensitive) to avoid false positives on common English words like
# "it" or "me".
_BRANCH_FULLNAME_RULES: List[Tuple[Pattern, str]] = [
    (re.compile(r"computer science(?:\s*(?:and|&)\s*engineering)?", re.IGNORECASE), "CSE"),
    (re.compile(r"information technology", re.IGNORECASE), "IT"),
    (re.compile(r"electronics and communication(?:\s*engineering)?", re.IGNORECASE), "ECE"),
    (re.compile(r"electronics(?:\s*engineering)?", re.IGNORECASE), "ECE"),
    (re.compile(r"electrical and electronics(?:\s*engineering)?", re.IGNORECASE), "EEE"),
    (re.compile(r"electrical(?:\s*engineering)?", re.IGNORECASE), "EEE"),
    (re.compile(r"mechanical(?:\s*engineering)?", re.IGNORECASE), "ME"),
    (re.compile(r"civil(?:\s*engineering)?", re.IGNORECASE), "Civil"),
]
_BRANCH_ABBR_RULES: List[Tuple[Pattern, str]] = [
    (re.compile(r"\bCSE\b"), "CSE"),
    (re.compile(r"\bIT\b"), "IT"),
    (re.compile(r"\bECE\b"), "ECE"),
    (re.compile(r"\bEEE\b"), "EEE"),
    (re.compile(r"\bME\b"), "ME"),
]


def extract_branches(text: str) -> List[str]:
    if not text:
        return []
    found: List[str] = []
    seen = set()
    for pattern, code in _BRANCH_ABBR_RULES:
        if code not in seen and pattern.search(text):
            seen.add(code)
            found.append(code)
    for pattern, code in _BRANCH_FULLNAME_RULES:
        if code not in seen and pattern.search(text):
            seen.add(code)
            found.append(code)
    return found


_MANDATORY_CUES = ["must have", "must-have", "required", "mandatory", "essential"]
_OPTIONAL_CUES = [
    "good to have", "good-to-have", "nice to have", "nice-to-have",
    "preferred", "optional", "bonus", "desirable", "added advantage",
]


def split_mandatory_optional(
    text: str, all_skills: List[str]
) -> Tuple[List[str], List[str]]:
    """Split skills into mandatory/optional using textual section cues.

    If the JD has no "nice to have"/"preferred"/etc. cue at all, everything
    found lands in ``mandatory`` (per spec: a JD with no explicit tiering is
    treated conservatively as "all required", never invents an optional
    bucket that isn't there).
    """
    if not text or not all_skills:
        return list(all_skills), []

    lower_text = text.lower()
    optional_positions = [
        lower_text.find(cue) for cue in _OPTIONAL_CUES if cue in lower_text
    ]
    if not optional_positions:
        return list(all_skills), []
    optional_start = min(optional_positions)

    mandatory: List[str] = []
    optional: List[str] = []
    for skill in all_skills:
        pos = lower_text.find(skill.lower())
        if pos == -1:
            # Skill was matched via an alias whose surface form differs from
            # the canonical name (e.g. text says "JS", canonical is
            # "JavaScript") -- default conservatively to mandatory.
            mandatory.append(skill)
            continue
        if pos >= optional_start:
            optional.append(skill)
        else:
            mandatory.append(skill)
    return mandatory, optional


# ---------------------------------------------------------------------------
# Resume sections: projects / experience / certifications
# ---------------------------------------------------------------------------

_SECTION_HEADER_ALIASES: Dict[str, List[str]] = {
    "projects": ["projects", "academic projects", "personal projects", "project", "key projects"],
    "experience": [
        "experience", "work experience", "internship", "internships",
        "professional experience", "work history",
    ],
    "certifications": [
        "certifications", "certification", "certificates", "certificate",
        "licenses and certifications", "licenses & certifications",
    ],
}

# Any of these (plus the section-specific ones above) ends a section block.
_ALL_HEADERS = {
    h for headers in _SECTION_HEADER_ALIASES.values() for h in headers
} | {
    "education", "skills", "technical skills", "summary", "objective",
    "achievements", "extracurricular", "extracurricular activities",
    "activities", "contact", "profile", "declaration", "hobbies", "languages",
}


def _clean_line(line: str) -> str:
    return re.sub(r"^[#\-*\s]+", "", line).strip().strip(":").strip()


def _find_section_block(text: str, section_key: str) -> Optional[str]:
    lines = text.splitlines()
    aliases = set(_SECTION_HEADER_ALIASES[section_key])
    start_idx = None
    for i, line in enumerate(lines):
        if _clean_line(line).lower() in aliases:
            start_idx = i + 1
            break
    if start_idx is None:
        return None

    end_idx = len(lines)
    for j in range(start_idx, len(lines)):
        cleaned = _clean_line(lines[j]).lower()
        if cleaned and cleaned in _ALL_HEADERS:
            end_idx = j
            break

    block = "\n".join(lines[start_idx:end_idx]).strip()
    return block or None


_BULLET_RE = re.compile(r"^\s*(?:[-*•]|\d+[.)])\s+")


def _split_into_items(block: str) -> List[str]:
    if not block or not block.strip():
        return []

    # Prefer paragraph-style entries separated by a blank line.
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", block.strip()) if p.strip()]
    if len(paragraphs) > 1:
        return paragraphs

    lines = [l for l in block.splitlines() if l.strip()]
    if any(_BULLET_RE.match(l) for l in lines):
        items: List[str] = []
        current: List[str] = []
        for line in lines:
            if _BULLET_RE.match(line):
                if current:
                    items.append("\n".join(current))
                current = [_BULLET_RE.sub("", line, count=1)]
            else:
                current.append(line)
        if current:
            items.append("\n".join(current))
        return items

    # No blank-line or bullet delimiters at all: this is most commonly a
    # single entry whose title and description sit on consecutive lines
    # (e.g. "Library Management System" / "A Java + MySQL system for...").
    # Treating it as one item avoids fragmenting that into fake extra
    # entries; we'd rather under-split than hallucinate entries that aren't
    # really there. A single bare line is naturally returned as one item too.
    return ["\n".join(lines)]


def _item_title(item: str, max_len: int = 80) -> str:
    first_line = item.splitlines()[0].strip()
    first_line = re.sub(r"^[-*•\d.)\s]+", "", first_line).strip()
    return first_line[:max_len].rstrip()


def extract_projects(text: str) -> List[Dict[str, object]]:
    if not text:
        return []
    block = _find_section_block(text, "projects")
    if not block:
        return []
    projects: List[Dict[str, object]] = []
    for item in _split_into_items(block):
        title = _item_title(item)
        if not title:
            continue
        projects.append({"title": title, "technologies": extract_skills(item)})
    return projects


def extract_experience(text: str) -> List[str]:
    if not text:
        return []
    block = _find_section_block(text, "experience")
    if not block:
        return []
    return [t for t in (_item_title(item, 120) for item in _split_into_items(block)) if t]


def extract_certifications(text: str) -> List[str]:
    if not text:
        return []
    block = _find_section_block(text, "certifications")
    if not block:
        return []
    return [t for t in (_item_title(item, 120) for item in _split_into_items(block)) if t]
