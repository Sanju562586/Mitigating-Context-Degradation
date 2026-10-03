"use client";

import React, { useState } from "react";
import { submitQuestion, GroundedAnswerResponse } from "@/lib/api";
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
  ChevronDown,
  ChevronUp,
  Layers,
  BookOpen,
  Send,
  RefreshCw,
  ExternalLink,
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
  const [response, setResponse] = useState<GroundedAnswerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [showEvidenceChunks, setShowEvidenceChunks] = useState(false);

  const selectedDoc = documents.find((d) => d.document_id === selectedDocId);
  const totalChunks = documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await submitQuestion(
        query.trim(),
        undefined,
        selectedDocId || undefined
      );
      setResponse(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate answer");
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
        "Summarize the key findings or policies.",
        "What are the specific requirements or conditions?",
      ]
    : [
        "What are the key policies and guidelines outlined?",
        "Summarize the main conclusions across all documents.",
        "What are the critical dates and requirements?",
      ];

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
                Upload your PDF, Word, or text files. The system automatically chunks and indexes them for grounded retrieval.
              </p>
            </div>
          </div>

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
      {/* STEP 2: QUESTION & QUERY ENGINE                                     */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Ask Questions on Your Documents
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Hybrid Retrieval • RRF • Guardrails
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-5">
          Ask questions grounded in your uploaded documents. Responses strictly cite source chunks with claim-level NLI verification.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                selectedDoc
                  ? `Ask a question about "${selectedDoc.title}"...`
                  : documents.length > 0
                  ? "Ask a question about your uploaded documents..."
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
                  Grounding...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Ask &amp; Ground
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
      {/* STEP 3: GROUNDED RESPONSE & ANTI-HALLUCINATION GUARDRAILS            */}
      {/* ==================================================================== */}
      {response && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl backdrop-blur-sm">
          {/* Status & Answer Banner */}
          <div
            className={`p-5 rounded-xl border flex flex-col gap-3 ${
              response.abstained
                ? "bg-amber-950/20 border-amber-800/70 text-amber-200"
                : "bg-emerald-950/20 border-emerald-800/70 text-emerald-200"
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                {response.abstained ? (
                  <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                )}
                <span className="font-bold text-base text-white">
                  {response.abstained ? "Truthful Abstention Protocol" : "Grounded Answer"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-900 border border-slate-800 text-slate-300">
                  Sufficiency: {Math.round(response.sufficiency.sufficiency_score * 100)}%
                </span>
                <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-900 border border-slate-800 text-slate-300">
                  Faithfulness: {Math.round(response.grounding_report.faithfulness_score * 100)}%
                </span>
                <span className="text-xs px-2.5 py-1 rounded-lg font-mono bg-slate-900 border border-slate-800 text-slate-400 hidden sm:inline">
                  {response.latency_ms}ms
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800/80 text-sm leading-relaxed text-slate-100">
              {response.answer}
            </div>

            {response.abstained && response.abstention_reason && (
              <div className="text-xs text-amber-300/90 bg-amber-950/40 p-3 rounded-lg border border-amber-900/60">
                <span className="font-semibold">Reasoning: </span>
                {response.abstention_reason}
              </div>
            )}
          </div>

          {/* Evidence Sufficiency Gate Panel */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-400" />
                Evidence Sufficiency Gate (Threshold: {response.sufficiency.threshold.toFixed(2)})
              </h3>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  response.sufficiency.is_sufficient
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
              >
                {response.sufficiency.is_sufficient ? "✓ Sufficient Evidence" : "⚠ Insufficient Context"}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Topic</span>
                <span className="font-semibold text-slate-200 truncate block mt-0.5">
                  {response.sufficiency.topic}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Coverage Score</span>
                <span className="font-mono text-slate-200 font-bold block mt-0.5">
                  {Math.round(response.sufficiency.sufficiency_score * 100)}%
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Gate Decision</span>
                <span
                  className={`font-semibold block mt-0.5 ${
                    response.sufficiency.is_sufficient ? "text-emerald-400" : "text-amber-400"
                  }`}
                >
                  {response.sufficiency.is_sufficient ? "Proceed to Generate" : "Trigger Abstention"}
                </span>
              </div>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <span className="text-slate-400 block text-[11px]">Synthesizer</span>
                <span className="font-mono text-slate-200 truncate block mt-0.5">
                  {response.model_name}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="font-semibold text-slate-300">Coverage Analysis: </span>
              {response.sufficiency.reasoning}
            </p>

            {response.sufficiency.missing_aspects.length > 0 && (
              <div className="text-xs text-amber-300/90 flex flex-wrap items-center gap-1.5 pt-1">
                <span className="font-medium">Unaddressed query aspects:</span>
                {response.sufficiency.missing_aspects.map((m, i) => (
                  <span
                    key={i}
                    className="font-mono bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px]"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Claim-Level NLI Verification */}
          {response.grounding_report.claims.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Claim-Level NLI Verification ({response.grounding_report.claims.length} claims verified)
                </h3>
                <div className="flex items-center gap-2 text-[11px] font-mono">
                  <span className="text-emerald-400">
                    {response.grounding_report.entailed_claims_count} Entailed
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-amber-400">
                    {response.grounding_report.neutral_claims_count} Neutral
                  </span>
                  <span className="text-slate-600">•</span>
                  <span className="text-red-400">
                    {response.grounding_report.contradicted_claims_count} Contradicted
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {response.grounding_report.claims.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-slate-200 font-medium leading-relaxed">
                        &ldquo;{c.claim_text}&rdquo;
                      </span>
                      <span
                        className={`shrink-0 font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${statusColor(
                          c.status
                        )} bg-slate-950 border border-slate-800`}
                      >
                        {statusLabel(c.status)} ({Math.round(c.confidence * 100)}%)
                      </span>
                    </div>

                    {c.evidence_snippet && (
                      <p className="text-slate-400 text-[11px] bg-slate-950 p-2 rounded border border-slate-800/80 italic">
                        Evidence: &ldquo;{c.evidence_snippet}&rdquo;
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

          {/* Verified Citations List */}
          {response.citations.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Verified Citation Anchors:</span>
              {response.citations.map((cit, idx) => (
                <span
                  key={idx}
                  className="font-mono bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 px-2 py-0.5 rounded text-[11px]"
                >
                  {cit}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
