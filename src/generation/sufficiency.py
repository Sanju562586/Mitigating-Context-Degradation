"""Evidence Sufficiency Classifier & Truthful Abstention Protocol."""

from __future__ import annotations

import re
from typing import List, Optional

from src.context.models import CompactedEvidence, OptimizedContext
from src.generation.models import SufficiencyAssessment

# Common stop words and query filler tokens to ignore when evaluating factual coverage
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "with", "about",
    "by", "of", "from", "as", "is", "are", "was", "were", "be", "been", "being",
    "what", "where", "when", "why", "how", "who", "which", "whose", "whom",
    "can", "could", "should", "would", "do", "does", "did", "please", "tell",
    "me", "explain", "describe", "detail", "give", "show", "find", "say", "according",
}


class EvidenceSufficiencyClassifier:
    """Evaluates whether retrieved evidence context adequately answers the query.

    If the quantified sufficiency score is below theta (default 0.40), triggers the
    Truthful Abstention Protocol to prevent hallucinated generation on out-of-domain,
    unanswerable, or missing-evidence queries.
    """

    def __init__(self, default_threshold: float = 0.40) -> None:
        self.default_threshold = default_threshold

    @staticmethod
    def extract_informative_terms(text: str) -> List[str]:
        """Extract meaningful factual query terms, entities, and keywords."""
        tokens = re.findall(r"\b[a-zA-Z0-9_\-\.]{2,}\b", text.lower())
        return [t for t in tokens if t not in _STOP_WORDS]

    @staticmethod
    def extract_topic(query: str) -> str:
        """Extract focal topic or target question phrase from the query."""
        cleaned = re.sub(
            r"^(what|where|when|why|how|who|can you tell me about|please explain|what is the|what are the)\s+",
            "",
            query.strip(),
            flags=re.IGNORECASE,
        ).rstrip("?., ")
        return cleaned if cleaned else query.strip()

    def assess_sufficiency(
        self,
        query: str,
        context: Optional[OptimizedContext] = None,
        evidence_items: Optional[List[CompactedEvidence]] = None,
        threshold: Optional[float] = None,
    ) -> SufficiencyAssessment:
        """Evaluate evidence coverage against query information requirements.

        Args:
            query: The user query string.
            context: Optional OptimizedContext from Module 5.
            evidence_items: Optional direct list of CompactedEvidence items.
            threshold: Optional custom sufficiency cutoff threshold.

        Returns:
            SufficiencyAssessment detailing sufficiency status, score, topic, and reasoning.
        """
        tau = threshold if threshold is not None else self.default_threshold
        topic = self.extract_topic(query)

        # Collect evidence passages
        items: List[CompactedEvidence] = []
        if context is not None and context.evidence_items:
            items = context.evidence_items
        elif evidence_items:
            items = evidence_items

        if not items:
            abstention_msg = (
                f"The available documents do not contain sufficient evidence to verify {topic}."
            )
            return SufficiencyAssessment(
                is_sufficient=False,
                sufficiency_score=0.0,
                threshold=tau,
                topic=topic,
                abstention_message=abstention_msg,
                reasoning="No evidence passages were retrieved or retained in the context window.",
                matched_aspects=[],
                missing_aspects=self.extract_informative_terms(query),
            )

        # Aggregate evidence text
        combined_evidence = " ".join(
            f"{item.extracted_text} {item.original_text}".lower() for item in items
        )

        query_terms = self.extract_informative_terms(query)
        if not query_terms:
            # Query is purely generic/conversational (e.g. "Hello there")
            return SufficiencyAssessment(
                is_sufficient=True,
                sufficiency_score=1.0,
                threshold=tau,
                topic=topic,
                abstention_message=None,
                reasoning="Query contains conversational greeting without specific factual constraint.",
                matched_aspects=[],
                missing_aspects=[],
            )

        # Analyze token coverage and aspect matching
        matched_aspects: List[str] = []
        missing_aspects: List[str] = []

        for term in query_terms:
            # Check for exact token match or stem match in evidence
            if term in combined_evidence:
                matched_aspects.append(term)
            else:
                missing_aspects.append(term)

        term_coverage = len(matched_aspects) / len(query_terms) if query_terms else 0.0

        # Query intent & entity constraints check
        # If query asks for specific quantities/numbers (e.g. "how many", "allowance", "days", "cost")
        # check if context contains numerical tokens
        numeric_need = bool(re.search(r"\b(how many|how much|days|hours|percentage|cost|amount|date|year)\b", query, re.I))
        numeric_found = bool(re.search(r"\b\d+(\.\d+)?\b", combined_evidence))
        numeric_alignment = 1.0 if (not numeric_need or numeric_found) else 0.4

        # Evidence quality multiplier (average salience if available)
        salience_scores = [
            item.metadata.get("salience_score", item.metadata.get("rerank_score", 0.5))
            for item in items
        ]
        avg_salience = sum(salience_scores) / len(salience_scores) if salience_scores else 0.5
        clamped_salience = max(0.0, min(1.0, avg_salience))

        # Weighted sufficiency score calculation
        # 60% term coverage + 25% numeric/predicate alignment + 15% retrieval salience
        sufficiency_score = (
            0.60 * term_coverage
            + 0.25 * numeric_alignment
            + 0.15 * clamped_salience
        )
        sufficiency_score = round(max(0.0, min(1.0, sufficiency_score)), 4)

        is_sufficient = sufficiency_score >= tau

        if not is_sufficient:
            missing_desc = (
                f" Specifically, verified details on {', '.join(missing_aspects[:4])} were not found in the indexed sources."
                if missing_aspects
                else ""
            )
            abstention_msg = (
                f"The available documents do not contain sufficient evidence to verify {topic}.{missing_desc}"
            )
            reasoning = (
                f"Evidence sufficiency score ({sufficiency_score:.2f}) falls below threshold ({tau:.2f}). "
                f"Missing critical factual aspects: {', '.join(missing_aspects) if missing_aspects else 'None'}."
            )
        else:
            abstention_msg = None
            reasoning = (
                f"Evidence sufficiency score ({sufficiency_score:.2f}) meets or exceeds threshold ({tau:.2f}). "
                f"Matched aspects: {', '.join(matched_aspects)}."
            )

        return SufficiencyAssessment(
            is_sufficient=is_sufficient,
            sufficiency_score=sufficiency_score,
            threshold=tau,
            topic=topic,
            abstention_message=abstention_msg,
            reasoning=reasoning,
            matched_aspects=matched_aspects,
            missing_aspects=missing_aspects,
        )


default_sufficiency_classifier = EvidenceSufficiencyClassifier()
