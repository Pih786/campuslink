import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def no_real_llm(monkeypatch):
    # Tests must never call the real Groq API (cost, latency, nondeterminism).
    # Tests that exercise the LLM path re-enable it with a mocked client.
    monkeypatch.setenv("GROQ_API_KEY", "")


@pytest.fixture()
def client():
    return TestClient(app)
