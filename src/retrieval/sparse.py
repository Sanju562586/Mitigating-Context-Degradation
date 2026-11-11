"""Sparse Lexical Retriever using BM25+ inverted index."""

from __future__ import annotations

import re
from typing import Any

from src.indexing.bm25_index import BM25Index
from src.indexing.metadata_store import MetadataStore


class SparseRetriever:
    """Retrieves candidates using BM25 lexical token matching.

    Ensures exact keywords, terms, acronyms, and product codes are found even when
    semantic embeddings dilute specific terminology.
    """

    def __init__(
        self,
        bm25_index: BM25Index,
        metadata_store: MetadataStore,
    ) -> None:
        self.bm25_index = bm25_index
        self.metadata_store = metadata_store

    def retrieve(
        self,
        query: str,
        top_k: int = 25,
        filters: dict[str, Any] | None = None,
    ) -> list[tuple[str, float]]:
        """Run sparse BM25 search for the top_k most relevant chunks.

        Args:
            query: Keyword query string.
            top_k: Number of candidates to retrieve.
            filters: Optional metadata filters.

        Returns:
            List of (chunk_id, bm25_score) ordered descending by lexical relevance.
        """
        if not query.strip() or self.bm25_index.total_documents == 0:
            return []

        if not filters:
            return self.bm25_index.search(query, top_k=top_k)

        oversample_k = min(max(top_k * 8, 80), self.bm25_index.total_documents)
        raw_results = self.bm25_index.search(query, top_k=oversample_k)

        filtered_results: list[tuple[str, float]] = []
        for chunk_id, score in raw_results:
            record = self.metadata_store.get(chunk_id)
            if record and self._matches_filters(record, filters):
                filtered_results.append((chunk_id, score))
                if len(filtered_results) >= top_k:
                    break

        # Expand if not enough filtered candidates found
        if (
            len(filtered_results) < top_k
            and oversample_k < self.bm25_index.total_documents
        ):
            full_results = self.bm25_index.search(
                query, top_k=self.bm25_index.total_documents
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
                val = record.get(key)

            target_str = str(target_val).strip().lower()

            # Exact or string match
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
