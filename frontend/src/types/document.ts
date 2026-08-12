export interface DocumentSummary {
  id: string;
  name: string;
  description: string;
}

export interface FieldDef {
  key: string;
  label: string;
}

export type DocumentRun =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "field"; text: string; fieldKey: string };

export interface DocumentBlock {
  level: 1 | 2;
  number: string;
  heading: string | null;
  runs: DocumentRun[];
}

export interface DocumentDetail extends DocumentSummary {
  fields: FieldDef[];
  blocks: DocumentBlock[];
  sourceAttribution: string;
}

/** Field values keyed by FieldDef.key, for whichever document is currently selected. */
export type DocumentFields = Record<string, string>;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
