"""Semantic chunking engine with boundary awareness, embedding-based semantic breakpoints, and 50 tokens overlap."""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

from src.chunking.metadata import MetadataTagger
from src.chunking.tokenizer import count_tokens, get_trailing_token_overlap
from src.ingestion.models import DocumentChunk, DocumentElement

_PROTECTED_ABBREVIATIONS = (
    "e.g.",
    "i.e.",
    "Dr.",
    "Mr.",
    "Mrs.",
    "Ms.",
    "Prof.",
    "Inc.",
    "Ltd.",
    "vs.",
    "Fig.",
    "etc.",
)

_COMMON_STOP_WORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "in",
    "on",
    "at",
    "to",
    "for",
    "with",
    "about",
    "by",
    "of",
    "from",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "that",
    "this",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "we",
    "our",
}


class SemanticChunker:
    """Chunks documents along semantic boundaries using semantic similarity and breakpoint detection,

    while maintaining exact or tailored token overlap (default: 50 tokens) between consecutive chunks
    to mitigate context degradation at chunk seams.
    """

    def __init__(
        self,
        target_tokens: int = 350,
        overlap_tokens: int = 50,
        min_tokens: int | None = None,
        similarity_threshold: float = 0.05,
        embedding_engine: Any | None = None,
        use_embeddings: bool = True,
    ) -> None:
        self.target_tokens = target_tokens
        self.overlap_tokens = overlap_tokens
        self.min_tokens = (
            min_tokens
            if min_tokens is not None
            else min(40, max(10, target_tokens // 2))
        )
        self.similarity_threshold = similarity_threshold
        self._embedding_engine = embedding_engine
        self.use_embeddings = use_embeddings

    def _get_embedding_engine(self) -> Any | None:
        if self._embedding_engine is not None:
            return self._embedding_engine
        if self.use_embeddings:
            try:
                from src.indexing.embeddings import default_embedding_engine

                self._embedding_engine = default_embedding_engine
            except Exception:
                self._embedding_engine = None
        return self._embedding_engine

    def compute_sentence_similarity(self, s1: str, s2: str) -> float:
        """Compute semantic similarity between two sentences in [0.0, 1.0].

        Uses neural sentence embeddings when an embedding engine is available/configured,
        or high-performance lexical-semantic term vector cosine similarity as fallback.
        """
        if not s1.strip() or not s2.strip():
            return 0.0

        engine = self._get_embedding_engine()
        if engine is not None:
            try:
                import numpy as np

                vecs = engine.embed_texts([s1, s2])
                sim = float(np.dot(vecs[0], vecs[1]))
                return max(0.0, min(1.0, sim))
            except Exception:
                pass

        # Fast lexical-semantic cosine similarity with stop-word filtering & stemming
        def _stem(w: str) -> str:
            for suf in (
                "ing",
                "tion",
                "ment",
                "able",
                "ness",
                "ity",
                "ed",
                "ly",
                "es",
                "s",
            ):
                if w.endswith(suf) and len(w) > len(suf) + 3:
                    return w[: -len(suf)]
            return w

        def _to_term_vector(text: str) -> Counter[str]:
            raw_tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
            meaningful = [
                _stem(tok)
                for tok in raw_tokens
                if len(tok) > 1 and tok not in _COMMON_STOP_WORDS
            ]
            return Counter(meaningful)

        v1 = _to_term_vector(s1)
        v2 = _to_term_vector(s2)
        if not v1 or not v2:
            return 0.0

        common_keys = set(v1.keys()) & set(v2.keys())
        if not common_keys:
            return 0.0

        dot_product = sum(v1[k] * v2[k] for k in common_keys)
        norm1 = math.sqrt(sum(v**2 for v in v1.values()))
        norm2 = math.sqrt(sum(v**2 for v in v2.values()))
        if norm1 == 0 or norm2 == 0:
            return 0.0

        return max(0.0, min(1.0, dot_product / (norm1 * norm2)))

    def chunk_elements(
        self,
        doc_id: str,
        elements: list[DocumentElement],
        source_name: str = "document.txt",
        document_type: str | None = None,
        raw_text: str | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> list[DocumentChunk]:
        """Convert a list of cleaned DocumentElements into semantic DocumentChunks."""
        if not elements:
            if not raw_text or not raw_text.strip():
                return []
            return self._chunk_plain_text(
                doc_id=doc_id,
                text=raw_text,
                source_name=source_name,
                document_type=document_type,
                extra_metadata=extra_metadata,
            )

        # Detect or infer document_type if not provided
        sample_text = " ".join(el.content[:200] for el in elements[:5])
        inferred_type = MetadataTagger.infer_document_type(
            source_name=source_name,
            text_sample=sample_text,
            explicit_type=document_type,
        )

        chunks: list[DocumentChunk] = []
        current_texts: list[str] = []
        current_pages: set[int] = set()
        current_sections: set[str] = set()
        current_token_count = 0
        seq_num = 1
        previous_overlap_text = ""
        current_section_title = "General"
        last_sentence: str | None = None

        for el in elements:
            text = el.content.strip()
            if not text:
                continue

            el_page = el.page_number
            el_section = el.section_title
            is_heading = el.element_type == "heading" or text.startswith("#")
            if not el_section and is_heading:
                el_section = text.lstrip("#").strip()

            # Hard structural semantic boundary on new heading
            if is_heading:
                heading_title = text.lstrip("#").strip()
                if current_token_count >= self.min_tokens:
                    chunk = self._finalize_chunk(
                        doc_id=doc_id,
                        source_name=source_name,
                        inferred_type=inferred_type,
                        texts=current_texts,
                        pages=current_pages,
                        sections=current_sections,
                        section_title=current_section_title,
                        seq_num=seq_num,
                        overlap_tokens_count=count_tokens(previous_overlap_text),
                        extra_metadata=extra_metadata,
                    )
                    chunks.append(chunk)
                    seq_num += 1

                    previous_overlap_text = get_trailing_token_overlap(
                        chunk.content, self.overlap_tokens
                    )
                    current_texts = (
                        [previous_overlap_text] if previous_overlap_text else []
                    )
                    current_token_count = count_tokens("\n\n".join(current_texts))
                    current_pages = set()
                    current_sections = {heading_title}

                current_section_title = heading_title
                current_sections.add(heading_title)
                heading_line = (
                    f"## {heading_title}" if not text.startswith("#") else text
                )
                current_texts.append(heading_line)
                current_token_count += count_tokens(heading_line)
                if el_page is not None:
                    current_pages.add(el_page)
                last_sentence = heading_title
                continue

            # Atomic elements (tables, code blocks)
            if el.element_type in ("table", "code"):
                el_tokens = count_tokens(text)
                if current_token_count > 0 and (
                    current_token_count + el_tokens > self.target_tokens
                ):
                    chunk = self._finalize_chunk(
                        doc_id=doc_id,
                        source_name=source_name,
                        inferred_type=inferred_type,
                        texts=current_texts,
                        pages=current_pages,
                        sections=current_sections,
                        section_title=current_section_title,
                        seq_num=seq_num,
                        overlap_tokens_count=count_tokens(previous_overlap_text),
                        extra_metadata=extra_metadata,
                    )
                    chunks.append(chunk)
                    seq_num += 1

                    previous_overlap_text = get_trailing_token_overlap(
                        chunk.content, self.overlap_tokens
                    )
                    current_texts = (
                        [previous_overlap_text, text]
                        if previous_overlap_text
                        else [text]
                    )
                    current_token_count = count_tokens("\n\n".join(current_texts))
                    current_pages = {el_page} if el_page is not None else set()
                    current_sections = (
                        {el_section}
                        if el_section
                        else (
                            {current_section_title} if current_section_title else set()
                        )
                    )
                else:
                    current_texts.append(text)
                    current_token_count += el_tokens
                    if el_page is not None:
                        current_pages.add(el_page)
                    if el_section:
                        current_sections.add(el_section)
                        current_section_title = el_section
                last_sentence = None
                continue

            # Paragraph element: split into sentences for semantic breakpoint analysis
            sub_sentences = self._split_into_sentences(text)
            for sentence in sub_sentences:
                s_tokens = count_tokens(sentence)

                # Check semantic breakpoint if we have accumulated enough tokens
                semantic_break = False
                if last_sentence is not None and current_token_count >= self.min_tokens:
                    is_structure = bool(
                        re.search(
                            r"^(?:Module\s+Schedule|Schedule|Modules|Topics|Overview|Agenda|•|-|\*|\d+[\.\)])",
                            sentence.strip(),
                            re.IGNORECASE,
                        )
                    )
                    if not is_structure:
                        sim = self.compute_sentence_similarity(last_sentence, sentence)
                        if sim < self.similarity_threshold:
                            semantic_break = True

                size_overflow = current_token_count > 0 and (
                    current_token_count + s_tokens > self.target_tokens
                )

                if semantic_break or size_overflow:
                    chunk = self._finalize_chunk(
                        doc_id=doc_id,
                        source_name=source_name,
                        inferred_type=inferred_type,
                        texts=current_texts,
                        pages=current_pages,
                        sections=current_sections,
                        section_title=current_section_title,
                        seq_num=seq_num,
                        overlap_tokens_count=count_tokens(previous_overlap_text),
                        extra_metadata=extra_metadata,
                    )
                    chunks.append(chunk)
                    seq_num += 1

                    # Generate overlap tokens for seam mitigation
                    previous_overlap_text = get_trailing_token_overlap(
                        chunk.content, self.overlap_tokens
                    )
                    current_texts = (
                        [previous_overlap_text, sentence]
                        if previous_overlap_text
                        else [sentence]
                    )
                    current_token_count = count_tokens("\n\n".join(current_texts))
                    current_pages = {el_page} if el_page is not None else set()
                    current_sections = (
                        {el_section}
                        if el_section
                        else (
                            {current_section_title} if current_section_title else set()
                        )
                    )
                    if el_section:
                        current_section_title = el_section
                else:
                    current_texts.append(sentence)
                    current_token_count += s_tokens
                    if el_page is not None:
                        current_pages.add(el_page)
                    if el_section:
                        current_sections.add(el_section)
                        current_section_title = el_section

                last_sentence = sentence

        # Flush final remaining accumulator
        if current_texts:
            chunk = self._finalize_chunk(
                doc_id=doc_id,
                source_name=source_name,
                inferred_type=inferred_type,
                texts=current_texts,
                pages=current_pages,
                sections=current_sections,
                section_title=current_section_title,
                seq_num=seq_num,
                overlap_tokens_count=count_tokens(previous_overlap_text),
                extra_metadata=extra_metadata,
            )
            chunks.append(chunk)

        # Wire sequential pointers between chunks
        self._wire_chunk_pointers(chunks)

        return chunks

    def _finalize_chunk(
        self,
        doc_id: str,
        source_name: str,
        inferred_type: str,
        texts: list[str],
        pages: set[int],
        sections: set[str],
        section_title: str,
        seq_num: int,
        overlap_tokens_count: int = 0,
        extra_metadata: dict[str, Any] | None = None,
    ) -> DocumentChunk:
        """Assemble a single DocumentChunk with complete metadata."""
        content = "\n\n".join(t for t in texts if t.strip()).strip()
        primary_page = sorted(pages)[0] if pages else None
        primary_section = sorted(sections)[0] if sections else section_title

        # Mitigate context degradation: inject section context if not already present in chunk content
        if (
            primary_section
            and primary_section != "General"
            and primary_section not in content
        ):
            content = f"## {primary_section}\n\n{content}"

        tokens = count_tokens(content)

        meta = MetadataTagger.build_chunk_metadata(
            source_name=source_name,
            page=primary_page,
            section=primary_section,
            document_type=inferred_type,
            sequence_num=seq_num,
            content=content,
            token_count=tokens,
            overlap_token_count=overlap_tokens_count,
            extra=extra_metadata,
            document_id=doc_id,
        )

        return DocumentChunk(
            id=meta["chunk_id"],
            document_id=doc_id,
            chunk_index=seq_num - 1,
            content=content,
            char_count=len(content),
            word_count=len(content.split()),
            page_numbers=sorted(pages),
            section_titles=sorted(sections),
            metadata=meta,
        )

    def _chunk_plain_text(
        self,
        doc_id: str,
        text: str,
        source_name: str,
        document_type: str | None = None,
        extra_metadata: dict[str, Any] | None = None,
    ) -> list[DocumentChunk]:
        """Semantic chunker for raw plain text documents."""
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        inferred_type = MetadataTagger.infer_document_type(
            source_name=source_name,
            text_sample=text[:500],
            explicit_type=document_type,
        )

        # Break paragraphs into individual sentences
        units: list[str] = []
        for p in paragraphs:
            sub_sentences = self._split_into_sentences(p)
            if sub_sentences:
                units.extend(sub_sentences)
            else:
                units.append(p)

        chunks: list[DocumentChunk] = []
        current_texts: list[str] = []
        current_tokens = 0
        seq_num = 1
        previous_overlap = ""
        last_sentence: str | None = None

        for unit in units:
            unit_tokens = count_tokens(unit)

            # Check semantic breakpoint
            semantic_break = False
            if last_sentence is not None and current_tokens >= self.min_tokens:
                sim = self.compute_sentence_similarity(last_sentence, unit)
                if sim < self.similarity_threshold:
                    semantic_break = True

            size_overflow = current_tokens > 0 and (
                current_tokens + unit_tokens > self.target_tokens
            )

            if semantic_break or size_overflow:
                content = "\n\n".join(current_texts).strip()
                tokens = count_tokens(content)
                meta = MetadataTagger.build_chunk_metadata(
                    source_name=source_name,
                    page=None,
                    section="General",
                    document_type=inferred_type,
                    sequence_num=seq_num,
                    content=content,
                    token_count=tokens,
                    overlap_token_count=count_tokens(previous_overlap),
                    extra=extra_metadata,
                    document_id=doc_id,
                )
                chunk = DocumentChunk(
                    id=meta["chunk_id"],
                    document_id=doc_id,
                    chunk_index=seq_num - 1,
                    content=content,
                    char_count=len(content),
                    word_count=len(content.split()),
                    metadata=meta,
                )
                chunks.append(chunk)
                seq_num += 1

                previous_overlap = get_trailing_token_overlap(
                    content, self.overlap_tokens
                )
                current_texts = [previous_overlap, unit] if previous_overlap else [unit]
                current_tokens = count_tokens("\n\n".join(current_texts))
            else:
                current_texts.append(unit)
                current_tokens += unit_tokens

            last_sentence = unit

        if current_texts:
            content = "\n\n".join(current_texts).strip()
            tokens = count_tokens(content)
            meta = MetadataTagger.build_chunk_metadata(
                source_name=source_name,
                page=None,
                section="General",
                document_type=inferred_type,
                sequence_num=seq_num,
                content=content,
                token_count=tokens,
                overlap_token_count=count_tokens(previous_overlap),
                extra=extra_metadata,
                document_id=doc_id,
            )
            chunk = DocumentChunk(
                id=meta["chunk_id"],
                document_id=doc_id,
                chunk_index=seq_num - 1,
                content=content,
                char_count=len(content),
                word_count=len(content.split()),
                metadata=meta,
            )
            chunks.append(chunk)

        self._wire_chunk_pointers(chunks)
        return chunks

    def _split_into_sentences(self, text: str) -> list[str]:
        """Split a block of text into sentences, protecting abbreviations and decimal numbers."""
        if not text.strip():
            return []

        protected = text
        for idx, abbr in enumerate(_PROTECTED_ABBREVIATIONS):
            protected = protected.replace(abbr, f"__ABBR_{idx}__")

        # Protect decimal numbers e.g. 3.14 -> 3__DOT__14
        protected = re.sub(r"(\d+)\.(\d+)", r"\1__DOT__\2", protected)
        # Protect numbered list items e.g. 1. Item -> 1__LISTDOT__ Item
        protected = re.sub(r"(?<=\b\d)\.(?=\s+)", "__LISTDOT__", protected)

        # Split on sentence boundaries: period, question mark, or exclamation mark followed by whitespace
        parts = re.split(r"(?<=[.!?])\s+", protected)
        results: list[str] = []
        for part in parts:
            part = part.strip()
            if not part:
                continue
            for idx, abbr in enumerate(_PROTECTED_ABBREVIATIONS):
                part = part.replace(f"__ABBR_{idx}__", abbr)
            part = part.replace("__DOT__", ".").replace("__LISTDOT__", ".")
            results.append(part)

        return results

    def _wire_chunk_pointers(self, chunks: list[DocumentChunk]) -> None:
        """Inject previous_chunk_id and next_chunk_id for traversal."""
        for i, chunk in enumerate(chunks):
            prev_id = chunks[i - 1].id if i > 0 else None
            next_id = chunks[i + 1].id if i < len(chunks) - 1 else None
            chunk.metadata["prev_chunk_id"] = prev_id
            chunk.metadata["next_chunk_id"] = next_id


default_semantic_chunker = SemanticChunker(target_tokens=350, overlap_tokens=50)
