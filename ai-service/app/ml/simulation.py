"""Shared simulated-placement-data generator.

Used by both the offline evaluation (``eval/evaluate.py``) and the predictive
model's training script (``app/ml/train.py``), so "what a placement season
looks like" is defined in exactly one place.

Method (simulation, not real placement data -- see eval/evaluate.py's module
docstring for the full rationale):
  * Each simulated student has a hidden "true" level (0-5) per skill.
  * What any scorer sees is noisy: self-declared proficiency adds noise and
    an optimism bias; skills verified in a lab/assessment are much closer to
    the true level.
  * The "hired" outcome is produced by a hidden process independent of any
    scorer under test: true fit for the role's skills, plus interview-day
    noise, must clear a bar. Neither the hand-set formula nor the trained
    model ever sees true skill levels or this hire rule directly -- both
    only see the noisy declared/verified data, same as in production.
"""
from __future__ import annotations

import math
import random
import statistics
from typing import List, Tuple

Role = Tuple[str, List[str], float, List[str]]  # (title, skills, min_cgpa, branches)

INTERVIEW_NOISE = 0.08
DECLARED_NOISE = 0.9
DECLARED_BIAS = 0.4
VERIFIED_NOISE = 0.3
VERIFY_PROBABILITY = 0.35
HIRE_BAR = 0.6

SKILL_POOL = [
    "Python", "Java", "JavaScript", "React", "Node.js", "SQL", "MongoDB", "AWS", "Docker",
    "Kubernetes", "Linux", "Machine Learning", "Pandas", "Power BI", "Excel", "Spring Boot",
    "Django", "Git", "TypeScript", "C++",
]
BRANCHES = ["CSE", "IT", "ECE", "EEE", "ME"]

ROLES: List[Role] = [
    ("Backend Engineer", ["Java", "Spring Boot", "SQL", "Git"], 7.0, ["CSE", "IT"]),
    ("Frontend Engineer", ["JavaScript", "React", "TypeScript", "Git"], 6.5, ["CSE", "IT", "ECE"]),
    ("Full Stack Developer", ["React", "Node.js", "MongoDB", "JavaScript"], 6.5, ["CSE", "IT"]),
    ("Data Analyst", ["SQL", "Excel", "Power BI", "Python"], 6.0, []),
    ("Data Scientist", ["Python", "Pandas", "Machine Learning", "SQL"], 7.5, ["CSE", "IT", "ECE"]),
    ("Cloud Engineer", ["AWS", "Linux", "Docker", "Kubernetes"], 7.0, ["CSE", "IT", "ECE", "EEE"]),
    ("DevOps Engineer", ["Docker", "Kubernetes", "Linux", "Git"], 6.5, []),
    ("Python Developer", ["Python", "Django", "SQL", "Git"], 6.5, ["CSE", "IT"]),
    ("Embedded Engineer", ["C++", "Linux", "Git"], 6.5, ["ECE", "EEE"]),
    ("ML Engineer", ["Python", "Machine Learning", "Docker", "AWS"], 7.5, ["CSE", "IT"]),
    ("Systems Engineer", ["Java", "Linux", "SQL"], 6.0, []),
    ("Graduate Trainee", ["Excel", "SQL"], 6.0, []),
]


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def make_students(rng: random.Random, n_students: int) -> List[dict]:
    students = []
    for i in range(n_students):
        aptitude = rng.gauss(0, 1)
        known = rng.sample(SKILL_POOL, rng.randint(3, 8))
        true_levels = {s: clamp(2.6 + 1.1 * aptitude + rng.gauss(0, 1.0), 0.3, 5.0) for s in known}

        skills = []
        for s, level in true_levels.items():
            verified = rng.random() < VERIFY_PROBABILITY
            noise = VERIFIED_NOISE if verified else DECLARED_NOISE
            bias = 0 if verified else DECLARED_BIAS
            declared = int(round(clamp(level + bias + rng.gauss(0, noise), 1, 5)))
            skills.append({"name": s, "proficiency": declared, "verified": verified})

        strongest = sorted(true_levels, key=true_levels.get, reverse=True)
        projects = [
            {"title": f"Project {p}", "technologies": rng.sample(strongest[:4], min(2, len(strongest)))}
            for p in range(rng.choice([0, 0, 1, 1, 2, 3]))
        ]
        students.append(
            {
                "id": f"s{i}",
                "branch": rng.choice(BRANCHES),
                "cgpa": round(clamp(7.3 + 0.6 * aptitude + rng.gauss(0, 0.6), 5.0, 9.9), 2),
                "backlogs": 1 if rng.random() < 0.08 else 0,
                "true": true_levels,
                "skills": skills,
                "projects": projects,
                "certifications": [],
                "experienceMonths": rng.choice([0, 0, 0, 2, 3, 6]),
            }
        )
    return students


def job_payload(role: Role) -> dict:
    title, skills, cgpa, _ = role
    reqs = [{"type": "SKILL", "skillName": s, "mandatory": True, "weight": 1, "minimumProficiency": 3} for s in skills]
    reqs.append({"type": "CGPA", "value": cgpa, "mandatory": True})
    return {"id": title, "title": title, "requirements": reqs}


def eligible(student: dict, role: Role) -> bool:
    """Hard CGPA/branch/backlog rules, as the Node eligibility engine applies them."""
    _, skills, cgpa, branches = role
    if student["cgpa"] < cgpa or student["backlogs"] > 0:
        return False
    if branches and student["branch"] not in branches:
        return False
    declared = {s["name"] for s in student["skills"]}
    # Requiring every mandatory skill would leave very small pools in a random
    # campus, so the ranking study keeps candidates listing at least half of the
    # role's skills. The strict rule itself is covered by backend unit tests.
    return sum(1 for s in skills if s in declared) >= math.ceil(len(skills) / 2)


def hired(student: dict, role: Role, rng: random.Random) -> bool:
    """Hidden outcome: true skill fit + interview noise must clear the bar.

    This is deliberately independent of any scorer under test (the hand-set
    formula, or the trained model) -- neither ever sees ``student["true"]``.
    """
    _, skills, _, _ = role
    fit = statistics.mean(student["true"].get(s, 0.0) / 5 for s in skills)
    return fit + rng.gauss(0, INTERVIEW_NOISE) >= HIRE_BAR
