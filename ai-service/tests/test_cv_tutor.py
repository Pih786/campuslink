from app.llm import groq_client

CV_FACTS = {
    "headline": "CSE student, Class of 2026",
    "education": ["B.Tech, Computer Science, NIT Trichy, CGPA 8.6/10"],
    "skills": ["React", "Node.js", "SQL"],
    "projects": [{"title": "Placement Tracker", "tech": ["React"]}],
    "experience": [],
    "certifications": ["AWS Cloud Practitioner"],
}


def test_cv_summary_template_without_llm(client):
    res = client.post("/ai/cv/summary", json=CV_FACTS)
    assert res.status_code == 200
    body = res.json()
    assert body["source"] == "template"
    # Built only from the supplied facts.
    assert "React, Node.js and SQL" in body["summary"]
    assert "Placement Tracker" in body["summary"]
    assert "AWS Cloud Practitioner" in body["summary"]


def test_cv_summary_uses_llm_when_available(client, monkeypatch):
    text = "Computer Science student who builds React and Node.js apps, with a certified grounding in AWS."
    monkeypatch.setattr(groq_client, "chat_json", lambda *a, **k: {"summary": text})
    body = client.post("/ai/cv/summary", json=CV_FACTS).json()
    assert body == {"summary": text, "source": "llm"}


def test_cv_summary_rejects_empty_llm_output(client, monkeypatch):
    monkeypatch.setattr(groq_client, "chat_json", lambda *a, **k: {"summary": "ok"})
    assert client.post("/ai/cv/summary", json=CV_FACTS).json()["source"] == "template"


def test_cv_summary_with_no_facts_asks_for_details(client):
    body = client.post("/ai/cv/summary", json={}).json()
    assert body["source"] == "template"
    assert "Add your education" in body["summary"]


TUTOR_REQ = {
    "question": "How do SQL joins work?",
    "skill": "SQL",
    "resources": [
        {"id": "R1", "title": "SQLBolt interactive lessons", "type": "PRACTICE"},
        {"id": "R2", "title": "SQL practice", "type": "PRACTICE"},
    ],
}


def test_tutor_unavailable_without_llm(client):
    body = client.post("/ai/tutor", json=TUTOR_REQ).json()
    assert body["source"] == "unavailable"
    assert body["resources"] == []


def test_tutor_keeps_only_known_resource_ids(client, monkeypatch):
    monkeypatch.setattr(
        groq_client,
        "chat_json",
        lambda *a, **k: {"answer": "An INNER JOIN keeps matching rows. Try [R1].", "resources": ["R1", "R9", "R1"]},
    )
    body = client.post("/ai/tutor", json=TUTOR_REQ).json()
    assert body["source"] == "llm"
    assert body["resources"] == ["R1"]


def test_tutor_passes_history_and_grounding(client, monkeypatch):
    seen = {}

    def fake(messages, **kwargs):
        seen["messages"] = messages
        return {"answer": "Sure.", "resources": []}

    monkeypatch.setattr(groq_client, "chat_json", fake)
    req = {**TUTOR_REQ, "history": [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]}
    client.post("/ai/tutor", json=req)
    roles = [m["role"] for m in seen["messages"]]
    assert roles == ["system", "system", "user", "assistant", "user"]
    assert "[R1] SQLBolt interactive lessons" in seen["messages"][1]["content"]
