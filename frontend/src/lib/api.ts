import { Document, DocumentMetadata, HealthStatus, IngestApiResponse } from "@/types/ingestion";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export async function checkHealth(): Promise<HealthStatus> {
  const res = await fetch(`${API_BASE_URL}/api/health`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API health check failed with status ${res.status}`);
  }
  return res.json();
}

export async function uploadDocumentFile(file: File): Promise<IngestApiResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE_URL}/api/ingest/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || "Failed to upload and parse document");
  }

  return res.json();
}

export async function ingestRawText(
  title: string,
  content: string,
  format: "txt" | "md" | "html"
): Promise<IngestApiResponse> {
  const res = await fetch(`${API_BASE_URL}/api/ingest/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, format }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || "Failed to ingest text content");
  }

  return res.json();
}

export async function fetchDocuments(): Promise<DocumentMetadata[]> {
  const res = await fetch(`${API_BASE_URL}/api/ingest/documents`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to fetch documents list");
  }
  return res.json();
}

export async function fetchDocumentById(docId: string): Promise<Document> {
  const res = await fetch(`${API_BASE_URL}/api/ingest/documents/${docId}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch document ${docId}`);
  }
  return res.json();
}

export async function deleteDocumentById(docId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/ingest/documents/${docId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Failed to delete document ${docId}`);
  }
}

export type ClaimStatus = "entailed" | "neutral" | "contradicted";

export interface SufficiencyAssessment {
  is_sufficient: boolean;
  sufficiency_score: number;
  threshold: number;
  topic: string;
  abstention_message?: string;
  reasoning: string;
  matched_aspects: string[];
  missing_aspects: string[];
}

export interface ClaimVerification {
  claim_text: string;
  status: ClaimStatus;
  confidence: number;
  cited_sources: string[];
  entailing_chunk_id?: string;
  evidence_snippet?: string;
  reasoning?: string;
}

export interface GroundingReport {
  faithfulness_score: number;
  hallucination_detected: boolean;
  total_claims: number;
  entailed_claims_count: number;
  neutral_claims_count: number;
  contradicted_claims_count: number;
  claims: ClaimVerification[];
  verified_citations: string[];
  unverified_citations: string[];
}

export interface GroundedAnswerResponse {
  query: string;
  answer: string;
  abstained: boolean;
  abstention_reason?: string;
  sufficiency: SufficiencyAssessment;
  grounding_report: GroundingReport;
  citations: string[];
  latency_ms: number;
  model_name: string;
}

export async function submitQuestion(query: string, sessionId?: string): Promise<GroundedAnswerResponse> {
  const payload: { query: string; session_id?: string } = { query };
  if (sessionId) {
    payload.session_id = sessionId;
  }

  const res = await fetch(`${API_BASE_URL}/api/generate/pipeline/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      errorData.detail || "Failed to generate grounded answer"
    );
  }
  return res.json();
}

// ============================================================================
// Module 7: Cross-Session External Memory & Client Sync
// ============================================================================

export interface MemoryPermissions {
  read_enabled: boolean;
  write_enabled: boolean;
  auto_summarize: boolean;
  max_injected_memories: number;
  max_injected_tokens: number;
}

export interface Session {
  session_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  active_document_ids: string[];
  turn_count: number;
  is_active: boolean;
  summary?: string;
  metadata: Record<string, any>;
}

export interface EpisodicMemoryItem {
  memory_id: string;
  session_id: string;
  user_id: string;
  turn_index: number;
  query: string;
  intent?: string;
  answer: string;
  verified_facts: string[];
  referenced_doc_ids: string[];
  citations: string[];
  timestamp: string;
  importance_score: number;
  tags: string[];
  metadata: Record<string, any>;
}

export interface HierarchicalSummary {
  summary_id: string;
  session_id: string;
  level: number;
  title: string;
  summary_text: string;
  key_entities: string[];
  turn_count: number;
  created_at: string;
}

export interface SessionDetailsResponse {
  session: Session;
  permissions: MemoryPermissions;
  turns: EpisodicMemoryItem[];
  summaries: HierarchicalSummary[];
}

export interface MemorySearchResult {
  query: string;
  memories: EpisodicMemoryItem[];
  summaries: HierarchicalSummary[];
  scores: number[];
  total_found: number;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch sessions");
  return res.json();
}

export async function createSession(title: string, activeDocumentIds: string[] = []): Promise<Session> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, active_document_ids: activeDocumentIds }),
  });
  if (!res.ok) throw new Error("Failed to create new session");
  return res.json();
}

export async function fetchSessionDetails(sessionId: string): Promise<SessionDetailsResponse> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions/${sessionId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch session ${sessionId}`);
  return res.json();
}

export async function updateSessionPermissions(
  sessionId: string,
  permissions: MemoryPermissions
): Promise<MemoryPermissions> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions/${sessionId}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(permissions),
  });
  if (!res.ok) throw new Error("Failed to update session permissions");
  return res.json();
}

export async function clearSessionMemory(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions/${sessionId}/clear`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to clear session memory");
}

export async function searchMemory(query: string, sessionId?: string): Promise<MemorySearchResult> {
  const res = await fetch(`${API_BASE_URL}/api/memory/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId || null }),
  });
  if (!res.ok) throw new Error("Failed to search memory");
  return res.json();
}

export async function captureWebContent(payload: {
  url: string;
  title: string;
  selected_text: string;
  session_id?: string;
}): Promise<EpisodicMemoryItem> {
  const res = await fetch(`${API_BASE_URL}/api/memory/capture-web`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to capture web context");
  return res.json();
}

export async function exportSessionMemoryMarkdown(sessionId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/memory/sessions/${sessionId}/export?format=markdown`);
  if (!res.ok) throw new Error("Failed to export memory");
  return res.text();
}
