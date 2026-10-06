def test_readiness_not_ready_band(client):
    resp = client.post(
        "/ai/readiness",
        json={
            "studentSkills": [{"name": "HTML", "proficiency": 1}],
            "requiredSkills": ["React", "Node.js", "AWS"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] < 40
    assert data["band"] == "Not Ready"


def test_readiness_developing_band(client):
    # React fully known (proficiency 5 -> 100), Node.js unknown (0):
    # average = 50 -> "Developing" (40-59).
    resp = client.post(
        "/ai/readiness",
        json={
            "studentSkills": [{"name": "React", "proficiency": 5}],
            "requiredSkills": ["React", "Node.js"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 50
    assert data["band"] == "Developing"


def test_readiness_ready_band(client):
    # Two skills known at proficiency 5 (100 each), one unknown (0):
    # (100 + 100 + 0) / 3 = 66.67 -> 67 -> "Ready" (60-79).
    resp = client.post(
        "/ai/readiness",
        json={
            "studentSkills": [
                {"name": "React", "proficiency": 5},
                {"name": "Node.js", "proficiency": 5},
            ],
            "requiredSkills": ["React", "Node.js", "AWS"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 67
    assert data["band"] == "Ready"


def test_readiness_highly_employable_band(client):
    resp = client.post(
        "/ai/readiness",
        json={
            "studentSkills": [
                {"name": "React", "proficiency": 5},
                {"name": "Node.js", "proficiency": 5},
            ],
            "requiredSkills": ["React", "Node.js"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 100
    assert data["band"] == "Highly Employable"


def test_readiness_empty_required_skills_is_not_ready(client):
    # Nothing to be ready for is explicitly NOT the same as fully ready.
    resp = client.post(
        "/ai/readiness",
        json={"studentSkills": [{"name": "React", "proficiency": 5}], "requiredSkills": []},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 0
    assert data["band"] == "Not Ready"


def test_readiness_alias_resolution(client):
    resp = client.post(
        "/ai/readiness",
        json={
            "studentSkills": [{"name": "ReactJS", "proficiency": 5}],
            "requiredSkills": ["React"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 100
    assert data["band"] == "Highly Employable"
