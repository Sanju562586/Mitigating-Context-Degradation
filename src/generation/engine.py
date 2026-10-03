"""Inference & Token Streaming Engines supporting offline, local (Ollama/vLLM), and API providers."""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from collections.abc import Iterator


class BaseInferenceEngine(ABC):
    """Abstract base class for LLM inference providers."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name or identifier of the underlying model."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        """Synchronously generate a complete completion string."""

    @abstractmethod
    def generate_stream(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> Iterator[str]:
        """Stream token-by-token completion chunks."""


class OfflineGroundedEngine(BaseInferenceEngine):
    """High-fidelity, deterministic offline engine for grounded synthesis and testing.

    Operates hermetically without external network access, API keys, or GPU dependencies.
    Extracts the most salient factual propositions directly from the provided evidence context
    and injects verified bracketed citations.
    """

    def __init__(self, model_name: str = "offline-grounded-synthesizer") -> None:
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    def _extract_evidence_passages(self, prompt: str) -> list[tuple[str, str]]:
        """Parse (citation_tag, passage_text) from prompt evidence block."""
        passages: list[tuple[str, str]] = []
        # Match patterns like: --- EVIDENCE [Doc 1, Chunk 0] --- or [Doc 1, Chunk 0]
        pattern = r"(?:---\s*EVIDENCE\s*)?(\[Doc\s+[^\]]+\])(?:\s*\(Source:[^)]*\)\s*---)?\s*\n(.*?)(?=(?:---\s*EVIDENCE\s*\[Doc|USER QUERY:|$))"
        matches = re.findall(pattern, prompt, re.DOTALL)
        for tag, text in matches:
            cleaned = text.strip()
            if cleaned:
                passages.append((tag.strip(), cleaned))

        if not passages:
            # Fallback for plain blocks with tags inside
            lines = prompt.splitlines()
            cur_tag = "[Doc 1, Chunk 0]"
            cur_buf = []
            for line in lines:
                tag_match = re.search(r"(\[Doc\s+[^\]]+\])", line)
                if tag_match:
                    if cur_buf:
                        passages.append((cur_tag, "\n".join(cur_buf).strip()))
                        cur_buf = []
                    cur_tag = tag_match.group(1)
                elif "USER QUERY:" in line:
                    break
                else:
                    cur_buf.append(line)
            if cur_buf:
                passages.append((cur_tag, "\n".join(cur_buf).strip()))

        return passages

    def _extract_query(self, prompt: str) -> str:
        """Extract the query string from the prompt."""
        m = re.search(r"USER QUERY:\s*\n(.*?)(?=\n\nGROUNDED ANSWER|$)", prompt, re.DOTALL)
        return m.group(1).strip() if m else ""

    def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        """Synthesize a grounded answer with citations from the prompt context."""
        query = self._extract_query(prompt)
        passages = self._extract_evidence_passages(prompt)

        if not passages:
            return "No evidence passages were available to answer this inquiry."

        query_words = set(re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", query.lower()))
        # Filter stopwords
        from src.generation.sufficiency import _STOP_WORDS
        content_words = {w for w in query_words if w not in _STOP_WORDS}

        scored_sentences: list[tuple[float, str, str]] = []
        for tag, passage in passages:
            # Split into individual sentences
            sentences = re.split(r"(?<=[.!?])\s+", passage)
            for s in sentences:
                s_clean = s.strip()
                if not s_clean or len(s_clean) < 15:
                    continue
                s_words = set(re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", s_clean.lower()))
                overlap = len(content_words & s_words)
                score = overlap / (len(content_words) + 1e-5)
                scored_sentences.append((score, s_clean, tag))

        # Sort by relevance score descending
        scored_sentences.sort(key=lambda x: x[0], reverse=True)

        if not scored_sentences or scored_sentences[0][0] <= 0:
            # If no direct term overlap, use the first high-salience sentence
            top_sentences = scored_sentences[:2] if scored_sentences else []
        else:
            # Take top 2-3 most relevant unique sentences
            top_sentences = []
            seen = set()
            for score, sent, tag in scored_sentences:
                normalized = sent.lower()[:30]
                if normalized not in seen and score > 0:
                    seen.add(normalized)
                    top_sentences.append((score, sent, tag))
                if len(top_sentences) >= 3:
                    break

        if not top_sentences:
            return "The retrieved context does not contain sufficient details to address the query."

        # Format answer statements with citation tags
        answer_parts = []
        for _, sent, tag in top_sentences:
            sent_trimmed = sent.rstrip(". ")
            answer_parts.append(f"{sent_trimmed} {tag}.")

        return " ".join(answer_parts)

    def generate_stream(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> Iterator[str]:
        """Stream generated text as word/token chunks."""
        full_text = self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        tokens = re.findall(r"\S+\s*", full_text)
        yield from tokens


class OpenAICompatibleEngine(BaseInferenceEngine):
    """Client for OpenAI-compatible APIs (OpenAI, Ollama, vLLM, LMStudio, LocalAI)."""

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model_name: str | None = None,
    ) -> None:
        self.base_url = (
            base_url or os.getenv("OPENAI_BASE_URL") or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        ).rstrip("/")
        self.api_key = api_key or os.getenv("OPENAI_API_KEY", "dummy-key")
        self._model_name = model_name or os.getenv("OPENAI_MODEL_NAME", "llama3.2")

    @property
    def model_name(self) -> str:
        return self._model_name

    def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        """Call standard OpenAI chat completions endpoint."""
        import httpx

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }

        with httpx.Client(timeout=60.0) as client:
            resp = client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    def generate_stream(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> Iterator[str]:
        """Stream tokens via Server-Sent Events from OpenAI-compatible endpoint."""
        import json

        import httpx

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }

        with httpx.Client(timeout=60.0) as client:
            with client.stream(
                "POST", f"{self.base_url}/chat/completions", headers=headers, json=payload
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        data_str = line[len("data: ") :].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            continue


class AnthropicEngine(BaseInferenceEngine):
    """Client for Anthropic Claude inference API (LLM Provider Layer: Claude)."""

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self._model_name = model_name or os.getenv("ANTHROPIC_MODEL_NAME", "claude-3-5-sonnet-20241022")

    @property
    def model_name(self) -> str:
        return self._model_name

    def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key:
            return OfflineGroundedEngine(model_name=f"{self._model_name}-offline").generate(
                prompt=prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens
            )
        import httpx

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model_name,
            "system": system_prompt,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"]

    def generate_stream(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> Iterator[str]:
        full_text = self.generate(
            prompt=prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens
        )
        tokens = re.findall(r"\S+\s*", full_text)
        yield from tokens


class GeminiEngine(BaseInferenceEngine):
    """Client for Google Gemini inference API (LLM Provider Layer: Gemini)."""

    def __init__(
        self,
        api_key: str | None = None,
        model_name: str | None = None,
    ) -> None:
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", "")
        self._model_name = model_name or os.getenv("GEMINI_MODEL_NAME", "gemini-1.5-flash")

    @property
    def model_name(self) -> str:
        return self._model_name

    def generate(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        if not self.api_key:
            return OfflineGroundedEngine(model_name=f"{self._model_name}-offline").generate(
                prompt=prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens
            )
        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model_name}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        with httpx.Client(timeout=60.0) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    def generate_stream(
        self,
        prompt: str,
        system_prompt: str,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> Iterator[str]:
        full_text = self.generate(
            prompt=prompt, system_prompt=system_prompt, temperature=temperature, max_tokens=max_tokens
        )
        tokens = re.findall(r"\S+\s*", full_text)
        yield from tokens


class EngineFactory:
    """Factory creating appropriate inference engine matching LLM Provider Layer (Ollama, ChatGPT, Claude, Gemini)."""

    @staticmethod
    def create_engine(provider: str | None = None) -> BaseInferenceEngine:
        selected = (provider or os.getenv("LLM_PROVIDER", "offline")).lower()
        if selected in ("ollama",):
            return OpenAICompatibleEngine(
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
                model_name=os.getenv("OLLAMA_MODEL_NAME", "llama3.2"),
            )
        if selected in ("chatgpt", "openai", "vllm"):
            return OpenAICompatibleEngine()
        if selected in ("claude", "anthropic"):
            return AnthropicEngine()
        if selected in ("gemini", "google"):
            return GeminiEngine()
        return OfflineGroundedEngine()


default_inference_engine = OfflineGroundedEngine()
