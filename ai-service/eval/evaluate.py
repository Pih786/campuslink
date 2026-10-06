"""Offline evaluation of CampusLink's matching, readiness and JD parsing.

Run from ai-service/:   python -m eval.evaluate
Writes eval/results.json and prints a Markdown summary.

Method (simulation, not real placement data):
  * Each simulated student has a hidden "true" level (0-5) per skill.
  * What the platform sees is noisy: self-declared proficiency adds noise and
    an optimism bias; skills verified in a lab/assessment are much closer to
    the true level (this mirrors how verified evidence works in the product).
  * Ground truth "would be hired" is produced by a separate hidden process: a
    candidate passes the hard eligibility rules AND their true fit for the
    role's skills, plus interview-day noise, clears a bar. The scorer under
    test never sees true levels or the hire rule.
  * Each role's eligible candidates are ranked by the production scorer
    (app.logic.scoring.compute_match) and by simple baselines, and we measure
    how well each ranking surfaces the eventual hires. Repeated over several
    random seeds; mean and standard deviation are reported.
"""
from __future__ import annotations

import json
import math
import random
import statistics
import time
from pathlib import Path
from typing import Dict, List

from app.logic.jd_llm import analyze_job_description
from app.logic.readiness import compute_readiness
from app.logic.scoring import compute_match
from app.ml.simulation import ROLES, eligible, hired, job_payload, make_students

SEEDS = [20260926, 11, 22, 33, 44]
N_STUDENTS = 1000
K = 10

# --------------------------------------------------------------------------
# Scorers
# --------------------------------------------------------------------------

def score_campuslink(student: dict, job: dict) -> float:
    return compute_match(
        {
            "cgpa": student["cgpa"],
            "skills": student["skills"],
            "projects": student["projects"],
            "certifications": student["certifications"],
            "experienceMonths": student["experienceMonths"],
        },
        job,
    )["overall"]


def score_skill_overlap(student: dict, job: dict) -> float:
    required = [r["skillName"] for r in job["requirements"] if r["type"] == "SKILL"]
    have = {s["name"] for s in student["skills"]}
    return sum(1 for s in required if s in have) / len(required)


def score_cgpa(student: dict, _job: dict) -> float:
    return student["cgpa"]


# --------------------------------------------------------------------------
# Metrics
# --------------------------------------------------------------------------

def auc(scores: List[float], labels: List[bool]) -> float:
    """Probability a random hire outranks a random non-hire (ties count 0.5)."""
    pos = [s for s, y in zip(scores, labels) if y]
    neg = [s for s, y in zip(scores, labels) if not y]
    if not pos or not neg:
        return float("nan")
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else 0.5 if p == n else 0.0
    return wins / (len(pos) * len(neg))


def ranked(scores: List[float], labels: List[bool], rng: random.Random) -> List[bool]:
    # Random tie-break so ties don't favour input order.
    keyed = [(s, rng.random(), y) for s, y in zip(scores, labels)]
    keyed.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [y for _, _, y in keyed]


def precision_at_k(order: List[bool], k: int) -> float:
    top = order[:k]
    return sum(top) / len(top) if top else float("nan")


def ndcg_at_k(order: List[bool], k: int) -> float:
    dcg = sum(1 / math.log2(i + 2) for i, y in enumerate(order[:k]) if y)
    ideal = sum(1 / math.log2(i + 2) for i in range(min(k, sum(order))))
    return dcg / ideal if ideal else float("nan")


def mean(values: List[float]) -> float:
    vals = [v for v in values if not math.isnan(v)]
    return statistics.mean(vals) if vals else float("nan")


# --------------------------------------------------------------------------
# JD parser accuracy (rule-based path; the LLM path is not exercised offline)
# --------------------------------------------------------------------------

JD_CASES = [
    ("Backend Developer. Must have Java, Spring Boot and SQL. Good to have Docker. CSE/IT only, min 7 CGPA.",
     {"Java", "Spring Boot", "SQL", "Docker"}),
    ("We need a React developer comfortable with JavaScript, TypeScript and REST APIs. Nice to have: Next.js.",
     {"React", "JavaScript", "TypeScript", "REST API", "Next.js"}),
    ("Data Analyst: strong SQL and Excel; dashboards in Power BI or Tableau; Python is a plus.",
     {"SQL", "Excel", "Power BI", "Tableau", "Python"}),
    ("Cloud engineer to run workloads on AWS with Docker, Kubernetes and Terraform on Linux.",
     {"AWS", "Docker", "Kubernetes", "Terraform", "Linux"}),
    ("ML Engineer. Required: Python, PyTorch, scikit-learn, pandas. Bonus: NLP experience.",
     {"Python", "PyTorch", "Scikit-learn", "Pandas", "Natural Language Processing"}),
    ("Full stack role using the MERN stack: MongoDB, Express, React and Node.js; Git essential.",
     {"MongoDB", "Express.js", "React", "Node.js", "Git"}),
    ("QA engineer with Selenium, Jest and Postman for API testing; basic JavaScript.",
     {"Selenium", "Jest", "Postman", "JavaScript"}),
    ("Android developer: Kotlin and Java required, Firebase preferred.",
     {"Kotlin", "Java", "Firebase"}),
]


def evaluate_jd_parser() -> dict:
    tp = fp = fn = 0
    per_case = []
    for text, expected in JD_CASES:
        found = set(analyze_job_description(text)["skills"])
        tp += len(found & expected)
        fp += len(found - expected)
        fn += len(expected - found)
        per_case.append({"expected": sorted(expected), "found": sorted(found)})
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    return {
        "cases": len(JD_CASES),
        "precision": round(precision, 3),
        "recall": round(recall, 3),
        "f1": round(f1, 3),
        "details": per_case,
    }


