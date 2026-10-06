RESUME_CLEAN = """John Doe
Aspiring Software Engineer

EDUCATION
MCA, XYZ University, 2024
CGPA: 8.1

PROJECTS
E-commerce Platform
Built a full stack e-commerce app using React, Node.js and MongoDB.

Chat Application
Real-time chat app using Socket.io and Express.js.

EXPERIENCE
Software Intern at Acme Corp (Jan 2023 - Jun 2023)

CERTIFICATIONS
AWS Certified Cloud Practitioner

SKILLS
Python, SQL, Git
"""

RESUME_NO_CGPA = """Jane Smith

Education
B.Tech in Computer Science, ABC College, 2023

Projects
Portfolio Website
Personal portfolio built with React and Tailwind CSS.

Skills
React, JavaScript, Tailwind CSS
"""

RESUME_UNUSUAL_HEADER_CASING = """Alex Kumar

eDUcaTioN
BCA, 2022
CGPA: 7.5 / 10

pRoJeCtS
Library Management System
A Java and MySQL based system for managing library records.

sKiLLs
Java, MySQL
"""

RESUME_GARBAGE = "asdkfj alksjdf laksjdf 12345 !!!@@@ ###"


def test_resume_clean_extracts_all_sections(client):
    resp = client.post("/ai/resume/analyze", json={"text": RESUME_CLEAN})
    assert resp.status_code == 200
    data = resp.json()

    assert "React" in data["skills"]
    assert "Node.js" in data["skills"]
    assert "MongoDB" in data["skills"]
    assert "Python" in data["skills"]
    assert "SQL" in data["skills"]
    assert "Git" in data["skills"]

    assert data["education"]["degree"] == "MCA"
    assert data["education"]["cgpa"] == 8.1

    assert len(data["projects"]) == 2
    titles = [p["title"] for p in data["projects"]]
    assert "E-commerce Platform" in titles
    assert "Chat Application" in titles
    ecommerce = next(p for p in data["projects"] if p["title"] == "E-commerce Platform")
    assert "React" in ecommerce["technologies"]
    assert "Node.js" in ecommerce["technologies"]
    assert "MongoDB" in ecommerce["technologies"]

    assert len(data["experience"]) >= 1
    assert len(data["certifications"]) >= 1
    assert "AWS Certified Cloud Practitioner" in data["certifications"][0]


def test_resume_with_no_cgpa_returns_null_cgpa(client):
    resp = client.post("/ai/resume/analyze", json={"text": RESUME_NO_CGPA})
    assert resp.status_code == 200
    data = resp.json()

    assert data["education"]["degree"] is not None
    assert "B.Tech" in data["education"]["degree"] or data["education"]["degree"] == "B.Tech"
    assert data["education"]["cgpa"] is None
    assert "React" in data["skills"]
    assert "Tailwind CSS" in data["skills"]


def test_resume_unusual_section_header_casing_still_parses(client):
    resp = client.post("/ai/resume/analyze", json={"text": RESUME_UNUSUAL_HEADER_CASING})
    assert resp.status_code == 200
    data = resp.json()

    assert data["education"]["degree"] == "BCA"
    assert data["education"]["cgpa"] == 7.5
    assert len(data["projects"]) == 1
    assert data["projects"][0]["title"] == "Library Management System"
    assert "Java" in data["projects"][0]["technologies"]
    assert "MySQL" in data["projects"][0]["technologies"]
    assert "Java" in data["skills"]
    assert "MySQL" in data["skills"]


def test_resume_garbage_input_returns_empty_not_error(client):
    resp = client.post("/ai/resume/analyze", json={"text": RESUME_GARBAGE})
    assert resp.status_code == 200
    data = resp.json()

    assert data["skills"] == []
    assert data["projects"] == []
    assert data["education"]["degree"] is None
    assert data["education"]["cgpa"] is None
    assert data["experience"] == []
    assert data["certifications"] == []


def test_resume_empty_string_input_returns_empty_not_error(client):
    resp = client.post("/ai/resume/analyze", json={"text": ""})
    assert resp.status_code == 200
    data = resp.json()
    assert data["skills"] == []
    assert data["projects"] == []
    assert data["education"] == {"degree": None, "cgpa": None}
