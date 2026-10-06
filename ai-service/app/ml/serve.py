"""Serves the predictive placement-likelihood model trained by app/ml/train.py.

Deliberately independent of the matching/scoring engine: this module is only
ever called from app/api/predictive.py's own route, never from
app/api/matching.py. If app/ml/model.json doesn't exist (not trained yet) or
fails to load, every function here degrades to "unavailable" rather than
raising -- same pattern as the rest of this service when the LLM is
unreachable: a missing predictive model must never break anything else.

No scikit-learn import here: training's artifact is small enough that
serving just re-implements the logistic regression's own math (standardize,
dot product, sigmoid) by hand, so the always-running service stays light.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

from app.ml.features import feature_vector

_MODEL_PATH = Path(__file__).with_name("model.json")


def _load() -> Optional[dict]:
    try:
        return json.loads(_MODEL_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


_MODEL = _load()


def is_available() -> bool:
    return _MODEL is not None


def _sigmoid(x: float) -> float:
    if x < -700:  # avoid overflow on extreme inputs
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


def predict_probability(student: dict, job: dict) -> Optional[float]:
    """Probability of a hire-equivalent outcome, in [0, 1], or None if the
    model isn't trained/loaded, or the input is unusable."""
    if _MODEL is None:
        return None
    try:
        raw = feature_vector(student, job)
        mean = _MODEL["scaler_mean"]
        scale = _MODEL["scaler_scale"]
        coef = _MODEL["coefficients"]
        intercept = _MODEL["intercept"]
        standardized = [(v - m) / s if s else 0.0 for v, m, s in zip(raw, mean, scale)]
        logit = intercept + sum(c * x for c, x in zip(coef, standardized))
        return round(_sigmoid(logit), 4)
    except Exception:  # noqa: BLE001 -- a scoring feature must never 500 the request
        return None


def _camel_metric_keys(metrics: dict) -> dict:
    return {
        scorer: {("precisionAt10" if k == "precision_at_10" else k): v for k, v in values.items()}
        for scorer, values in metrics.items()
    }


def model_info() -> Optional[dict]:
    """Training metadata for a transparency / "how was this trained" panel."""
    if _MODEL is None:
        return None
    trained_on = _MODEL["trained_on"]
    evaluated_on = _MODEL["evaluated_on"]
    return {
        "featureImportance": _MODEL["feature_importance"],
        "trainedOn": {
            "seasons": trained_on["seasons"],
            "studentsPerSeason": trained_on["students_per_season"],
            "eligiblePairs": trained_on["eligible_pairs"],
            "hireRate": trained_on["hire_rate"],
        },
        "evaluatedOn": {
            "seasons": evaluated_on["seasons"],
            "eligiblePairs": evaluated_on["eligible_pairs"],
            "hireRate": evaluated_on["hire_rate"],
        },
        "metrics": _camel_metric_keys(_MODEL["metrics"]),
        "notes": _MODEL["notes"],
    }
