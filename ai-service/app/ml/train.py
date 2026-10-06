"""Trains the predictive placement-likelihood model.

This is a SEPARATE system from the matching/scoring engine (app/logic/scoring.py,
POST /ai/match): it does not change that engine's weights, response shape or
behaviour in any way. It's an independent, additive model exposed only
through its own route (POST /ml/placement-likelihood), consistent with the
problem statement's own split between "Recruiter Requirement Matching"
(Module B) and "Analytics & Predictive Insights" (Section 5) -- a real
trained model belongs in the predictive-analytics half, not blended into the
rule + LLM hybrid matching engine.

Run from ai-service/, with the training-only dependencies installed:

    pip install -r requirements-train.txt
    python -m app.ml.train

Trains a logistic regression on several *simulated past seasons* and
evaluates it on separate, unseen *simulated future seasons* -- i.e. it never
sees the seeds it's tested on, the same way a real deployment would train on
past placement data and be evaluated on the next season. Writes
app/ml/model.json (the small, human-readable artifact the service loads at
request time; no scikit-learn needed to serve it) and prints a comparison
against the existing hand-set formula on the identical held-out data.

Both the model under test and the hand-set formula only ever see the noisy,
declared/verified data a real recruiter's screening page shows -- neither
sees the simulation's hidden "true" skill levels or its hire rule. See
app/ml/simulation.py's module docstring for the full method.
"""
from __future__ import annotations

import json
import random
import statistics
from pathlib import Path
from typing import List

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from app.logic.scoring import compute_match
from app.ml.features import FEATURE_NAMES, feature_vector
from app.ml.simulation import ROLES, eligible, hired, job_payload, make_students

TRAIN_SEEDS = [500001, 500002, 500003, 500004, 500005, 500006]  # 6 simulated past seasons
TEST_SEEDS = [600001, 600002]  # 2 simulated future seasons, never trained on
STUDENTS_PER_SEASON = 1200
K = 10


def _season_examples(seed: int):
    """One simulated season's (features, label, compute_match score) rows,
    restricted to eligible (student, role) pairs -- the pool a recruiter's
    candidate list actually shows."""
    students = make_students(random.Random(seed), STUDENTS_PER_SEASON)
    outcome_rng = random.Random(seed + 1)
    rows = []
    for role in ROLES:
        job = job_payload(role)
        for student in students:
            if not eligible(student, role):
                continue
            label = hired(student, role, outcome_rng)
            student_payload = {
                "cgpa": student["cgpa"],
                "skills": student["skills"],
                "projects": student["projects"],
                "certifications": student["certifications"],
                "experienceMonths": student["experienceMonths"],
            }
            formula_score = compute_match(student_payload, job)["overall"]
            rows.append(
                {
                    "features": feature_vector(student_payload, job),
                    "label": label,
                    "formula_score": formula_score,
                }
            )
    return rows


# --------------------------------------------------------------------------
# Ranking metrics (self-contained: this module is independent of eval/).
# --------------------------------------------------------------------------


def auc(scores: List[float], labels: List[bool]) -> float:
    pos = [s for s, y in zip(scores, labels) if y]
    neg = [s for s, y in zip(scores, labels) if not y]
    if not pos or not neg:
        return float("nan")
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else 0.5 if p == n else 0.0
    return wins / (len(pos) * len(neg))


def precision_at_k(scores: List[float], labels: List[bool], k: int, rng: random.Random) -> float:
    keyed = sorted(zip(scores, [rng.random() for _ in scores], labels), key=lambda t: (t[0], t[1]), reverse=True)
    top = [y for _, _, y in keyed[:k]]
    return sum(top) / len(top) if top else float("nan")


def main() -> dict:
    print(f"Generating {len(TRAIN_SEEDS)} training seasons and {len(TEST_SEEDS)} held-out test seasons...")
    train_rows = [row for seed in TRAIN_SEEDS for row in _season_examples(seed)]
    test_rows = [row for seed in TEST_SEEDS for row in _season_examples(seed)]

    X_train = [r["features"] for r in train_rows]
    y_train = [r["label"] for r in train_rows]
    X_test = [r["features"] for r in test_rows]
    y_test = [r["label"] for r in test_rows]
    formula_test_scores = [r["formula_score"] for r in test_rows]

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = LogisticRegression(max_iter=1000)
    model.fit(X_train_scaled, y_train)
    model_test_probs = model.predict_proba(X_test_scaled)[:, 1]

    rng = random.Random(42)
    metrics = {
        "trained_model": {
            "auc": round(auc(list(model_test_probs), y_test), 4),
            f"precision_at_{K}": round(precision_at_k(list(model_test_probs), y_test, K, rng), 4),
        },
        "existing_hand_set_formula": {
            "auc": round(auc(formula_test_scores, y_test), 4),
            f"precision_at_{K}": round(precision_at_k(formula_test_scores, y_test, K, rng), 4),
        },
    }

    feature_importance = sorted(
        [{"feature": name, "coefficient": round(coef, 4)} for name, coef in zip(FEATURE_NAMES, model.coef_[0])],
        key=lambda x: abs(x["coefficient"]),
        reverse=True,
    )

    artifact = {
        "feature_names": FEATURE_NAMES,
        "scaler_mean": scaler.mean_.tolist(),
        "scaler_scale": scaler.scale_.tolist(),
        "coefficients": model.coef_[0].tolist(),
        "intercept": float(model.intercept_[0]),
        "feature_importance": feature_importance,
        "trained_on": {
            "seasons": len(TRAIN_SEEDS),
            "students_per_season": STUDENTS_PER_SEASON,
            "eligible_pairs": len(train_rows),
            "hire_rate": round(statistics.mean(y_train), 4),
        },
        "evaluated_on": {
            "seasons": len(TEST_SEEDS),
            "eligible_pairs": len(test_rows),
            "hire_rate": round(statistics.mean(y_test), 4),
        },
        "metrics": metrics,
        "notes": (
            "Trained and evaluated on simulated placement seasons (see app/ml/simulation.py), "
            "not real historical data -- there isn't a season of real outcomes yet. The test "
            "seasons were never seen during training, mirroring training on past seasons to "
            "predict an upcoming one."
        ),
    }

    out_path = Path(__file__).with_name("model.json")
    out_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")

    print(f"\nTrained on {artifact['trained_on']['eligible_pairs']} eligible pairs across {len(TRAIN_SEEDS)} seasons")
    print(f"Evaluated on {artifact['evaluated_on']['eligible_pairs']} eligible pairs across {len(TEST_SEEDS)} unseen seasons\n")
    print("| Scorer | AUC | Precision@{} |".format(K))
    print("|---|---|---|")
    for name, m in metrics.items():
        print(f"| {name} | {m['auc']} | {m[f'precision_at_{K}']} |")
    print("\nFeature importance (standardized coefficients, most influential first):")
    for f in feature_importance:
        print(f"  {f['feature']}: {f['coefficient']:+.4f}")
    print(f"\nWrote {out_path}")
    return artifact


if __name__ == "__main__":
    main()
