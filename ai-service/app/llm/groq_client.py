"""Thin Groq (OpenAI-compatible) chat client.

Failures never raise: callers get an ``LLMResult`` with ``content=None`` and
fall back to their deterministic, rule-based path. Configuration is read at
call time (not import time) so tests can disable the LLM by clearing
``GROQ_API_KEY``.

Free-tier Groq keys have a per-model tokens-per-minute cap, so a 429 on the
primary model is retried once (if Groq asks for a short wait) and then routed
to the fallback model, which has its own separate quota.
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-oss-120b"
DEFAULT_FALLBACK_MODEL = "openai/gpt-oss-20b"
TIMEOUT_SECONDS = 25.0
MAX_RETRY_WAIT_SECONDS = 3.0


@dataclass
class LLMResult:
    content: Optional[str]
    rate_limited: bool = False
    model: Optional[str] = None


def is_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


def _models() -> List[str]:
    primary = os.getenv("GROQ_MODEL") or DEFAULT_MODEL
    fallback = os.getenv("GROQ_FALLBACK_MODEL") or DEFAULT_FALLBACK_MODEL
    return [primary] if fallback == primary else [primary, fallback]


def _retry_wait_seconds(response: httpx.Response) -> Optional[float]:
    try:
        wait = float(response.headers.get("retry-after", ""))
    except ValueError:
        return None
    return wait if wait <= MAX_RETRY_WAIT_SECONDS else None


def _post(api_key: str, body: Dict[str, Any]) -> httpx.Response:
    return httpx.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {api_key}"},
        json=body,
        timeout=TIMEOUT_SECONDS,
    )


def complete(
    messages: List[Dict[str, str]],
    *,
    json_mode: bool = False,
    max_tokens: int = 1024,
    temperature: float = 0.2,
) -> LLMResult:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        return LLMResult(content=None)

    rate_limited = False
    for model in _models():
        body: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_tokens,
        }
        if model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        try:
            response = _post(api_key, body)
            if response.status_code == 429:
                wait = _retry_wait_seconds(response)
                if wait is not None:
                    time.sleep(wait)
                    response = _post(api_key, body)

            if response.status_code == 429:
                rate_limited = True
                logger.warning("Groq rate limit on %s; trying fallback model if any", model)
                continue
            if response.status_code != 200:
                logger.warning("Groq returned %s on %s: %s", response.status_code, model, response.text[:300])
                return LLMResult(content=None)

            content = response.json()["choices"][0]["message"]["content"]
            return LLMResult(content=content, model=model)
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            logger.warning("Groq call failed on %s: %s", model, exc)
            return LLMResult(content=None)

    return LLMResult(content=None, rate_limited=rate_limited)


def chat(messages: List[Dict[str, str]], **kwargs: Any) -> Optional[str]:
    return complete(messages, **kwargs).content


def chat_json(messages: List[Dict[str, str]], **kwargs: Any) -> Optional[Dict[str, Any]]:
    content = complete(messages, json_mode=True, **kwargs).content
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        logger.warning("Groq returned non-JSON content in JSON mode")
        return None
    return parsed if isinstance(parsed, dict) else None
