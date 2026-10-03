"""End-to-End Grounded Generator orchestrating Sufficiency, Prompting, Inference, and NLI Verification."""

from __future__ import annotations

import json
import time
from typing import Iterator, List, Optional

from src.context.models import CompactedEvidence, OptimizedContext
from src.generation.engine import (
    BaseInferenceEngine,
    EngineFactory,
    default_inference_engine,
)
from src.generation.models import (
    GenerationRequest,
    GenerationResponse,
    GroundingReport,
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
        sufficiency_classifier: Optional[EvidenceSufficiencyClassifier] = None,
        prompt_synthesizer: Optional[GroundedPromptSynthesizer] = None,
        engine: Optional[BaseInferenceEngine] = None,
        verifier: Optional[AntiHallucinationVerifier] = None,
    ) -> None:
        self.sufficiency_classifier = sufficiency_classifier or default_sufficiency_classifier
        self.prompt_synthesizer = prompt_synthesizer or default_prompt_synthesizer
        self.engine = engine or default_inference_engine
        self.verifier = verifier or default_anti_hallucination_verifier

    def generate(
        self,
        query: str,
        context: Optional[OptimizedContext] = None,
        raw_evidence_chunks: Optional[List[CompactedEvidence]] = None,
        conversation_history: Optional[List[ConversationTurn]] = None,
        sufficiency_threshold: Optional[float] = None,
        hallucination_threshold: Optional[float] = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        provider: Optional[str] = None,
        memory_context: Optional[str] = None,
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
        context: Optional[OptimizedContext] = None,
        raw_evidence_chunks: Optional[List[CompactedEvidence]] = None,
        conversation_history: Optional[List[ConversationTurn]] = None,
        sufficiency_threshold: Optional[float] = None,
        hallucination_threshold: Optional[float] = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        provider: Optional[str] = None,
        memory_context: Optional[str] = None,
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
        accumulated_chunks: List[str] = []

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


default_grounded_generator = GroundedGenerator()
