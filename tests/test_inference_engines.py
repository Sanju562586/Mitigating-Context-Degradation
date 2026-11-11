from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError

from src.generation.engine import (
    GroqEngine,
    OpenAICompatibleEngine,
    OpenRouterEngine,
)


def install_fake_langchain_openai(
    monkeypatch, response_content: str = "answer", invoke_error: Exception | None = None
):
    calls = {}

    class FakeChatOpenAI:
        def __init__(self, **kwargs):
            calls["configuration"] = kwargs

        def invoke(self, messages):
            calls["messages"] = messages
            if invoke_error is not None:
                raise invoke_error
            return SimpleNamespace(content=response_content)

        def stream(self, messages):
            calls["messages"] = messages
            return iter(
                [
                    SimpleNamespace(content="first "),
                    SimpleNamespace(content="second"),
                ]
            )

    module = ModuleType("langchain_openai")
    module.ChatOpenAI = FakeChatOpenAI
    monkeypatch.setitem(sys.modules, "langchain_openai", module)
    return calls


def test_openai_compatible_engine_uses_langchain_for_generation(monkeypatch):
    calls = install_fake_langchain_openai(monkeypatch)
    engine = OpenAICompatibleEngine(
        base_url="https://llm.example/v1",
        api_key="test-key",
        model_name="test-model",
    )

    answer = engine.generate("question", "system", temperature=0.25, max_tokens=128)

    assert answer == "answer"
    assert calls["configuration"] == {
        "model": "test-model",
        "base_url": "https://llm.example/v1",
        "api_key": "test-key",
        "temperature": 0.25,
        "max_tokens": 128,
        "timeout": 60.0,
        "default_headers": None,
    }
    assert [message.content for message in calls["messages"]] == ["system", "question"]


def test_openai_compatible_engine_streams_langchain_chunks(monkeypatch):
    calls = install_fake_langchain_openai(monkeypatch)
    engine = OpenAICompatibleEngine(api_key="test-key")

    chunks = list(engine.generate_stream("question", "system"))

    assert chunks == ["first ", "second"]
    assert [message.content for message in calls["messages"]] == ["system", "question"]


def test_provider_adapters_keep_endpoints_and_openrouter_headers(monkeypatch):
    calls = install_fake_langchain_openai(monkeypatch)
    groq = GroqEngine(api_key="groq-key", model_name="groq-model")
    openrouter = OpenRouterEngine(api_key="router-key", model_name="router-model")

    assert groq.base_url == "https://api.groq.com/openai/v1"
    assert groq.model_name == "groq/groq-model"
    assert groq.is_configured()
    assert openrouter.base_url == "https://openrouter.ai/api/v1"
    assert openrouter.model_name == "openrouter/router-model"
    assert openrouter.default_headers == {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Mitigating Context Degradation",
    }
    assert openrouter.is_configured()
    openrouter.generate("question", "system")
    assert calls["configuration"]["default_headers"] == openrouter.default_headers


def test_connection_errors_keep_actionable_provider_message(monkeypatch):
    request = httpx.Request("POST", "https://llm.example/v1/chat/completions")
    error = APIConnectionError(message="connection failed", request=request)
    install_fake_langchain_openai(monkeypatch, invoke_error=error)
    engine = OpenAICompatibleEngine(
        base_url="https://llm.example/v1",
        api_key="test-key",
        model_name="test-model",
    )

    with pytest.raises(RuntimeError, match="Cannot connect to LLM service"):
        engine.generate("question", "system")


def test_api_key_requirements_match_existing_provider_behavior(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)

    assert OpenAICompatibleEngine(api_key="").is_configured()
    assert not GroqEngine(api_key="").is_configured()
    assert not OpenRouterEngine(api_key="").is_configured()
