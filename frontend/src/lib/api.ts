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

export async function submitQuestion(query: string): Promise<GroundedAnswerResponse> {
  const res = await fetch(`${API_BASE_URL}/api/generate/pipeline/qa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(
      errorData.detail || "Failed to generate grounded answer"
    );
  }
  return res.json();
}