# --------------------------------------------------------------------------
# Runs
# --------------------------------------------------------------------------

BANDS = ["Not Ready", "Developing", "Ready", "Highly Employable"]


def run(seed: int) -> dict:
    students = make_students(random.Random(seed), N_STUDENTS)
    outcome_rng = random.Random(seed + 1)
    tie_rng = random.Random(seed + 2)

    scorers = {
        "CampusLink match score": score_campuslink,
        "Skill overlap only": score_skill_overlap,
        "CGPA only": score_cgpa,
        "Random": lambda s, j: tie_rng.random(),
    }
    per_scorer: Dict[str, Dict[str, List[float]]] = {
        name: {"auc": [], "p": [], "ndcg": []} for name in scorers
    }
    band_outcomes: Dict[str, List[bool]] = {b: [] for b in BANDS}
    pairs = hires = 0
    per_role = []

    for role in ROLES:
        job = job_payload(role)
        pool = [s for s in students if eligible(s, role)]
        labels = [hired(s, role, outcome_rng) for s in pool]
        pairs += len(pool)
        hires += sum(labels)
        per_role.append({"role": role[0], "eligible": len(pool), "hired": sum(labels)})

        for s, y in zip(pool, labels):
            band_outcomes[compute_readiness(s["skills"], role[1])["band"]].append(y)

        for name, fn in scorers.items():
            scores = [fn(s, job) for s in pool]
            order = ranked(scores, labels, tie_rng)
            per_scorer[name]["auc"].append(auc(scores, labels))
            per_scorer[name]["p"].append(precision_at_k(order, K))
            per_scorer[name]["ndcg"].append(ndcg_at_k(order, K))

    return {
        "seed": seed,
        "pairs": pairs,
        "hires": hires,
        "per_role": per_role,
        "ranking": {name: {m: mean(v) for m, v in metrics.items()} for name, metrics in per_scorer.items()},
        "bands": {b: (len(v), sum(v)) for b, v in band_outcomes.items()},
    }


def throughput() -> dict:
    students = make_students(random.Random(SEEDS[0]), N_STUDENTS)
    job = job_payload(ROLES[0])
    start = time.perf_counter()
    for s in students:
        compute_match(
            {"cgpa": s["cgpa"], "skills": s["skills"], "projects": s["projects"], "certifications": [], "experienceMonths": 0},
            job,
        )
    elapsed = time.perf_counter() - start
    return {"match_scores": len(students), "seconds": round(elapsed, 3), "per_second": int(len(students) / elapsed)}


def main() -> dict:
    runs = [run(seed) for seed in SEEDS]

    def agg(values: List[float]) -> dict:
        return {"mean": round(statistics.mean(values), 3), "sd": round(statistics.stdev(values), 3)}

    ranking = {
        name: {
            "auc": agg([r["ranking"][name]["auc"] for r in runs]),
            f"precision_at_{K}": agg([r["ranking"][name]["p"] for r in runs]),
            f"ndcg_at_{K}": agg([r["ranking"][name]["ndcg"] for r in runs]),
        }
        for name in runs[0]["ranking"]
    }

    calibration = []
    for band in BANDS:
        n = sum(r["bands"][band][0] for r in runs)
        h = sum(r["bands"][band][1] for r in runs)
        calibration.append({"band": band, "pairs": n, "hire_rate": round(h / n, 3) if n else None})

    pairs = sum(r["pairs"] for r in runs)
    hires = sum(r["hires"] for r in runs)
    results = {
        "seeds": SEEDS,
        "students_per_run": N_STUDENTS,
        "roles": len(ROLES),
        "eligible_pairs": pairs,
        "hires": hires,
        "base_hire_rate": round(hires / pairs, 3),
        "k": K,
        "ranking": ranking,
        "readiness_calibration": calibration,
        "per_role_first_run": runs[0]["per_role"],
        "jd_parser": evaluate_jd_parser(),
        "throughput": throughput(),
    }

    Path(__file__).with_name("results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print_summary(results)
    return results


def print_summary(r: dict) -> None:
    k = r["k"]
    print(
        f"{len(r['seeds'])} runs x {r['students_per_run']} students, {r['roles']} roles: "
        f"{r['eligible_pairs']} eligible pairs, {r['hires']} hires (base rate {r['base_hire_rate']})\n"
    )
    print(f"| Ranking | AUC | Precision@{k} | NDCG@{k} |")
    print("|---|---|---|---|")
    for name, m in r["ranking"].items():
        cells = [f"{m[key]['mean']} (sd {m[key]['sd']})" for key in ("auc", f"precision_at_{k}", f"ndcg_at_{k}")]
        print(f"| {name} | " + " | ".join(cells) + " |")
    print("\n| Readiness band | Pairs | Observed hire rate |")
    print("|---|---|---|")
    for c in r["readiness_calibration"]:
        print(f"| {c['band']} | {c['pairs']} | {c['hire_rate']} |")
    jd = r["jd_parser"]
    print(
        f"\nJD skill extraction (rule-based, {jd['cases']} JDs): precision {jd['precision']}, "
        f"recall {jd['recall']}, F1 {jd['f1']}"
    )
    t = r["throughput"]
    print(f"Scorer throughput: {t['per_second']} match scores/second ({t['match_scores']} in {t['seconds']}s)")


if __name__ == "__main__":
    main()
