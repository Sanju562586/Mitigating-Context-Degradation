"""Dense Vector Retriever using FAISS and Sentence-Transformers L2-normalized embeddings."""

from __future__ import annotations

import re
from typing import Any

from src.indexing.embeddings import EmbeddingEngine, default_embedding_engine
from src.indexing.metadata_store import MetadataStore
from src.indexing.vector_index import FaissVectorIndex


class DenseRetriever:
    """Retrieves candidates using dense semantic embeddings and FAISS Inner Product search.

    Computes cosine similarity against L2-normalized chunk vectors and applies
    structured metadata filtering when specified.
    """

    def __init__(
        self,
        vector_index: FaissVectorIndex,
        metadata_store: MetadataStore,
        embedding_engine: EmbeddingEngine | None = None,
    ) -> None:
        self.vector_index = vector_index
        self.metadata_store = metadata_store
        self.embedding_engine = embedding_engine or default_embedding_engine

    def retrieve(
        self,
        query: str,
        top_k: int = 25,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]:
        """Run dense vector search for the top_k most similar chunks.

        Args:
            query: Search query string.
            top_k: Number of candidates to retrieve.
            filters: Optional metadata filters (e.g. {'document_type': 'HR_POLICY'}).

        Returns:
            List of (chunk_id, cosine_similarity_score) ordered descending by similarity.
        """
        if not query.strip() or self.vector_index.total_vectors == 0:
            return []

        # 1. Encode query to L2-normalized dense vector
        query_vector = self.embedding_engine.embed_query(query)

        # 2. Fast path if no filters
        if not filters:
            return self.vector_index.search(query_vector, top_k=top_k)

        # 3. Dynamic oversampling to guarantee high recall with metadata filters
        oversample_k = min(max(top_k * 8, 80), self.vector_index.total_vectors)
        raw_results = self.vector_index.search(query_vector, top_k=oversample_k)

        filtered_results: list[tuple[str, float]] = []
        for chunk_id, score in raw_results:
            record = self.metadata_store.get(chunk_id)
            if record and self._matches_filters(record, filters):
                filtered_results.append((chunk_id, score))
                if len(filtered_results) >= top_k:
                    break

        # If not enough filtered candidates found, expand search to remaining vectors
        if (
            len(filtered_results) < top_k
            and oversample_k < self.vector_index.total_vectors
        ):
            full_results = self.vector_index.search(
                query_vector, top_k=self.vector_index.total_vectors
            )
            seen_ids = {cid for cid, _ in filtered_results}
            for chunk_id, score in full_results[oversample_k:]:
                if chunk_id in seen_ids:
                    continue
                record = self.metadata_store.get(chunk_id)
                if record and self._matches_filters(record, filters):
                    filtered_results.append((chunk_id, score))
                    if len(filtered_results) >= top_k:
                        break

        # Fallback: if user specified a document_id filter and no candidates passed oversampling,
        # fallback directly to the document's chunks to guarantee retrieval for the target document
        if not filtered_results and "document_id" in filters:
            doc_chunks = self.metadata_store.get_by_document(filters["document_id"])
            for record in doc_chunks[:top_k]:
                if self._matches_filters(record, filters):
                    filtered_results.append((record["chunk_id"], 0.1))

        return filtered_results

    @staticmethod
    def _matches_filters(record: dict[str, Any], filters: dict[str, Any]) -> bool:
        """Check whether a chunk metadata record satisfies all filter criteria."""
        chunk_meta = record.get("metadata", {})
        content = record.get("content", "")
        source = str(chunk_meta.get("source", ""))
        section = str(chunk_meta.get("section", ""))

        for key, target_val in filters.items():
            if target_val is None:
                continue

            val = chunk_meta.get(key)
            if val is None:
                # Fall back to root-level properties (e.g. document_id)
                val = record.get(key)

            target_str = str(target_val).strip().lower()

            # Exact or case-insensitive match
            if val is not None:
                if str(val).strip().lower() == target_str:
                    continue
                try:
                    if float(val) == float(target_val):
                        continue
                except (ValueError, TypeError):
                    pass

            # Multi-attribute fallback resolution for semantic filter dimensions
            if key == "year":
                year_pat = rf"\b{re.escape(target_str)}\b"
                if (
                    re.search(year_pat, source.lower())
                    or re.search(year_pat, content.lower())
                    or re.search(year_pat, str(chunk_meta.get("created_at", "")))
                ):
                    continue
                return False

            if key == "department":
                dept_pat = rf"\b{re.escape(target_str)}\b"
                if (
                    re.search(dept_pat, source.lower())
                    or re.search(dept_pat, section.lower())
                    or re.search(dept_pat, content.lower())
                ):
                    continue
                return False

            if key == "document_type":
                norm_doc_type = str(chunk_meta.get("document_type", "")).strip().lower()
                norm_file_type = str(record.get("file_type", "")).strip().lower()
                if (
                    target_str in norm_doc_type
                    or norm_doc_type in target_str
                    or target_str == norm_file_type
                ):
                    continue
                return False

            if val is None:
                return False

            if str(val).strip().lower() != target_str:
                return False

        return True
