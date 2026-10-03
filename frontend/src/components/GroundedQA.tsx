"use client";

import React, { useState } from "react";
import {
  ComparisonResponse,
  GroundedAnswerResponse,
  submitQuestionComparison,
} from "@/lib/api";
import { Document, DocumentMetadata } from "@/types/ingestion";
import { UploadZone } from "./UploadZone";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UploadCloud,
  Layers,
  BookOpen,
  Send,
  RefreshCw,
  Bot,
  Columns,
  Scale,
  XCircle,
  AlertOctagon,
} from "lucide-react";

interface GroundedQAProps {
  documents?: DocumentMetadata[];
  selectedDocId?: string | null;
  onSelectDocId?: (docId: string | null) => void;
  onUploadSuccess?: (doc: Document) => void;
}

const statusColor = (status: string) =>
  status === "entailed"
    ? "text-emerald-400"
    : status === "contradicted"
      ? "text-red-400"
      : "text-amber-400";

const statusLabel = (status: string) =>
  status === "entailed"
    ? "Entailed"
    : status === "contradicted"
      ? "Contradicted"
      : "Neutral";

export function GroundedQA({
  documents = [],
  selectedDocId = null,
  onSelectDocId,
  onUploadSuccess,
}: GroundedQAProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [viewMode, setViewMode] = useState<"side-by-side" | "grounded-only">("side-by-side");

  const selectedDoc = documents.find((d) => d.document_id === selectedDocId);
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await submitQuestionComparison(
        query.trim(),
        undefined,
        selectedDocId || undefined
      );
      setComparison(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to execute comparison");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentIngested = (doc: Document) => {
    if (onUploadSuccess) {
      onUploadSuccess(doc);
    }
    if (onSelectDocId) {
      onSelectDocId(doc.id);
    }
    setShowUploadZone(false);
  };

  const sampleQueries = selectedDoc
    ? [
        `What is the main topic of ${selectedDoc.title}?`,
        "Summarize the key architectural modules or guidelines.",
        "What are the specific requirements and security layers?",
      ]
    : [
        "What are the key policies and guidelines outlined?",
        "Summarize the main conclusions across all documents.",
        "What are the critical dates and requirements?",
      ];

  const grounded: GroundedAnswerResponse | undefined = comparison?.grounded;
  const naive = comparison?.naive;

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* STEP 1: DOCUMENT REPOSITORY & UPLOAD CONTROLLER                     */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Document Knowledge Base
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                  {documents.length} {documents.length === 1 ? "doc" : "docs"} • {totalChunks} chunks
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload reference documents (PDF, Word, TXT, MD, HTML) to test how our grounded pipeline prevents hallucinations vs. a naive LLM.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploadZone(!showUploadZone)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
                showUploadZone
                  ? "bg-slate-800 text-slate-200 border border-slate-700"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              {showUploadZone ? "Hide Uploader" : "Upload Document"}
            </button>
          </div>
        </div>

        {/* Inline Upload Zone (if opened or if no documents exist) */}
        {(showUploadZone || documents.length === 0) && (
          <div className="mt-5 pt-1">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                {documents.length === 0 ? "Step 1: Upload Your First Document" : "Upload Additional Document"}
              </span>
              {documents.length > 0 && (
                <button
                  onClick={() => setShowUploadZone(false)}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              )}
            </div>
            <UploadZone onIngestSuccess={handleDocumentIngested} />
          </div>
        )}

        {/* Document Selector Pills */}
        {documents.length > 0 && (
          <div className="mt-4 pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                Target Document Context:
              </span>
              <span className="text-xs text-slate-500">
                {selectedDoc ? `Filtered to: ${selectedDoc.title}` : "Searching entire corpus"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSelectDocId?.(null)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedDocId === null
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                All Documents ({totalChunks} chunks)
              </button>

              {documents.map((doc) => {
                const isSelected = selectedDocId === doc.document_id;
                return (
                  <button
                    key={doc.document_id}
                    type="button"
                    onClick={() => onSelectDocId?.(doc.document_id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium max-w-xs truncate transition ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200"
                    }`}
                    title={doc.title}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{doc.title}</span>
                    <span className="text-[10px] opacity-75 font-mono">
                      ({doc.chunk_count}c)
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* STEP 2: QUESTION & COMPARISON QUERY CONTROLLER                      */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Scale className="w-5 h-5 text-indigo-400" />
            Side-by-Side Comparison: Naive LLM vs. Our Application
          </h2>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setViewMode("side-by-side")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition ${
                viewMode === "side-by-side"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              Side-by-Side
            </button>
            <button
              onClick={() => setViewMode("grounded-only")}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition ${
                viewMode === "grounded-only"
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Grounded Only
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 mb-5">
          Send the same query simultaneously to a <strong>Naive baseline LLM</strong> and our <strong>Multi-Stage Grounded Mitigation Pipeline</strong>. Observe how ungrounded models risk hallucination while our application strictly anchors claims to verified document citations.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                selectedDoc
                  ? `Ask a question about "${selectedDoc.title}" to compare both responses...`
                  : documents.length > 0
                  ? "Ask a question about your uploaded documents to compare both responses..."
                  : "Upload a document above first, then ask questions here..."
              }
              disabled={documents.length === 0 && !query}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim() || documents.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-3.5 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-indigo-600/30 transition shrink-0"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Comparing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Compare Both
                </>
              )}
            </button>
          </div>

          {/* Quick Suggestion Chips */}
          {documents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 font-medium">Try asking:</span>
              {sampleQueries.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuery(q)}
                  className="text-[11px] bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg transition text-left"
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          )}
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-950/40 border border-red-800/80 rounded-xl text-red-200 text-xs flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* STEP 3: SIDE-BY-SIDE COMPARISON RESPONSES                            */}
      {/* ==================================================================== */}
      {comparison && grounded && naive && (
        <div className="space-y-6">
          {/* Comparative Metrics Overview Bar */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-400" />
                Comparative Metric Evaluation for &ldquo;{comparison.query}&rdquo;
              </h3>
              <span className="text-xs font-mono text-slate-400">
                Grounding Contrast Analysis
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* Metric 1: Verified Citations */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[11px] block">Verified Citations</span>
                <div className="flex items-center justify-between">
                  <span className="text-red-400 font-mono text-xs flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Naive: 0
                  </span>
                  <span className="text-emerald-400 font-mono text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> App: {grounded.citations.length}
                  </span>
                </div>
              </div>

              {/* Metric 2: Hallucination Risk */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[11px] block">Hallucination Risk</span>
                <div className="flex items-center justify-between">
                  <span className="text-amber-400 font-semibold text-xs">
                    Naive: High
                  </span>
                  <span className="text-emerald-400 font-semibold text-xs">
                    App: Mitigated
                  </span>
                </div>
              </div>

              {/* Metric 3: Sufficiency Gate */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[11px] block">Evidence Sufficiency Gate</span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">
                    Naive: None
                  </span>
                  <span className="text-indigo-300 font-mono text-xs font-bold">
                    App: {Math.round(grounded.sufficiency.sufficiency_score * 100)}%
                  </span>
                </div>
              </div>

              {/* Metric 4: NLI Claim Check */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1">
                <span className="text-slate-400 text-[11px] block">Claim-Level Verification</span>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs">
                    Naive: 0 Checked
                  </span>
                  <span className="text-emerald-400 font-mono text-xs font-bold">
                    App: {grounded.grounding_report.entailed_claims_count} Entailed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* DUAL COLUMN RESPONSES: NAIVE VS OUR APPLICATION */}
          <div
            className={`grid gap-6 ${
              viewMode === "side-by-side"
                ? "grid-cols-1 lg:grid-cols-2"
                : "grid-cols-1 max-w-4xl mx-auto"
            }`}
          >
            {/* ========================================================== */}
            {/* COLUMN 1: NAIVE BASELINE LLM                               */}
            {/* ========================================================== */}
            {viewMode === "side-by-side" && (
              <div className="bg-slate-900/90 border border-red-900/40 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-5">
                <div>
                  {/* Column Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                          Naive LLM (Baseline Direct Output)
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Direct generation without hybrid retrieval, reranking, or NLI guardrails.
                        </p>
                      </div>
                    </div>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800/60 shrink-0">
                      Baseline
                    </span>
                  </div>

                  {/* Warning / Risk Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-red-950/60 border border-red-800/60 text-red-300 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      Hallucination Risk: HIGH
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-950 border border-slate-800 text-slate-400">
                      Citations: 0 (Ungrounded)
                    </span>
                    <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-950 border border-slate-800 text-slate-400">
                      {naive.latency_ms}ms
                    </span>
                  </div>

                  {/* Naive Answer Body */}
                  <div className="p-4 bg-slate-950 rounded-xl border border-red-900/30 text-xs sm:text-sm leading-relaxed text-slate-300 min-h-[160px]">
                    {naive.answer}
                  </div>
                </div>

                {/* Naive Failure Characteristics */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                  <span className="font-semibold text-slate-300 block text-[11px] uppercase tracking-wider">
                    Baseline Limitations:
                  </span>
                  <ul className="space-y-1 text-slate-400 text-[11px]">
                    <li className="flex items-center gap-1.5 text-red-400/90">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      No document chunk evidence retrieved or cited.
                    </li>
                    <li className="flex items-center gap-1.5 text-red-400/90">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      No evidence sufficiency evaluation (blind generation).
                    </li>
                    <li className="flex items-center gap-1.5 text-red-400/90">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      Zero sentence-level NLI claim verification.
                    </li>
                    <li className="flex items-center gap-1.5 text-red-400/90">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                      Prone to context degradation and hallucinations.
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* ========================================================== */}
            {/* COLUMN 2: OUR GROUNDED MITIGATION PIPELINE                 */}
            {/* ========================================================== */}
            <div className="bg-slate-900/90 border border-emerald-900/50 rounded-2xl p-6 shadow-xl flex flex-col justify-between space-y-5">
              <div>
                {/* Column Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        Our Application (Grounded Mitigation Pipeline)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Hybrid Retrieval (FAISS + BM25) • RRF • Compaction • Sufficiency Gate • DeBERTa NLI.
                      </p>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60 shrink-0">
                    Grounded
                  </span>
                </div>

                {/* Telemetry Badges */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Faithfulness: {Math.round(grounded.grounding_report.faithfulness_score * 100)}%
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-indigo-950/60 border border-indigo-800/60 text-indigo-300">
                    Sufficiency: {Math.round(grounded.sufficiency.sufficiency_score * 100)}%
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-950 border border-slate-800 text-slate-400">
                    Citations: {grounded.citations.length} verified
                  </span>
                  <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-950 border border-slate-800 text-slate-400">
                    {grounded.latency_ms}ms
                  </span>
                </div>

                {/* Grounded Answer Body */}
                <div className="p-4 bg-slate-950 rounded-xl border border-emerald-900/30 text-xs sm:text-sm leading-relaxed text-slate-100 min-h-[160px]">
                  {grounded.answer}
                </div>

                {grounded.abstained && grounded.abstention_reason && (
                  <div className="mt-3 text-xs text-amber-300/90 bg-amber-950/40 p-3 rounded-lg border border-amber-900/60">
                    <span className="font-semibold">Abstention Reasoning: </span>
                    {grounded.abstention_reason}
                  </div>
                )}
              </div>

              {/* Evidence Sufficiency & NLI Telemetry Card */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Verified Mitigation Features:
                  </span>
                  <span className="text-[11px] text-emerald-400 font-mono">
                    {grounded.grounding_report.entailed_claims_count} Entailed Claims
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Sufficiency Gate</span>
                    <span className="font-semibold text-emerald-400">
                      {grounded.sufficiency.is_sufficient ? "✓ Passed (≥ θ)" : "⚠ Abstained"}
                    </span>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Lost-in-Middle</span>
                    <span className="font-semibold text-indigo-400">
                      ✓ Boundary Reordered
                    </span>
                  </div>
                </div>

                {/* Verified Citations List */}
                {grounded.citations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-medium">Anchors:</span>
                    {grounded.citations.map((c, i) => (
                      <span
                        key={i}
                        className="font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded text-[10px]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Deep Claim-Level NLI Verification Accordion */}
          {grounded.grounding_report.claims.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Claim-by-Claim Factual Audit ({grounded.grounding_report.claims.length} claims verified)
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  DeBERTa-v3 NLI Verifier
                </span>
              </div>

              <div className="space-y-2">
                {grounded.grounding_report.claims.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-200 font-medium leading-relaxed">
                        &ldquo;{c.claim_text}&rdquo;
                      </span>
                      <span
                        className={`shrink-0 font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${statusColor(
                          c.status
                        )} bg-slate-900 border border-slate-800`}
                      >
                        {statusLabel(c.status)} ({Math.round(c.confidence * 100)}%)
                      </span>
                    </div>

                    {c.evidence_snippet && (
                      <p className="text-slate-400 text-[11px] bg-slate-900 p-2 rounded border border-slate-800/80 italic">
                        Evidence Excerpt: &ldquo;{c.evidence_snippet}&rdquo;
                      </p>
                    )}

                    {c.cited_sources.length > 0 && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        Source Citations: {c.cited_sources.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
