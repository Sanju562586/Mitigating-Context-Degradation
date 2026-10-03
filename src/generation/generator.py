"""End-to-End Grounded Generator orchestrating Sufficiency, Prompting, Inference, and NLI Verification."""

from __future__ import annotations

import json
import time
from collections.abc import Iterator

from src.context.models import CompactedEvidence, OptimizedContext
from src.generation.engine import (
    BaseInferenceEngine,
    EngineFactory,
    OpenAICompatibleEngine,
    default_inference_engine,
)
from src.generation.models import (
    GenerationRequest,
    GenerationResponse,
    GroundingReport,
    NaiveGenerationResponse,
    SufficiencyAssessment,
)
from src.generation.prompts import GroundedPromptSynthesizer, default_prompt_synthesizer
from src.generation.sufficiency import (
    EvidenceSufficiencyClassifier,
    default_sufficiency_classifier,
)
from src.generation.verifier import (
    AntiHallucinationVerifier,
    default_anti_hallucination_verifier,
)
from src.query_processing.models import ConversationTurn


class GroundedGenerator:
    """Coordinator executing grounded LLM inference with anti-hallucination guardrails.

    Workflow:
      1. Pre-flight Evidence Sufficiency Evaluation -> If < threshold, triggers truthful Abstention Protocol.
      2. Grounded Prompt Synthesis -> Enforces mandatory bracketed citations and strict factual constraints.
      3. Inference / Token Streaming -> Provider-agnostic inference (offline, Ollama, OpenAI, Gemini).
      4. Post-generation NLI Verification -> Sentence-level verification (Entailment / Neutral / Contradiction).
    """

    def __init__(
        self,
        sufficiency_classifier: EvidenceSufficiencyClassifier | None = None,
        prompt_synthesizer: GroundedPromptSynthesizer | None = None,
        engine: BaseInferenceEngine | None = None,
        verifier: AntiHallucinationVerifier | None = None,
    ) -> None:
        self.sufficiency_classifier = sufficiency_classifier or default_sufficiency_classifier
        self.prompt_synthesizer = prompt_synthesizer or default_prompt_synthesizer
        self.engine = engine or default_inference_engine
        self.verifier = verifier or default_anti_hallucination_verifier

    def generate(
        self,
        query: str,
        context: OptimizedContext | None = None,
        raw_evidence_chunks: list[CompactedEvidence] | None = None,
        conversation_history: list[ConversationTurn] | None = None,
        sufficiency_threshold: float | None = None,
        hallucination_threshold: float | None = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        provider: str | None = None,
        memory_context: str | None = None,
    ) -> GenerationResponse:
        """Execute synchronous grounded generation with pre- and post-generation guardrails."""
        start_time = time.perf_counter()

        # Step 1: Pre-flight Evidence Sufficiency Evaluation
        sufficiency: SufficiencyAssessment = self.sufficiency_classifier.assess_sufficiency(
            query=query,
            context=context,
            evidence_items=raw_evidence_chunks,
            threshold=sufficiency_threshold,
        )

        # Truthful Abstention Protocol
        if not sufficiency.is_sufficient:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            abstention_text = sufficiency.abstention_message or (
                f"The available documents do not contain sufficient evidence to verify {sufficiency.topic}."
            )
            empty_report = GroundingReport(
                faithfulness_score=1.0,
                hallucination_detected=False,
                total_claims=0,
                entailed_claims_count=0,
                neutral_claims_count=0,
                contradicted_claims_count=0,
                claims=[],
                verified_citations=[],
                unverified_citations=[],
            )
            return GenerationResponse(
                query=query,
                answer=abstention_text,
                abstained=True,
                abstention_reason=sufficiency.reasoning,
                sufficiency=sufficiency,
                grounding_report=empty_report,
                citations=[],
                latency_ms=latency_ms,
                model_name=self.engine.model_name,
            )

        # Step 2: Grounded Prompt Synthesis
        prompt = self.prompt_synthesizer.synthesize_prompt(
            query=query,
            context=context,
            evidence_items=raw_evidence_chunks,
            conversation_history=conversation_history,
            memory_context=memory_context,
        )

        # Step 3: LLM Inference
        engine = EngineFactory.create_engine(provider) if provider else self.engine
        raw_answer = engine.generate(
            prompt=prompt,
            system_prompt=self.prompt_synthesizer.system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        # Step 4: Post-generation Anti-Hallucination Verification
        grounding_report = self.verifier.verify_answer(
            answer=raw_answer,
            context=context,
            evidence_items=raw_evidence_chunks,
            tolerance=hallucination_threshold,
        )

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        citations = self.verifier.extract_citations(raw_answer)

        return GenerationResponse(
            query=query,
            answer=raw_answer,
            abstained=False,
            abstention_reason=None,
            sufficiency=sufficiency,
            grounding_report=grounding_report,
            citations=citations,
            latency_ms=latency_ms,
            model_name=engine.model_name,
        )

    def generate_request(self, payload: GenerationRequest) -> GenerationResponse:
        """Generate response from structured GenerationRequest payload."""
        return self.generate(
            query=payload.query,
            context=payload.context,
            raw_evidence_chunks=payload.raw_evidence_chunks,
            conversation_history=payload.conversation_history,
            sufficiency_threshold=payload.sufficiency_threshold,
            hallucination_threshold=payload.hallucination_threshold,
            temperature=payload.temperature,
            max_tokens=payload.max_tokens,
            provider=payload.provider,
        )

    def generate_stream(
        self,
        query: str,
        context: OptimizedContext | None = None,
        raw_evidence_chunks: list[CompactedEvidence] | None = None,
        conversation_history: list[ConversationTurn] | None = None,
        sufficiency_threshold: float | None = None,
        hallucination_threshold: float | None = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        provider: str | None = None,
        memory_context: str | None = None,
    ) -> Iterator[str]:
        """Stream real-time tokens and guardrail telemetry via Server-Sent Events (SSE)."""
        start_time = time.perf_counter()

        # 1. Pre-flight Sufficiency Assessment
        sufficiency = self.sufficiency_classifier.assess_sufficiency(
            query=query,
            context=context,
            evidence_items=raw_evidence_chunks,
            threshold=sufficiency_threshold,
        )

        yield f"event: sufficiency\ndata: {json.dumps(sufficiency.model_dump())}\n\n"

        # Truthful Abstention Protocol
        if not sufficiency.is_sufficient:
            abstention_text = sufficiency.abstention_message or (
                f"The available documents do not contain sufficient evidence to verify {sufficiency.topic}."
            )
            yield f"event: abstention\ndata: {json.dumps({'answer': abstention_text, 'reason': sufficiency.reasoning})}\n\n"
            yield f"event: done\ndata: {json.dumps({'abstained': True, 'latency_ms': round((time.perf_counter() - start_time) * 1000, 2)})}\n\n"
            return

        # 2. Prompt Synthesis
        prompt = self.prompt_synthesizer.synthesize_prompt(
            query=query,
            context=context,
            evidence_items=raw_evidence_chunks,
            conversation_history=conversation_history,
            memory_context=memory_context,
        )

        # 3. Token Streaming
        engine = EngineFactory.create_engine(provider) if provider else self.engine
        accumulated_chunks: list[str] = []

        yield f"event: start\ndata: {json.dumps({'model': engine.model_name})}\n\n"

        for token in engine.generate_stream(
            prompt=prompt,
            system_prompt=self.prompt_synthesizer.system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            accumulated_chunks.append(token)
            yield f"event: token\ndata: {json.dumps({'token': token})}\n\n"

        full_answer = "".join(accumulated_chunks)

        # 4. Post-generation NLI Verification
        grounding_report = self.verifier.verify_answer(
            answer=full_answer,
            context=context,
            evidence_items=raw_evidence_chunks,
            tolerance=hallucination_threshold,
        )

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        citations = self.verifier.extract_citations(full_answer)

        yield f"event: grounding\ndata: {json.dumps(grounding_report.model_dump())}\n\n"
        yield f"event: done\ndata: {json.dumps({'abstained': False, 'citations': citations, 'latency_ms': latency_ms})}\n\n"

    def generate_naive(
        self,
        query: str,
        provider: str | None = None,
    ) -> NaiveGenerationResponse:
        """Generate response from a naive/baseline LLM without retrieval, context compaction, or NLI guardrails."""
        start_time = time.perf_counter()
        engine = EngineFactory.create_engine(provider) if provider else self.engine

        if isinstance(engine, OpenAICompatibleEngine):
            system_prompt = (
                "You are an AI assistant. Answer the user's question directly based on your pre-trained knowledge. "
                "Do not cite any external documents."
            )
            raw_answer = engine.generate(
                prompt=f"User query: {query}",
                system_prompt=system_prompt,
                temperature=0.7,
                max_tokens=512,
            )
        else:
            # Offline naive baseline simulation:
            # Generates a plausible ungrounded response based on general domain knowledge,
            # contrasting with the specific facts and citations extracted from the uploaded document.
            raw_answer = self._generate_offline_naive(query)

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return NaiveGenerationResponse(
            query=query,
            answer=raw_answer,
            has_citations=False,
            citations=[],
            faithfulness_score=0.25,
            hallucination_risk="High (Unverified / No Evidence Anchors)",
            latency_ms=latency_ms,
            model_name=f"{engine.model_name} (Naive Baseline)",
        )

    def _generate_offline_naive(self, query: str) -> str:
        """Synthesize plausible ungrounded naive response demonstrating baseline behavior."""
        q_lower = query.lower()
        if "firewall" in q_lower or "security" in q_lower:
            return (
                "A standard firewall typically acts as a perimeter filter inspecting network packets, "
                "monitoring IP ports, and blocking unauthorized traffic based on predefined firewall rules. "
                "Common configurations include stateful inspection, proxy servers, and packet-filtering gateways. "
                "However, without access to specific proprietary document instructions, exact internal parameters, "
                "or custom architectural modules, standard implementations rely on general cybersecurity best practices."
            )
        elif "module" in q_lower or "architecture" in q_lower:
            return (
                "Software architectures for modern systems typically feature a modular design divided into "
                "an API layer, user authentication, a core business logic engine, a database layer, and a logging subsystem. "
                "Depending on the framework, these modules may communicate asynchronously via message queues or REST protocols. "
                "Note that without referencing the specific uploaded document, exact module names and implementation specifics cannot be verified."
            )
        elif "policy" in q_lower or "rule" in q_lower or "vacation" in q_lower or "refund" in q_lower:
            return (
                "Standard organizational policies usually provide guidelines for eligibility, request procedures, "
                "and approval workflows. Employees or customers typically submit requests through a central portal, "
                "and requests are processed according to tenure or product condition within 14 to 30 days. "
                "Please consult internal company documentation for exact figures and formal terms, as these vary by organization."
            )
        else:
            return (
                f"Regarding '{query}', standard AI models typically formulate a general response derived from broad web training data. "
                "Without an evidence retrieval pipeline to inject ground-truth document excerpts, this response cannot cite exact page numbers, "
                "chunk identifiers, or verify whether these claims accurately match your uploaded documents."
            )


default_grounded_generator = GroundedGenerator()
