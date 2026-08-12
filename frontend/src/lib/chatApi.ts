import type { DocumentFields } from "@/types/document";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  reply: string;
  selectedDocument: string | null;
  selectedDocumentName: string | null;
  fields: DocumentFields;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  selectedDocument: string | null,
  fields: DocumentFields,
): Promise<ChatTurnResult> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, selectedDocument, fields }),
  });

  if (!response.ok) {
    throw new Error("Failed to reach the AI assistant. Please try again.");
  }

  return response.json();
}
