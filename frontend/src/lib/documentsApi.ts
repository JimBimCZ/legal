import type { DocumentDetail, DocumentSummary } from "@/types/document";

export async function fetchDocumentCatalog(): Promise<DocumentSummary[]> {
  const response = await fetch("/api/documents");

  if (!response.ok) {
    throw new Error("Failed to load the document types. Please try again.");
  }

  return response.json();
}

export async function fetchDocumentDetail(documentId: string): Promise<DocumentDetail> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);

  if (!response.ok) {
    throw new Error("Failed to load the document. Please try again.");
  }

  return response.json();
}
