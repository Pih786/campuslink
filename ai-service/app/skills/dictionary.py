"""Canonical skill dictionary + alias resolution.

This is the single shared vocabulary that both resume analysis and JD
analysis scan against. It is intentionally simple: a curated list of
canonical skill names grouped by category, plus a lowercase alias -> canonical
lookup table. No ML, no embeddings -- just careful, case-insensitive,
word-boundary-aware string matching.

Two entry points are exported for use elsewhere in the app:

- ``extract_skills(text)``      -- scan free text (a resume or JD) and return
  the canonical skills mentioned, deduped, in order of first appearance.
- ``resolve_skill_name(name)``  -- resolve a single, already-discrete skill
  name/alias string (e.g. one entry from a student's skill list, or a JD's
  parsed skill list) to its canonical form. Unknown names are returned
  stripped but otherwise unchanged (best effort, never invented).
"""
from __future__ import annotations

import re
from typing import Dict, List, Pattern, Tuple

# ---------------------------------------------------------------------------
# Canonical skills, grouped by category purely for readability/maintenance.
# ---------------------------------------------------------------------------
CANONICAL_SKILLS: Dict[str, List[str]] = {
    "Programming Languages": [
        "Python", "JavaScript", "TypeScript", "Java", "C++", "C", "C#", "Go",
        "Rust", "PHP", "Ruby", "Kotlin", "Swift", "R",
    ],
    "Frontend": [
        "React", "Angular", "Vue.js", "HTML", "CSS", "Tailwind CSS",
        "Bootstrap", "Next.js", "Redux", "jQuery", "Svelte",
    ],
    "Backend": [
        "Node.js", "Express.js", "Django", "Flask", "FastAPI", "Spring Boot",
        "ASP.NET", ".NET", "Ruby on Rails", "Laravel", "NestJS", "GraphQL",
        "REST API",
    ],
    "Databases": [
        "SQL", "MySQL", "PostgreSQL", "MongoDB", "Redis", "SQLite", "Oracle",
        "Cassandra", "DynamoDB", "Firebase", "Elasticsearch", "MariaDB",
    ],
    "Cloud": [
        "AWS", "Azure", "Google Cloud Platform", "Heroku", "Vercel", "Netlify",
    ],
    "DevOps": [
        "Docker", "Kubernetes", "Jenkins", "CI/CD", "Git", "GitHub",
        "GitHub Actions", "Terraform", "Linux", "Bash",
    ],
    "Data/ML": [
        "Machine Learning", "Deep Learning", "Data Science", "Pandas",
        "NumPy", "TensorFlow", "PyTorch", "Scikit-learn",
        "Natural Language Processing", "Computer Vision", "Data Analysis",
        "Power BI", "Tableau", "Excel",
    ],
    "Testing": [
        "Unit Testing", "Selenium", "Jest", "Pytest", "JUnit", "Cypress",
        "Postman",
    ],
    "Mobile": [
        "React Native", "Flutter", "Android Development", "iOS Development",
    ],
    "Soft/Process": [
        "Agile", "Scrum", "Project Management", "Communication", "Leadership",
        "Problem Solving", "Teamwork", "Time Management",
    ],
}

ALL_CANONICAL_SKILLS: List[str] = [
    name for names in CANONICAL_SKILLS.values() for name in names
]

# alias (lowercase) -> canonical name. Every canonical name also maps to
# itself (lowercased) so a plain scan/lookup only ever needs this one table.
ALIASES: Dict[str, str] = {name.lower(): name for name in ALL_CANONICAL_SKILLS}

