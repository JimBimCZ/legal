import type { DocumentFields } from "@/types/document";
import type { SavedDocumentDetail, SavedDocumentSummary } from "@/types/savedDocument";

export async function fetchSavedDocuments(): Promise<SavedDocumentSummary[]> {
  const response = await fetch("/api/saved-documents");
  if (!response.ok) {
    throw new Error("Failed to load your documents. Please try again.");
  }
  return response.json();
}

export async function createSavedDocument(documentTypeId: string): Promise<SavedDocumentDetail> {
  const response = await fetch("/api/saved-documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentTypeId }),
  });
  if (!response.ok) {
    throw new Error("Failed to create the document. Please try again.");
  }
  return response.json();
}

export async function fetchSavedDocument(id: number): Promise<SavedDocumentDetail> {
  const response = await fetch(`/api/saved-documents/${id}`);
  if (!response.ok) {
    throw new Error("Failed to load the document. Please try again.");
  }
  return response.json();
}

export interface SendDocumentMessageResult {
  reply: string;
  selectedDocument: string;
  selectedDocumentName: string;
  fields: DocumentFields;
  updatedAt: string;
}

export async function sendDocumentMessage(
  savedDocumentId: number,
  content: string,
): Promise<SendDocumentMessageResult> {
  const response = await fetch(`/api/saved-documents/${savedDocumentId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error("Failed to reach the AI assistant. Please try again.");
  }
  return response.json();
}
