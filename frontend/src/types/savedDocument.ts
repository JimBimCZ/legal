import type { ChatMessage, DocumentFields } from "./document";

export interface SavedDocumentSummary {
  id: number;
  documentTypeId: string;
  documentTypeName: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedDocumentDetail extends SavedDocumentSummary {
  fields: DocumentFields;
  messages: ChatMessage[];
}
