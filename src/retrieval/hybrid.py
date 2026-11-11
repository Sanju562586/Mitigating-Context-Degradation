"""Hybrid Retrieval Coordinator integrating Query Processing, Dense FAISS, Sparse BM25, and RRF."""

from __future__ import annotations

import concurrent.futures
import json
import re
import time
from typing import Any

import numpy as np

from src.cache import LruTtlCache
from src.indexing.manager import IndexManager, default_index_manager
from src.query_processing.models import ConversationTurn, QueryIntent
from src.query_processing.pipeline import QueryProcessor, default_query_processor
from src.retrieval.dense import DenseRetriever
from src.retrieval.models import (
    RetrievalRequest,
    RetrievalResponse,
    RetrievedCandidate,
)
from src.retrieval.rrf import RRFEngine
from src.retrieval.sparse import SparseRetriever


class HybridRetriever:
    """End-to-end coordinator for Module 3 Hybrid Retrieval & Reciprocal Rank Fusion.

    Execution Pipeline:
      1. Pre-Flight Query Understanding (Conversational rewriting, Intent, Filter extraction)
      2. Parallel / Synchronous Dense Retrieval (FAISS Inner Product + Cosine)
      3. Parallel / Synchronous Sparse Retrieval (BM25+ keyword matching)
      4. Reciprocal Rank Fusion (RRF with smoothing constant k)
      5. Enriched candidate ranking with full metadata hydration
    """

    def __init__(
        self,
        index_manager: IndexManager | None = None,
        query_processor: QueryProcessor | None = None,
        dense_retriever: DenseRetriever | None = None,
        sparse_retriever: SparseRetriever | None = None,
        rrf_engine: RRFEngine | None = None,
    ) -> None:
        self.index_manager = index_manager or default_index_manager
        self.query_processor = query_processor or default_query_processor

        self.dense_retriever = dense_retriever or DenseRetriever(
            vector_index=self.index_manager.vector_index,
            metadata_store=self.index_manager.metadata_store,
            embedding_engine=self.index_manager.embedding_engine,
        )

        self.sparse_retriever = sparse_retriever or SparseRetriever(
            bm25_index=self.index_manager.bm25_index,
            metadata_store=self.index_manager.metadata_store,
        )

        self.rrf_engine = rrf_engine or RRFEngine(
            metadata_store=self.index_manager.metadata_store
        )
        self.result_cache: LruTtlCache[str, RetrievalResponse] = LruTtlCache(
            max_size=2048, ttl_seconds=90
        )
        # Bounded semantic query cache for near-instant paraphrased query hits (cos sim >= 0.96)
        self._semantic_cache: list[dict[str, Any]] = []

    def retrieve(
        self,
        query: str,
        conversation_history: list[ConversationTurn] | None = None,
        filters: dict[str, Any] | None = None,
        top_k_dense: int = 50,
        top_k_sparse: int = 50,
        top_k_fused: int = 50,
        rrf_k: int = 60,
    ) -> RetrievalResponse:
        """Execute complete hybrid retrieval with pre-flight query processing and RRF fusion.

        Args:
            query: Raw user query string.
            conversation_history: Optional list of previous chat turns for pronoun resolution.
            filters: Optional structured metadata filters.
            top_k_dense: Candidate count from dense FAISS search.
            top_k_sparse: Candidate count from sparse BM25 search.
            top_k_fused: Top candidate count to return after fusion.
            rrf_k: Smoothing constant k for RRF (default 60).

        Returns:
            RetrievalResponse with fused candidates and execution telemetry.
        """
        start_time = time.perf_counter()

        # Clean empty query handling
        if not query or not query.strip():
            elapsed_ms = (time.perf_counter() - start_time) * 1000.0
            return RetrievalResponse(
                query=query,
                processed_query=self.query_processor.process(""),
                candidates=[],
                total_candidates=0,
                dense_count=0,
                sparse_count=0,
                execution_time_ms=round(elapsed_ms, 2),
            )

        history_key = [
            turn.model_dump(mode="json") for turn in (conversation_history or [])
        ]
        cache_payload = {
            "query": " ".join(query.split()).casefold(),
            "history": history_key,
            "filters": filters or {},
            "top_k_dense": top_k_dense,
            "top_k_sparse": top_k_sparse,
            "top_k_fused": top_k_fused,
            "rrf_k": rrf_k,
            "index_revision": self.index_manager.revision,
        }
        cache_key = json.dumps(cache_payload, sort_keys=True, default=str)
        cached_response = self.result_cache.get(cache_key)
        if cached_response is not None:
            cached_response = cached_response.model_copy(deep=True)
            cached_response.execution_time_ms = round(
                (time.perf_counter() - start_time) * 1000, 2
            )
            return cached_response

        # Fast Semantic Query Cache Check for single-turn standalone queries (similarity >= 0.96)
        query_vec: np.ndarray | None = None
        if not conversation_history and self._semantic_cache:
            try:
                query_vec = self.dense_retriever.embedding_engine.embed_query(query)
                norm_q = np.linalg.norm(query_vec)
                if norm_q > 0:
                    for entry in reversed(self._semantic_cache):
                        if (
                            entry["revision"] == self.index_manager.revision
                            and entry["filters"] == (filters or {})
                            and entry["top_k_fused"] >= top_k_fused
                        ):
                            sim = float(np.dot(query_vec, entry["vec"]))
                            if sim >= 0.96:
                                hit = entry["response"].model_copy(deep=True)
                                hit.execution_time_ms = round(
                                    (time.perf_counter() - start_time) * 1000, 2
                                )
                                return hit
            except Exception:
                pass

        # Stage 1: Query Processing Pre-Flight
        processed_query = self.query_processor.process(
            query=query,
            conversation_history=conversation_history,
        )

        # Merge extracted metadata filters with explicit user filters (explicit overrides)
        combined_filters: dict[str, Any] = {}
        if processed_query.filters:
            combined_filters.update(processed_query.filters)
        if filters:
            combined_filters.update(filters)

        search_query = processed_query.query or query

        # Stage 2 & 3: Parallel Execution of Dense (Semantic) and Sparse (BM25) Retrieval
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            future_dense = executor.submit(
                self.dense_retriever.retrieve,
                query=search_query,
                top_k=top_k_dense,
                filters=combined_filters or None,
            )
            future_sparse = executor.submit(
                self.sparse_retriever.retrieve,
                query=search_query,
                top_k=top_k_sparse,
                filters=combined_filters or None,
            )
            dense_results = future_dense.result()
            sparse_results = future_sparse.result()

        # Adaptive filter relaxation: If auto-extracted filters produced 0 candidates,
        # fallback to explicit user filters (or None) and search concurrently with rewritten query
        if (
            not dense_results
            and not sparse_results
            and processed_query.filters
            and combined_filters != (filters or {})
        ):
            fallback_query = processed_query.rewritten_query or query
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                f_dense = executor.submit(
                    self.dense_retriever.retrieve,
                    query=fallback_query,
                    top_k=top_k_dense,
                    filters=filters,
                )
                f_sparse = executor.submit(
                    self.sparse_retriever.retrieve,
                    query=fallback_query,
                    top_k=top_k_sparse,
                    filters=filters,
                )
                dense_results = f_dense.result()
                sparse_results = f_sparse.result()

        # Dynamic intent-aware RRF weights
        dense_weight = 1.0
        sparse_weight = 1.0
        if (
            processed_query.intent in (QueryIntent.FACTUAL, QueryIntent.KEYWORD_LOOKUP)
            or re.search(r"\b\d{4}\b|[A-Z0-9_-]{4,}", search_query)
        ):
            # Keyword / code / date factoids benefit from BM25 lexical precision
            sparse_weight = 1.2
            dense_weight = 0.8
        elif processed_query.intent == QueryIntent.SUMMARY:
            # Broad thematic questions benefit from dense semantic vector matching
            dense_weight = 1.2
            sparse_weight = 0.8

        # Stage 4: Reciprocal Rank Fusion (RRF) with Intent Weighting
        candidates: list[RetrievedCandidate] = self.rrf_engine.fuse(
            dense_results=dense_results,
            sparse_results=sparse_results,
            top_k=top_k_fused,
            rrf_k=rrf_k,
            dense_weight=dense_weight,
            sparse_weight=sparse_weight,
            metadata_store=self.index_manager.metadata_store,
        )

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        response = RetrievalResponse(
            query=query,
            processed_query=processed_query,
            candidates=candidates,
            total_candidates=len(candidates),
            dense_count=len(dense_results),
            sparse_count=len(sparse_results),
            execution_time_ms=round(elapsed_ms, 2),
        )
        self.result_cache.set(cache_key, response.model_copy(deep=True))

        # Store in Semantic Query Cache (max 256 entries)
        if not conversation_history:
            try:
                if query_vec is None:
                    query_vec = self.dense_retriever.embedding_engine.embed_query(query)
                if len(self._semantic_cache) >= 256:
                    self._semantic_cache.pop(0)
                self._semantic_cache.append(
                    {
                        "vec": query_vec,
                        "query": query,
                        "response": response.model_copy(deep=True),
                        "revision": self.index_manager.revision,
                        "filters": filters or {},
                        "top_k_fused": top_k_fused,
                    }
                )
            except Exception:
                pass

        return response

    def retrieve_request(self, request: RetrievalRequest) -> RetrievalResponse:
        """Helper to invoke retrieve using a structured RetrievalRequest model."""
        return self.retrieve(
            query=request.query,
            conversation_history=request.conversation_history,
            filters=request.filters,
            top_k_dense=request.top_k_dense,
            top_k_sparse=request.top_k_sparse,
            top_k_fused=request.top_k_fused,
            rrf_k=request.rrf_k,
        )


default_hybrid_retriever = HybridRetriever()
