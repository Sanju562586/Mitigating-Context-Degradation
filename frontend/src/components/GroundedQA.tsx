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
  Bot,
  ShieldCheck,
  UploadCloud,
  FileText,
  Send,
  RefreshCw,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

interface GroundedQAProps {
  documents?: DocumentMetadata[];
  selectedDocId?: string | null;
  onSelectDocId?: (docId: string | null) => void;
  onUploadSuccess?: (doc: Document) => void;
}

export function GroundedQA({
  documents = [],
  selectedDocId = null,
  onSelectDocId,
  onUploadSuccess,
}: GroundedQAProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [provider, setProvider] = useState("offline");
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadZone, setShowUploadZone] = useState(false);

  const selectedDoc = documents.find((d) => d.document_id === selectedDocId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await submitQuestionComparison(
        query.trim(),
        undefined,
        selectedDocId || undefined,
        provider
      );
      setComparison(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentIngested = (doc: Document) => {
    if (onUploadSuccess) onUploadSuccess(doc);
    if (onSelectDocId) onSelectDocId(doc.id);
    setShowUploadZone(false);
  };

  const grounded: GroundedAnswerResponse | undefined = comparison?.grounded;
  const naive = comparison?.naive;

  // Format citations cleanly in grounded answer text
  const renderGroundedAnswer = (text: string) => {
    const parts = text.split(/(\[Doc\s+[^\]]+\])/g);
    return parts.map((part, i) => {
      if (/^\[Doc\s+[^\]]+\]$/.test(part)) {
        return (
          <span
            key={i}
            className="inline-block bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded text-xs font-mono font-medium mx-1"
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ==================================================================== */}
      {/* 1. DOCUMENT & PROVIDER BAR (ORCHESTRATOR)                           */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-200">Document:</span>
              {documents.length > 0 ? (
                <select
                  value={selectedDocId || "all"}
                  onChange={(e) =>
                    onSelectDocId?.(e.target.value === "all" ? null : e.target.value)
                  }
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">All Documents ({documents.length})</option>
                  {documents.map((d) => (
                    <option key={d.document_id} value={d.document_id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-amber-400 font-medium">
                  No document uploaded yet
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedDoc
                ? `Active: ${selectedDoc.title} (${selectedDoc.chunk_count} chunks • 220 words + 30 overlap)`
                : documents.length > 0
                ? "Full corpus index (FAISS + BM25)"
                : "Upload a document to compare grounded responses"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* LLM Provider Selector from Architecture Diagram */}
          <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="text-xs text-slate-400 font-medium">LLM Engine:</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="bg-transparent text-xs text-indigo-300 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="offline" className="bg-slate-900 text-slate-200">Offline (Deterministic)</option>
              <option value="ollama" className="bg-slate-900 text-slate-200">Ollama (Local LLM)</option>
              <option value="chatgpt" className="bg-slate-900 text-slate-200">ChatGPT (OpenAI)</option>
              <option value="claude" className="bg-slate-900 text-slate-200">Claude (Anthropic)</option>
              <option value="gemini" className="bg-slate-900 text-slate-200">Gemini (Google)</option>
            </select>
          </div>

          <button
            onClick={() => setShowUploadZone(!showUploadZone)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition shrink-0"
          >
            <UploadCloud className="w-4 h-4 text-indigo-400" />
            {showUploadZone ? "Close Uploader" : "Upload Document"}
          </button>
        </div>
      </div>

      {/* Upload Zone Modal / Drawer */}
      {(showUploadZone || documents.length === 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Upload Document (PDF, DOCX, TXT, MD)
            </h3>
            {documents.length > 0 && (
              <button
                onClick={() => setShowUploadZone(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            )}
          </div>
          <UploadZone onIngestSuccess={handleDocumentIngested} />
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. QUERY INPUT (CLEAN & SIMPLE)                                     */}
      {/* ==================================================================== */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              selectedDoc
                ? `Ask anything about "${selectedDoc.title}"...`
                : "Ask a question to compare Naive LLM vs. Our Application..."
            }
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-3 rounded-lg flex items-center gap-2 text-sm transition shrink-0"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Comparing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Compare
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-3 p-3 bg-red-950/40 border border-red-800/80 rounded-lg text-red-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* 3. CLEAN SIDE-BY-SIDE COMPARISON (NO UNNECESSARY CLUTTER)            */}
      {/* ==================================================================== */}
      {comparison && naive && grounded && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              Comparison for: &ldquo;{comparison.query}&rdquo;
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ---------------------------------------------------------------- */}
            {/* LEFT: NAIVE LLM (ENTIRE RAW DOCUMENT PROMPT)                     */}
            {/* ---------------------------------------------------------------- */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-200">
                      Naive LLM (Entire Document)
                    </span>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    Raw Document Dump
                  </span>
                </div>

                <div className="text-sm leading-relaxed text-slate-300">
                  {naive.answer}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/60 text-xs text-slate-500 flex items-center gap-1.5">
                <span>⚠️ Directly prompted with entire raw document &amp; query. No chunking, ungrounded.</span>
              </div>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* RIGHT: OUR APPLICATION (FULL PROCESSING PIPELINE)                */}
            {/* ---------------------------------------------------------------- */}
            <div className="bg-slate-900 border border-indigo-900/40 rounded-xl p-5 flex flex-col justify-between space-y-4 shadow-sm">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-sm text-white">
                      Our Application (Full Pipeline)
                    </span>
                  </div>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Grounded &amp; Verified
                  </span>
                </div>

                <div className="text-sm leading-relaxed text-slate-100">
                  {renderGroundedAnswer(grounded.answer)}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/60 text-xs text-emerald-400/90 flex items-center justify-between">
                <span>✓ Ingestion (220 words + 30 overlap) • Hybrid Retrieval (FAISS + BM25) • Context Assembly • Grounded LLM</span>
                {grounded.citations.length > 0 && (
                  <span className="text-slate-400 text-[11px]">
                    {grounded.citations.length} citations
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
