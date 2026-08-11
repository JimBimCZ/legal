import type { MutualNdaFields } from "@/types/nda";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  reply: string;
  fields: MutualNdaFields;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  fields: MutualNdaFields,
): Promise<ChatTurnResult> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, fields }),
  });

  if (!response.ok) {
    throw new Error("Failed to reach the AI assistant. Please try again.");
  }

  return response.json();
}