# Extra aliases layered on top of the self-mapping above. Deliberately
# conservative about very short/ambiguous tokens (e.g. no "cv" -> Computer
# Vision, since "CV" overwhelmingly means "curriculum vitae" on a resume; no
# "pm" -> Project Management, since that collides with "p.m." and initials).
_EXTRA_ALIASES: Dict[str, str] = {
    # Programming languages
    "js": "JavaScript",
    "ecmascript": "JavaScript",
    "ts": "TypeScript",
    "py": "Python",
    "golang": "Go",
    "cpp": "C++",
    "c plus plus": "C++",
    "csharp": "C#",
    "c sharp": "C#",
    # Frontend
    "reactjs": "React",
    "react.js": "React",
    "vue": "Vue.js",
    "vuejs": "Vue.js",
    "angularjs": "Angular",
    "nextjs": "Next.js",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    # Backend
    "node": "Node.js",
    "nodejs": "Node.js",
    "express": "Express.js",
    "expressjs": "Express.js",
    "dotnet": ".NET",
    "dot net": ".NET",
    "aspnet": "ASP.NET",
    "asp.net core": "ASP.NET",
    "rails": "Ruby on Rails",
    "ror": "Ruby on Rails",
    "nest": "NestJS",
    "nestjs": "NestJS",
    "restful api": "REST API",
    "restful apis": "REST API",
    "rest apis": "REST API",
    # Databases
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "psql": "PostgreSQL",
    "mongo": "MongoDB",
    "elastic search": "Elasticsearch",
    # Cloud
    "gcp": "Google Cloud Platform",
    "google cloud": "Google Cloud Platform",
    "amazon web services": "AWS",
    # DevOps
    "k8s": "Kubernetes",
    "kube": "Kubernetes",
    "gh actions": "GitHub Actions",
    "cicd": "CI/CD",
    "ci cd": "CI/CD",
    "continuous integration": "CI/CD",
    "continuous deployment": "CI/CD",
    "continuous delivery": "CI/CD",
    "unix": "Linux",
    "shell scripting": "Bash",
    "shell script": "Bash",
    # Data/ML
    "ml": "Machine Learning",
    "dl": "Deep Learning",
    "nlp": "Natural Language Processing",
    "sklearn": "Scikit-learn",
    "scikit learn": "Scikit-learn",
    "powerbi": "Power BI",
    "power-bi": "Power BI",
    "ms excel": "Excel",
    "microsoft excel": "Excel",
    # Testing
    "unit test": "Unit Testing",
    "unit tests": "Unit Testing",
    # Mobile
    "reactnative": "React Native",
    "android": "Android Development",
    "ios": "iOS Development",
}
ALIASES.update(_EXTRA_ALIASES)


def _boundary_pattern(alias: str) -> Pattern[str]:
    """Compile a case-insensitive, whole-word/phrase regex for ``alias``.

    Uses lookaround (not ``\\b``) so symbol-containing aliases like "C++",
    "C#", ".NET" and "CI/CD" still get correct boundaries: the match must not
    be directly adjacent to another letter/digit on either side. This is what
    prevents "js" from matching inside "jscript" or "py" from matching inside
    "python" (though in practice "Python" itself is matched first anyway --
    see the length-sorted, longest-match-wins scan in ``extract_skills``).
    """
    escaped = re.escape(alias)
    pattern = r"(?<![A-Za-z0-9])" + escaped + r"(?![A-Za-z0-9])"
    return re.compile(pattern, re.IGNORECASE)


# Sorted longest-alias-first so multi-word / more-specific phrases
# ("machine learning") are matched before short/generic ones that might be
# substrings of them, and so overlap resolution below prefers specificity.
_COMPILED_PATTERNS: List[Tuple[Pattern[str], str]] = [
    (_boundary_pattern(alias), canonical)
    for alias, canonical in sorted(ALIASES.items(), key=lambda kv: -len(kv[0]))
]


def extract_skills(text: str) -> List[str]:
    """Scan ``text`` for known skills and return canonical names.

    Deduped, in order of first appearance in the text. Overlapping matches
    (e.g. "js" matching inside an already-matched "Node.js") are resolved by
    preferring the longer/earlier match, so a single mention only ever counts
    once and doesn't spuriously imply an unrelated skill.
    """
    if not text:
        return []

    raw_matches: List[Tuple[int, int, str]] = []
    for pattern, canonical in _COMPILED_PATTERNS:
        for m in pattern.finditer(text):
            raw_matches.append((m.start(), m.end(), canonical))

    # Order by start position; at the same start, prefer the longer match.
    raw_matches.sort(key=lambda t: (t[0], t[0] - t[1]))

    consumed_until = -1
    seen = set()
    ordered: List[str] = []
    for start, end, canonical in raw_matches:
        if start < consumed_until:
            continue  # overlaps a previously accepted (longer/earlier) match
        consumed_until = end
        if canonical not in seen:
            seen.add(canonical)
            ordered.append(canonical)
    return ordered


def resolve_skill_name(name: str) -> str:
    """Resolve a single discrete skill name/alias string to canonical form.

    Case-insensitive exact-string lookup (not a substring scan -- this is for
    normalizing one already-tokenized skill name, e.g. "ReactJS" -> "React").
    Unknown names are returned stripped, unchanged otherwise -- we never
    invent a canonical spelling we're not confident about.
    """
    if not name:
        return name
    key = name.strip().lower()
    return ALIASES.get(key, name.strip())
