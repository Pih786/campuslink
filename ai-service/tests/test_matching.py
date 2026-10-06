def _student(**overrides):
    base = {
        "id": "s1",
        "cgpa": 8.1,
        "branch": "CSE",
        "skills": [
            {"name": "React", "proficiency": 4, "verified": True},
            {"name": "Node.js", "proficiency": 4, "verified": True},
            {"name": "MongoDB", "proficiency": 3, "verified": False},
        ],
        "projects": [
            {"title": "E-commerce Platform", "technologies": ["React", "Node.js"]}
        ],
        "certifications": [
            {"name": "AWS Certified Cloud Practitioner", "verified": True}
        ],
        "experienceMonths": 6,
    }
    base.update(overrides)
    return base


def _job(requirements):
    return {"id": "j1", "title": "Software Engineer", "requirements": requirements}


def test_strong_match_scores_high(client):
    requirements = [
        {"type": "SKILL", "skillName": "React", "mandatory": True, "weight": 1, "minimumProficiency": 3},
        {"type": "SKILL", "skillName": "Node.js", "mandatory": True, "weight": 1, "minimumProficiency": 3},
        {"type": "CGPA", "value": 7},
        {"type": "BRANCH", "value": ["CSE", "IT"]},
    ]
    resp = client.post("/ai/match", json={"student": _student(), "job": _job(requirements)})
    assert resp.status_code == 200
    data = resp.json()

    assert isinstance(data["overall"], int)
    assert 0 <= data["overall"] <= 100
    assert data["overall"] >= 70
    assert data["breakdown"]["skill_match"] == 100
    assert data["breakdown"]["education"] == 100
    assert set(data["matched_skills"]) == {"React", "Node.js"}
    assert data["gap_skills"] == []
    assert any("Matched" in line for line in data["explanation"])


def test_weak_match_scores_low(client):
    weak_student = _student(
        cgpa=5.0,
        skills=[{"name": "HTML", "proficiency": 1, "verified": False}],
        projects=[],
        certifications=[],
        experienceMonths=0,
    )
    requirements = [
        {"type": "SKILL", "skillName": "React", "mandatory": True, "weight": 2, "minimumProficiency": 3},
        {"type": "SKILL", "skillName": "AWS", "mandatory": True, "weight": 1, "minimumProficiency": 3},
        {"type": "CGPA", "value": 8},
    ]
    resp = client.post("/ai/match", json={"student": weak_student, "job": _job(requirements)})
    assert resp.status_code == 200
    data = resp.json()

    assert isinstance(data["overall"], int)
    assert 0 <= data["overall"] <= 100
    assert data["overall"] < 40
    assert data["breakdown"]["skill_match"] == 0
    assert set(data["gap_skills"]) == {"React", "AWS"}
    assert data["matched_skills"] == []
    assert data["breakdown"]["education"] < 100
    assert any("Missing" in line for line in data["explanation"])


def test_zero_requirements_does_not_divide_by_zero_and_defaults_sensibly(client):
    resp = client.post("/ai/match", json={"student": _student(), "job": _job([])})
    assert resp.status_code == 200
    data = resp.json()

    assert isinstance(data["overall"], int)
    assert 0 <= data["overall"] <= 100
    assert data["breakdown"]["skill_match"] == 100
    assert data["breakdown"]["education"] == 100
    assert data["breakdown"]["projects"] == 100
    assert data["matched_skills"] == []
    assert data["gap_skills"] == []


def test_overall_is_always_int_between_0_and_100_for_edge_cases(client):
    # Student with almost nothing populated, job with a demanding requirement set.
    minimal_student = {
        "id": "s2",
        "cgpa": None,
        "branch": None,
        "skills": [],
        "projects": [],
        "certifications": [],
        "experienceMonths": 0,
    }
    requirements = [
        {"type": "SKILL", "skillName": "Kubernetes", "mandatory": True, "weight": 3, "minimumProficiency": 5},
        {"type": "CGPA", "value": 9},
    ]
    resp = client.post("/ai/match", json={"student": minimal_student, "job": _job(requirements)})
    assert resp.status_code == 200
    data = resp.json()

    assert isinstance(data["overall"], int)
    assert 0 <= data["overall"] <= 100
    for key, value in data["breakdown"].items():
        assert isinstance(value, int), key
        assert 0 <= value <= 100, key


def test_partial_proficiency_gets_partial_credit(client):
    student = _student(skills=[{"name": "React", "proficiency": 1, "verified": False}])
    requirements = [
        {"type": "SKILL", "skillName": "React", "mandatory": True, "weight": 1, "minimumProficiency": 4},
    ]
    resp = client.post("/ai/match", json={"student": student, "job": _job(requirements)})
    data = resp.json()
    # proficiency 1 of required 4 -> 25% credit, not 0 and not 100.
    assert 0 < data["breakdown"]["skill_match"] < 100
    assert "React" in data["matched_skills"]
