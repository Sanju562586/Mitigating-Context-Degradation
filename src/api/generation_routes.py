"""FastAPI REST routes for Module 6: Grounded LLM Inference & Anti-Hallucination Guardrails."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.context.compactor import default_context_compactor
from src.generation.generator import default_grounded_generator
from src.generation.models import GenerationRequest, GenerationResponse
from src.query_processing.models import ConversationTurn
from src.reranking.reranker import default_reranker
from src.retrieval.hybrid import default_hybrid_retriever

router = APIRouter(prefix="/api/generate", tags=["Grounded Generation & Guardrails"])


class FullQAPipelineRequest(BaseModel):
    """Payload executing the complete end-to-end question answering pipeline:

    Query -> Hybrid Retrieval -> Cross-Encoder Rerank -> Context Compaction -> Grounded Generation / Abstention.
    """

    query: str = Field(..., description="User search query string.")
    conversation_history: Optional[List[ConversationTurn]] = Field(
        default=None,
        description="Optional prior interactive conversational turns.",
    )
    filters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Optional structured metadata filters.",
    )
    top_k_fused: int = Field(
        default=20,
        ge=1,
        le=50,
        description="Candidate pool size to retrieve from Module 3 hybrid retrieval.",
    )
    rerank_threshold: float = Field(
        default=0.35,
        ge=0.0,
        le=1.0,
        description="Cutoff threshold for Module 4 cross-encoder reranking.",
    )
    rerank_top_n: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum candidates retained after Module 4 reranking.",
    )
    max_token_budget: int = Field(
        default=1500,
        ge=100,
        le=8000,
        description="Target maximum token allowance for compacted prompt context.",
    )
    sufficiency_threshold: float = Field(
        default=0.40,
        ge=0.0,
        le=1.0,
        description="Minimum sufficiency required before triggering truthful abstention.",
    )
    hallucination_threshold: float = Field(
        default=0.70,
        ge=0.0,
        le=1.0,
        description="Minimum faithfulness score required before flagging hallucination warnings.",
    )
    temperature: float = Field(
        default=0.0,
        ge=0.0,
        le=2.0,
        description="Sampling temperature for LLM generation.",
    )
    max_tokens: int = Field(
        default=1024,
        ge=64,
        le=4096,
        description="Maximum generation token allowance.",
    )
    provider: Optional[str] = Field(
        default=None,
        description="Optional LLM provider override ('offline', 'openai', 'gemini', 'ollama').",
    )


@router.post(
    "/answer",
    response_model=GenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate grounded answer or trigger truthful abstention with anti-hallucination verification",
)
def generate_grounded_answer(payload: GenerationRequest) -> GenerationResponse:
    """Evaluate context sufficiency, synthesize grounded prompt, infer answer with citations,

    and verify claim faithfulness using sentence-level NLI.
    """
    return default_grounded_generator.generate_request(payload)


@router.post(
    "/stream",
    status_code=status.HTTP_200_OK,
    summary="Stream real-time tokens and guardrail telemetry via Server-Sent Events (SSE)",
)
def stream_grounded_answer(payload: GenerationRequest) -> StreamingResponse:
    """Stream token-by-token output with sufficiency assessment and final NLI grounding report."""
    generator = default_grounded_generator.generate_stream(
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
    return StreamingResponse(generator, media_type="text/event-stream")


@router.post(
    "/pipeline/qa",
    response_model=GenerationResponse,
    status_code=status.HTTP_200_OK,
    summary="End-to-End Pipeline: Retrieval (M3) -> Reranking (M4) -> Compaction (M5) -> Generation (M6)",
)
def run_full_qa_pipeline(payload: FullQAPipelineRequest) -> GenerationResponse:
    """Execute end-to-end question answering pipeline:

    1. Hybrid Retrieval (Dense FAISS + Sparse BM25 + RRF)
    2. Cross-Encoder Reranking & Pruning
    3. Extractive Context Compaction & Lost-in-the-Middle Reordering
    4. Evidence Sufficiency Assessment & Truthful Abstention Protocol
    5. Grounded LLM Generation & Sentence-Level NLI Verification
    """
    # 1. Module 3: Hybrid Retrieval
    retrieval_res = default_hybrid_retriever.retrieve(
        query=payload.query,
        conversation_history=payload.conversation_history,
        filters=payload.filters,
        top_k_fused=payload.top_k_fused,
    )

    # 2. Module 4: Cross-Encoder Reranking & Pruning
    ranked_context = default_reranker.rerank_retrieval_response(
        response=retrieval_res,
        threshold=payload.rerank_threshold,
        top_n=payload.rerank_top_n,
    )

    # 3. Module 5: Extractive Context Compaction & Reordering
    compacted_context = default_context_compactor.compact(
        query=payload.query,
        chunks=ranked_context.chunks,
        max_token_budget=payload.max_token_budget,
    )

    # 4 & 5. Module 6: Grounded Generation & Guardrails
    return default_grounded_generator.generate(
        query=payload.query,
        context=compacted_context,
        conversation_history=payload.conversation_history,
        sufficiency_threshold=payload.sufficiency_threshold,
        hallucination_threshold=payload.hallucination_threshold,
        temperature=payload.temperature,
        max_tokens=payload.max_tokens,
        provider=payload.provider,
    )


@router.get(
    "/status",
    status_code=status.HTTP_200_OK,
    summary="Get status and configurations of the grounded generation and guardrails engine",
)
def get_generation_status() -> Dict[str, Any]:
    """Retrieve engine status, active provider, and default thresholds."""
    return {
        "status": "ready",
        "module": "Grounded LLM Inference & Anti-Hallucination Guardrails",
        "active_model": default_grounded_generator.engine.model_name,
        "default_sufficiency_threshold": default_grounded_generator.sufficiency_classifier.default_threshold,
        "default_hallucination_threshold": default_grounded_generator.verifier.default_tolerance,
        "abstention_protocol": "enabled",
        "nli_verification": "sentence-level",
    }
