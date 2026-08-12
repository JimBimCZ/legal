import type { DocumentDetail } from "@/types/document";

export async function fetchDocumentDetail(documentId: string): Promise<DocumentDetail> {
  const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);

  if (!response.ok) {
    throw new Error("Failed to load the document. Please try again.");
  }

  return response.json();
}
