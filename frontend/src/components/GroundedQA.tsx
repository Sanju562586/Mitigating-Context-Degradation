"use client";

import React, { useState } from "react";
import { submitQuestion, GroundedAnswerResponse } from "@/lib/api";
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CircleCheck,
  CircleX,
  CircleMinus,
} from "lucide-react";

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

export function GroundedQA() {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<GroundedAnswerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await submitQuestion(query.trim());
      setResponse(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate answer");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          Grounded Q&A & Hallucination Mitigation
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Query the ingested knowledge base through the complete hallucination-mitigation pipeline:
          Hybrid Retrieval &rarr; Cross-Encoder Reranking &rarr; Context Compaction &rarr; Evidence Sufficiency Gate &rarr; Grounded Generation / Abstention.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question grounded in your documents (e.g. 'What is the vacation policy?')..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-6 py-3 rounded-lg flex items-center gap-2 transition"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                "Ask & Ground"
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-200 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {response && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-xl border flex items-start gap-4 ${
              response.abstained
                ? "bg-amber-950/30 border-amber-800/80 text-amber-200"
                : "bg-emerald-950/30 border-emerald-800/80 text-emerald-200"
            }`}
          >
            {response.abstained ? (
              <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-semibold text-base flex items-center gap-2">
                {response.abstained ? "Safely Abstained" : "Grounded Answer"}
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-slate-800/80 text-slate-300">
                  Sufficiency: {Math.round(response.sufficiency.sufficiency_score * 100)}%
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-slate-800/80 text-slate-300">
                  Faithfulness: {Math.round(response.grounding_report.faithfulness_score * 100)}%
                </span>
              </div>
              <p className="text-sm opacity-90 leading-relaxed">{response.answer}</p>
            </div>
          </div>

          {response.abstained && response.abstention_reason && (
            <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-xs text-slate-300">
              <span className="text-slate-400 font-medium">Abstention reason: </span>
              {response.abstention_reason}
            </div>
          )}
{/* Evidence Sufficiency Gate Panel */}
          <div className="bg-slate-950 border border-slate-800/90 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400" />
              Evidence Sufficiency Decision
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">Sufficiency</span>
                <span className={`font-semibold ${response.sufficiency.is_sufficient ? "text-emerald-400" : "text-amber-400"}`}>
                  {response.sufficiency.is_sufficient ? "Sufficient" : "Insufficient"}
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">Score</span>
                <span className="font-mono text-slate-200">
                  {Math.round(response.sufficiency.sufficiency_score * 100)}%
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">Threshold</span>
                <span className="font-mono text-slate-200">
                  {response.sufficiency.threshold.toFixed(2)}
                </span>
              </div>
              <div className="bg-slate-900 p-2.5 rounded border border-slate-800">
                <span className="text-slate-400 block">Topic</span>
                <span className="text-slate-200 truncate">{response.sufficiency.topic}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 italic">
              Reasoning: {response.sufficiency.reasoning}
            </p>
            {response.sufficiency.missing_aspects.length > 0 && (
              <div className="text-xs text-amber-300/90 space-y-0.5">
                <span>Missing aspects: </span>
                {response.sufficiency.missing_aspects.map((m, i) => (
                  <span key={i} className="font-mono bg-slate-900/80 border border-slate-800 rounded px-1.5 py-0.5 text-xs">
                    {m}
                  </span>
                ))}
              </div>
            )}
          </div>
{/* Claim-Level Verification */}
          {response.grounding_report.claims.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Claim-Level NLI Verification
              </h3>
              <div className="space-y-2">
                {response.grounding_report.claims.map((c, i) => (
                  <div key={i} className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-200 leading-normal">{c.claim_text}</span>
                      <span className={`shrink-0 font-mono ${statusColor(c.status)}`}>
                        {statusLabel(c.status)} ({Math.round(c.confidence * 100)}%)
                      </span>
                    </div>
                    {c.evidence_snippet && (
                      <p className="text-slate-400/90">&ldquo;{c.evidence_snippet}&rdquo;</p>
                    )}
                    {c.cited_sources.length > 0 && (
                      <div className="text-slate-500">
                        Sources: {c.cited_sources.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
{/* Citations & Provenance */}
          {(response.grounding_report.verified_citations.length > 0 ||
            response.grounding_report.unverified_citations.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <CircleCheck className="w-4 h-4 text-emerald-400" />
                Citation Provenance
              </h3>
              {response.grounding_report.verified_citations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">Verified citations:</div>
                  <div className="flex flex-wrap gap-2">
                    {response.grounding_report.verified_citations.map((c, i) => (
                      <span key={i} className="font-mono text-xs bg-emerald-950/20 border border-emerald-800/60 text-emerald-300 rounded px-2 py-1">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {response.grounding_report.unverified_citations.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">Unverified citations (warned):</div>
                  <div className="flex flex-wrap gap-2">
                    {response.grounding_report.unverified_citations.map((c, i) => (
                      <span key={i} className="font-mono text-xs bg-amber-950/20 border border-amber-700/60 text-amber-300 rounded px-2 py-1">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
{/* Hallucination Warning */}
          {response.grounding_report.hallucination_detected && (
            <div className="p-3 bg-red-950/40 border border-red-800/70 rounded-lg text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              Hallucination risk detected: some generated claims could not be fully grounded in the provided evidence.
            </div>
          )}

          {/* Grounding Telemetry */}
          <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-lg text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Grounding Telemetry
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <CircleCheck className="w-3.5 h-3.5 text-emerald-500" />
                Entailed: {response.grounding_report.entailed_claims_count}
              </span>
              <span className="flex items-center gap-1">
                <CircleMinus className="w-3.5 h-3.5 text-amber-400" />
                Neutral: {response.grounding_report.neutral_claims_count}
              </span>
              <span className="flex items-center gap-1">
                <CircleX className="w-3.5 h-3.5 text-red-400" />
                Contradicted: {response.grounding_report.contradicted_claims_count}
              </span>
              <span>Total Claims: {response.grounding_report.total_claims}</span>
              <span>Latency: {Math.round(response.latency_ms)} ms</span>
              <span>Model: {response.model_name}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
