"""Tests for the predictive placement-likelihood model -- kept fully separate
from the matching-engine tests, matching the module split in app/api/."""
from app.ml import features, serve


def test_features_use_only_declared_and_verified_data():
    student = {
        "cgpa": 8.0,
        "skills": [{"name": "Java", "proficiency": 4, "verified": True}, {"name": "SQL", "proficiency": 2, "verified": False}],
        "projects": [{"title": "P", "technologies": ["Java"]}],
        "certifications": [{"name": "X", "verified": True}],
        "experienceMonths": 6,
    }
    job = {"requirements": [{"type": "SKILL", "skillName": "Java", "minimumProficiency": 3}, {"type": "CGPA", "value": 6.5}]}

    built = features.build_features(student, job)
    assert set(built.keys()) == set(features.FEATURE_NAMES)
    assert 0 <= built["verified_ratio"] <= 1
    # Java is required and verified -> counts toward verified_ratio; SQL isn't required here.
    assert built["verified_ratio"] == 1.0


def test_verified_ratio_zero_when_nothing_required_is_verified():
    student = {"skills": [{"name": "Java", "proficiency": 4, "verified": False}]}
    job = {"requirements": [{"type": "SKILL", "skillName": "Java", "minimumProficiency": 3}]}
    assert features.build_features(student, job)["verified_ratio"] == 0.0


def test_model_is_trained_and_loaded():
    # This asserts the checked-in model.json (produced by `python -m app.ml.train`)
    # is present and loads -- if training hasn't been run, this documents why
    # every other assertion below would be skipped rather than failing oddly.
    assert serve.is_available(), "run `pip install -r requirements-train.txt && python -m app.ml.train` first"


def test_predict_probability_is_a_valid_probability():
    student = {
        "cgpa": 8.5,
        "skills": [{"name": "Java", "proficiency": 4, "verified": True}, {"name": "SQL", "proficiency": 4, "verified": True}],
        "projects": [{"title": "P", "technologies": ["Java", "SQL"]}],
        "certifications": [],
        "experienceMonths": 3,
    }
    job = {
        "requirements": [
            {"type": "SKILL", "skillName": "Java", "minimumProficiency": 3},
            {"type": "SKILL", "skillName": "SQL", "minimumProficiency": 3},
            {"type": "CGPA", "value": 7},
        ]
    }
    prob = serve.predict_probability(student, job)
    assert prob is not None
    assert 0.0 <= prob <= 1.0


def test_stronger_profile_scores_at_least_as_high():
    job = {"requirements": [{"type": "SKILL", "skillName": "Java", "minimumProficiency": 3}, {"type": "CGPA", "value": 6.5}]}
    weak = {"cgpa": 6.6, "skills": [{"name": "Java", "proficiency": 1, "verified": False}], "projects": [], "certifications": [], "experienceMonths": 0}
    strong = {"cgpa": 9.0, "skills": [{"name": "Java", "proficiency": 5, "verified": True}], "projects": [{"title": "P", "technologies": ["Java"]}], "certifications": [], "experienceMonths": 6}
    assert serve.predict_probability(strong, job) >= serve.predict_probability(weak, job)


def test_predict_probability_never_raises_on_missing_model(monkeypatch):
    monkeypatch.setattr(serve, "_MODEL", None)
    assert serve.predict_probability({"skills": []}, {"requirements": []}) is None
    assert serve.model_info() is None


def test_predict_probability_never_raises_on_malformed_input():
    # A scoring feature must never 500 the request; malformed input degrades
    # to "unavailable", same as an unreachable model.
    result = serve.predict_probability({"skills": "not-a-list"}, {"requirements": None})
    assert result is None or 0.0 <= result <= 1.0
