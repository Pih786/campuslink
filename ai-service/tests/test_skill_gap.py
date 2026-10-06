def test_skill_gap_basic(client):
    resp = client.post(
        "/ai/skill-gap",
        json={
            "studentSkills": ["React", "Node.js"],
            "requiredSkills": ["React", "Node.js", "AWS"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matched"] == ["React", "Node.js"]
    assert data["missing"] == ["AWS"]


def test_skill_gap_alias_resolution(client):
    # "ReactJS" (student) and "React" (required) must be recognized as the
    # same skill via the dictionary's alias resolver.
    resp = client.post(
        "/ai/skill-gap",
        json={
            "studentSkills": ["ReactJS", "postgres"],
            "requiredSkills": ["React", "PostgreSQL", "AWS"],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "React" in data["matched"]
    assert "PostgreSQL" in data["matched"]
    assert data["missing"] == ["AWS"]


def test_skill_gap_case_insensitive(client):
    resp = client.post(
        "/ai/skill-gap",
        json={"studentSkills": ["react", "NODE.JS"], "requiredSkills": ["React", "Node.js"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matched"] == ["React", "Node.js"]
    assert data["missing"] == []


def test_skill_gap_unknown_skills_pass_through(client):
    resp = client.post(
        "/ai/skill-gap",
        json={"studentSkills": ["Photoshop"], "requiredSkills": ["Photoshop", "Illustrator"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["matched"] == ["Photoshop"]
    assert data["missing"] == ["Illustrator"]


def test_skill_gap_empty_inputs(client):
    resp = client.post("/ai/skill-gap", json={"studentSkills": [], "requiredSkills": []})
    assert resp.status_code == 200
    data = resp.json()
    assert data == {"matched": [], "missing": []}
