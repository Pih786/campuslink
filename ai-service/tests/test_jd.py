JD_WITH_SPLIT = """Role: Software Engineer

We are looking for a Software Engineer to join our team.

Must have:
- React
- Node.js
- SQL

Good to have:
- AWS
- Docker

Minimum CGPA: 7
Eligible branches: CSE, IT
"""

JD_NO_SPLIT = """Position: Backend Developer

We need someone skilled in Python, Django and PostgreSQL to join our backend team.
"""

JD_WITH_CGPA_AND_BRANCHES = """Software Development Engineer

Requirements:
- Strong programming skills in Java
- Experience with MySQL

CGPA: at least 7.5
Branches: Computer Science, Information Technology, Electronics and Communication
"""

JD_GARBAGE = "!!! ### random text with nothing useful in it 12345 ???"


def test_jd_with_explicit_split(client):
    resp = client.post("/ai/jd/analyze", json={"text": JD_WITH_SPLIT})
    assert resp.status_code == 200
    data = resp.json()

    assert data["role"] == "Software Engineer"
    assert set(["React", "Node.js", "SQL"]).issubset(set(data["mandatorySkills"]))
    assert "AWS" in data["optionalSkills"]
    assert "Docker" in data["optionalSkills"]
    assert "AWS" not in data["mandatorySkills"]
    assert "Docker" not in data["mandatorySkills"]
    assert data["minimumCgpa"] == 7
    assert "CSE" in data["branches"]
    assert "IT" in data["branches"]


def test_jd_with_no_split_puts_everything_in_mandatory(client):
    resp = client.post("/ai/jd/analyze", json={"text": JD_NO_SPLIT})
    assert resp.status_code == 200
    data = resp.json()

    assert data["role"] == "Backend Developer"
    assert "Python" in data["skills"]
    assert "Django" in data["skills"]
    assert "PostgreSQL" in data["skills"]
    # No must-have/nice-to-have cues at all -> everything found is mandatory.
    assert set(data["skills"]) == set(data["mandatorySkills"])
    assert data["optionalSkills"] == []


def test_jd_with_explicit_cgpa_and_branches(client):
    resp = client.post("/ai/jd/analyze", json={"text": JD_WITH_CGPA_AND_BRANCHES})
    assert resp.status_code == 200
    data = resp.json()

    assert data["minimumCgpa"] == 7.5
    assert set(["CSE", "IT", "ECE"]).issubset(set(data["branches"]))
    assert "Java" in data["skills"]
    assert "MySQL" in data["skills"]


def test_jd_empty_input_returns_empty_not_error(client):
    resp = client.post("/ai/jd/analyze", json={"text": ""})
    assert resp.status_code == 200
    data = resp.json()

    assert data["role"] is None
    assert data["skills"] == []
    assert data["mandatorySkills"] == []
    assert data["optionalSkills"] == []
    assert data["minimumCgpa"] is None
    assert data["branches"] == []


def test_jd_garbage_input_returns_empty_not_error(client):
    resp = client.post("/ai/jd/analyze", json={"text": JD_GARBAGE})
    assert resp.status_code == 200
    data = resp.json()

    assert data["skills"] == []
    assert data["mandatorySkills"] == []
    assert data["optionalSkills"] == []
    assert data["minimumCgpa"] is None
    assert data["branches"] == []
