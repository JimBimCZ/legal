import type { ChatMessage, DocumentDetail, DocumentFields } from "@/types/document";

export interface Demo {
  detail: DocumentDetail;
  fields: DocumentFields;
  messages: ChatMessage[];
  isExample: boolean;
}

/**
 * The seeded document a signed-out visitor lands on.
 *
 * The only unauthenticated document endpoint. It returns the parsed document
 * alongside the seeded values in one payload, which is what lets
 * /api/documents/* stay gated - the demo needs exactly one document and has no
 * business being able to enumerate the rest.
 */
export async function fetchDemo(): Promise<Demo> {
  const response = await fetch("/api/demo");
  if (!response.ok) {
    throw new Error("Failed to load the example document.");
  }
  return response.json();
}
