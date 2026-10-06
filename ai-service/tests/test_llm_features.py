from app.llm import groq_client
from app.logic import copilot as copilot_logic

JD_TEXT = """Software Engineer - ABC Technologies, Bengaluru

Must have: React, Node.js and REST APIs.
Good to have: Docker.
Minimum CGPA 7.5. Open to CSE and IT students. 1 year of experience preferred."""


def _enable_llm(monkeypatch, *, chat_json_result=None, chat_result=None, rate_limited=False):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(groq_client, "chat_json", lambda *a, **k: chat_json_result)
    monkeypatch.setattr(
        groq_client,
        "complete",
        lambda *a, **k: groq_client.LLMResult(content=chat_result, rate_limited=rate_limited),
    )


def test_jd_falls_back_to_rules_when_llm_disabled(client):
    resp = client.post("/ai/jd/analyze", json={"text": JD_TEXT})
    body = resp.json()
    assert resp.status_code == 200
    assert body["source"] == "rules"
    assert "React" in body["skills"]


def test_jd_falls_back_to_rules_when_llm_call_fails(client, monkeypatch):
    _enable_llm(monkeypatch, chat_json_result=None)
    body = client.post("/ai/jd/analyze", json={"text": JD_TEXT}).json()
    assert body["source"] == "rules"


def test_jd_llm_output_is_grounded_in_text(client, monkeypatch):
    _enable_llm(
        monkeypatch,
        chat_json_result={
            "role": "Software Engineer",
            "mandatorySkills": ["React", "Node.js", "REST APIs", "Kubernetes"],
            "optionalSkills": ["Docker", "GraphQL"],
            "minimumCgpa": 7.5,
            "branches": ["Computer Science", "IT", "Biotech"],
            "experienceYears": 1,
            "location": "Bengaluru",
            "responsibilities": ["Build APIs", "Ship features"],
        },
    )
    body = client.post("/ai/jd/analyze", json={"text": JD_TEXT}).json()

    assert body["source"] == "llm"
    # Hallucinated skills (not in the JD text) are dropped.
    assert "Kubernetes" not in body["skills"]
    assert "GraphQL" not in body["skills"]
    # Plural alias is normalized to the dictionary's canonical name.
    assert "REST API" in body["mandatorySkills"]
    assert body["optionalSkills"] == ["Docker"]
    assert body["minimumCgpa"] == 7.5
    # Free-text branch names normalize to codes; unknown branches are dropped.
    assert body["branches"] == ["CSE", "IT"]
    assert body["experienceYears"] == 1
    assert body["location"] == "Bengaluru"


def test_jd_llm_numbers_not_in_text_are_rejected(client, monkeypatch):
    _enable_llm(
        monkeypatch,
        chat_json_result={
            "mandatorySkills": ["React"],
            "optionalSkills": [],
            "minimumCgpa": 8.5,
            "experienceYears": 3,
            "branches": [],
        },
    )
    body = client.post("/ai/jd/analyze", json={"text": JD_TEXT}).json()
    # 8.5 isn't in the JD, so the rule-based value (7.5) is used instead.
    assert body["minimumCgpa"] == 7.5
    assert body["experienceYears"] is None


def test_jd_llm_keeps_dictionary_skills_it_missed(client, monkeypatch):
    _enable_llm(
        monkeypatch,
        chat_json_result={"mandatorySkills": ["React"], "optionalSkills": [], "branches": []},
    )
    body = client.post("/ai/jd/analyze", json={"text": JD_TEXT}).json()
    assert "Node.js" in body["skills"]
    assert "Docker" in body["optionalSkills"]


FACTS = {
    "overview": {"totalStudents": 11, "totalApplications": 5, "offers": 2},
    "funnel": {"applied": 5, "shortlisted": 4},
    "conversion": {"shortlistRatePct": 80.0, "offerAcceptanceRatePct": 66.67},
    "skills": [{"skill": "AWS", "demandOpenJobs": 2, "verifiedSupplyStudents": 1}],
}


def test_copilot_unavailable_without_llm(client):
    resp = client.post("/ai/copilot", json={"question": "How many offers?", "facts": FACTS})
    body = resp.json()
    assert resp.status_code == 200
    assert body["source"] == "unavailable"


def test_copilot_flags_numbers_not_in_facts(client, monkeypatch):
    _enable_llm(
        monkeypatch,
        chat_result="There are **11** students and 2 offers, a 67% acceptance rate. About 45 more are expected.",
    )
    body = client.post("/ai/copilot", json={"question": "How are we doing?", "facts": FACTS}).json()
    assert body["source"] == "llm"
    # 11, 2 and 67 (≈66.67) are grounded; 45 is not.
    assert body["unverifiedNumbers"] == ["45"]


def test_copilot_allows_numbers_from_the_question():
    unverified = copilot_logic.find_unverified_numbers(
        "Training 300 students in AWS would add to the 1 verified student.",
        FACTS,
        "What if 300 students get AWS training?",
    )
    assert unverified == []


def test_copilot_reports_rate_limit_honestly(client, monkeypatch):
    _enable_llm(monkeypatch, chat_result=None, rate_limited=True)
    body = client.post("/ai/copilot", json={"question": "How many offers?", "facts": FACTS}).json()
    assert body["source"] == "unavailable"
    assert "rate limit" in body["answer"]


def test_copilot_accepts_numbers_inside_fact_timestamps():
    facts = {"drives": [{"date": "2026-09-29T05:00:00.000Z", "conflicts": 0}]}
    assert copilot_logic.find_unverified_numbers("The drive on 29 Sep 2026 has 0 conflicts.", facts, "q") == []


def test_groq_client_falls_back_to_second_model_on_429(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    calls = []

    class FakeResponse:
        def __init__(self, status, content=None):
            self.status_code = status
            self.headers = {}
            self.text = ""
            self._content = content

        def json(self):
            return {"choices": [{"message": {"content": self._content}}]}

    def fake_post(api_key, body):
        calls.append(body["model"])
        if body["model"] == groq_client.DEFAULT_MODEL:
            return FakeResponse(429)
        return FakeResponse(200, "hello from fallback")

    monkeypatch.setattr(groq_client, "_post", fake_post)
    result = groq_client.complete([{"role": "user", "content": "hi"}])
    assert result.content == "hello from fallback"
    assert result.model == groq_client.DEFAULT_FALLBACK_MODEL
    assert calls == [groq_client.DEFAULT_MODEL, groq_client.DEFAULT_FALLBACK_MODEL]


def test_jd_llm_compound_skill_phrases_map_to_dictionary_skills(client, monkeypatch):
    _enable_llm(
        monkeypatch,
        chat_json_result={
            "mandatorySkills": ["React"],
            "optionalSkills": ["Docker", "CI/CD pipelines"],
            "branches": [],
        },
    )
    text = JD_TEXT + "\nExposure to CI/CD pipelines is a plus."
    body = client.post("/ai/jd/analyze", json={"text": text}).json()
    assert "CI/CD" in body["optionalSkills"]
    assert "CI/CD pipelines" not in body["skills"]


def test_copilot_rejects_empty_question(client):
    resp = client.post("/ai/copilot", json={"question": "", "facts": FACTS})
    assert resp.status_code == 422
