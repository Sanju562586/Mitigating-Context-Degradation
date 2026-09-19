"use client";

import React, { useState } from "react";
import {
  Code2,
  Copy,
  Check,
  Hash,
  BookOpen,
  Boxes,
  FileDigit,
  LayoutGrid,
  Layers,
  Sparkles,
} from "lucide-react";
import { Document } from "@/types/ingestion";

interface DocumentInspectorProps {
  document: Document | null;
  isLoading: boolean;
}

export const DocumentInspector: React.FC<DocumentInspectorProps> = ({
  document,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState<"overview" | "chunks" | "blocks" | "json">("overview");
  const [copied, setCopied] = useState(false);
  const [copiedChunkId, setCopiedChunkId] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center justify-center min-h-[460px]">
        <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-3"></div>
        <p className="text-sm font-medium text-slate-300">Retrieving Document Metadata...</p>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center justify-center min-h-[460px] text-center">
        <div className="h-16 w-16 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-600 mb-4 shadow-inner">
          <BookOpen className="h-8 w-8" />
        </div>
        <h3 className="text-base font-semibold text-slate-300">No Document Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
          Select an ingested document from the repository or upload a new file to inspect its metadata: chunks made, page count, and structural blocks.
        </p>
      </div>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Compute block statistics
  const blockStats = document.elements.reduce(
    (acc, el) => {
      const t = el.element_type.toLowerCase();
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const chunksCount = document.metadata.chunk_count || (document.chunks ? document.chunks.length : 0);
  const blocksCount = document.metadata.element_count || document.elements.length;
  const pagesCount = document.metadata.page_count ?? 1;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col space-y-6">
      {/* Header with Title & Source Metadata */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 text-xs font-bold rounded uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              {document.metadata.file_type}
            </span>
            <h2 className="text-lg font-bold text-white truncate max-w-lg" title={document.metadata.source_name}>
              {document.metadata.source_name}
            </h2>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 font-mono">
            <Hash className="h-3 w-3 text-slate-500" />
            <span className="truncate max-w-sm">{document.id}</span>
          </div>
        </div>

        <button
          onClick={() => handleCopy(JSON.stringify(document, null, 2))}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:bg-slate-800 transition-colors shrink-0"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied JSON</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy Schema JSON</span>
            </>
          )}
        </button>
      </div>

      {/* METADATA METRIC CARDS (Chunks, Pages, Blocks, Words) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        {/* Metric 1: Chunks Made */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/50 to-slate-950 border border-indigo-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-300">Chunks Made</span>
            <Boxes className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {chunksCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Standardized retrieval units
          </div>
        </div>

        {/* Metric 2: Pages */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/50 to-slate-950 border border-blue-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-300">Total Pages</span>
            <FileDigit className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {pagesCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {document.metadata.page_count ? "Paginated boundaries" : "Single document stream"}
          </div>
        </div>

        {/* Metric 3: Blocks */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/50 to-slate-950 border border-purple-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-purple-300">Structural Blocks</span>
            <LayoutGrid className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {blocksCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Paragraphs & headings
          </div>
        </div>

        {/* Metric 4: Words & Volume */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/50 to-slate-950 border border-emerald-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-300">Volume</span>
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-white">
            {document.metadata.word_count.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Words • {document.metadata.char_count.toLocaleString()} chars
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "overview"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Metadata Summary
        </button>

        <button
          onClick={() => setActiveTab("chunks")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "chunks"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Boxes className="h-3.5 w-3.5" />
          Chunks Manifest ({chunksCount})
        </button>

        <button
          onClick={() => setActiveTab("blocks")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "blocks"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Blocks Manifest ({blocksCount})
        </button>

        <button
          onClick={() => setActiveTab("json")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "json"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
          }`}
        >
          <Code2 className="h-3.5 w-3.5" />
          Canonical Schema (JSON)
        </button>
      </div>

      {/* TAB 1: METADATA OVERVIEW & COMPOSITION */}
      {activeTab === "overview" && (
        <div className="space-y-4 text-xs">
          {/* Block Type Breakdown */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">
              Structural Block Composition
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(blockStats).map(([type, count]) => (
                <div
                  key={type}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <span className="capitalize text-slate-300 font-medium">{type}s</span>
                  <span className="font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Document Properties Table */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">
              Document Attributes & Provenance
            </h4>
            <div className="divide-y divide-slate-800/60 font-mono">
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">Document Identifier</span>
                <span className="text-slate-200">{document.id}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">Source Name</span>
                <span className="text-slate-200">{document.metadata.source_name}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">File Format</span>
                <span className="text-indigo-400 uppercase font-bold">{document.metadata.file_type}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">File Size</span>
                <span className="text-slate-200">{formatBytes(document.metadata.file_size_bytes)}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">SHA-256 Content Hash</span>
                <span className="text-slate-300 truncate max-w-xs" title={document.metadata.content_hash}>
                  {document.metadata.content_hash}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-slate-500 font-sans">Ingestion Timestamp</span>
                <span className="text-slate-200">{document.metadata.created_at}</span>
              </div>
            </div>
          </div>

          {/* Extra Format-Specific Headers */}
          {document.metadata.extra && Object.keys(document.metadata.extra).length > 0 && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-3">
                Extracted Format Headers & Tags
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                {Object.entries(document.metadata.extra).map(([k, v]) => (
                  <div key={k} className="p-2 bg-slate-900 rounded border border-slate-800/80 flex items-center justify-between gap-2">
                    <span className="text-slate-500">{k}:</span>
                    <span className="text-slate-200 truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHUNKS MANIFEST & METADATA TAGS */}
      {activeTab === "chunks" && (
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {(!document.chunks || document.chunks.length === 0) ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No chunks generated for this document.
            </div>
          ) : (
            document.chunks.map((chunk, idx) => {
              const chunkId = chunk.metadata?.chunk_id || chunk.id;
              const docType = chunk.metadata?.document_type || "DOCUMENT";
              const pageNum = chunk.metadata?.page ?? (chunk.page_numbers && chunk.page_numbers.length > 0 ? chunk.page_numbers[0] : null);
              const sectionName = chunk.metadata?.section || (chunk.section_titles && chunk.section_titles.length > 0 ? chunk.section_titles[0] : "General");
              const createdAt = chunk.metadata?.created_at || document.metadata.created_at?.split("T")[0];
              const tokenCount = chunk.token_count || chunk.metadata?.token_count || Math.round(chunk.word_count * 1.3);
              const overlapCount = chunk.metadata?.overlap_token_count || 0;
              const isExpanded = expandedChunkId === chunkId;

              const metadataExample = {
                chunk_id: chunkId,
                source: chunk.metadata?.source || document.metadata.source_name,
                page: pageNum,
                section: sectionName,
                document_type: docType,
                created_at: createdAt,
              };

              const handleCopyChunkMeta = (e: React.MouseEvent) => {
                e.stopPropagation();
                navigator.clipboard.writeText(JSON.stringify(metadataExample, null, 2));
                setCopiedChunkId(chunkId);
                setTimeout(() => setCopiedChunkId(null), 2000);
              };

              return (
                <div
                  key={chunkId || idx}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition-all space-y-3"
                >
                  {/* Card Header: IDs & Metadata Badges */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-mono font-bold border border-indigo-500/20 text-xs">
                        #{chunk.chunk_index}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md font-mono text-xs font-bold bg-slate-900 text-indigo-300 border border-slate-800">
                        {chunkId}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {docType}
                      </span>
                      {pageNum !== null && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Page {pageNum}
                        </span>
                      )}
                      {sectionName && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-300 border border-purple-500/20 truncate max-w-xs" title={sectionName}>
                          {sectionName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={handleCopyChunkMeta}
                        className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
                        title="Copy chunk metadata JSON"
                      >
                        {copiedChunkId === chunkId ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Tag JSON</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setExpandedChunkId(isExpanded ? null : chunkId)}
                        className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-900 border border-slate-800 transition-colors"
                      >
                        {isExpanded ? "Hide Text" : "View Text"}
                      </button>
                    </div>
                  </div>

                  {/* Token Metrics & Overlap Tag */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1 border-t border-slate-900">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-indigo-400 font-semibold">{tokenCount} tokens</span>
                      <span>•</span>
                      <span>{chunk.word_count} words</span>
                      <span>•</span>
                      <span>{chunk.char_count} chars</span>
                    </div>

                    {overlapCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        +{overlapCount} tokens overlap
                      </span>
                    )}
                  </div>

                  {/* Text preview or expanded full text */}
                  {isExpanded ? (
                    <div className="p-3 bg-slate-900/90 rounded-lg text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed border border-slate-800">
                      {chunk.content}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {chunk.content}
                    </p>
                  )}

                  {/* Standardized Metadata Spec Viewer */}
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-900 text-[11px] font-mono text-slate-400">
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">
                      Chunk Metadata Tags:
                    </div>
                    <pre className="text-indigo-300 overflow-x-auto text-[11px]">
                      {JSON.stringify(metadataExample, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: BLOCKS MANIFEST (METADATA ONLY) */}
      {activeTab === "blocks" && (
        <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
          {document.elements.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
              No structural blocks found.
            </div>
          ) : (
            document.elements.map((el, idx) => (
              <div
                key={el.id || idx}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded font-mono font-bold uppercase text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    {el.element_type}
                  </span>
                  <div>
                    <div className="font-mono text-slate-300">{el.id}</div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      {el.page_number && <span>Page {el.page_number}</span>}
                      {el.section_title && <span>• {el.section_title}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-right font-mono text-[11px] text-slate-400">
                  <span>{el.word_count} words</span>
                  <span>•</span>
                  <span>{el.char_count} chars</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 4: CANONICAL SCHEMA (JSON) */}
      {activeTab === "json" && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto max-h-[460px] text-xs font-mono text-indigo-300 scrollbar-thin scrollbar-thumb-slate-800">
          {JSON.stringify(document, null, 2)}
        </div>
      )}
    </div>
  );
};
