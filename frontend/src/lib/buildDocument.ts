import { COVER_PAGE_FIELDS, STANDARD_TERMS_SECTIONS } from "@/lib/mutualNdaContent";
import type { MutualNdaFields, NdaFieldKey } from "@/types/nda";

export type DocumentRun =
  | { kind: "text"; text: string; bold: boolean }
  | { kind: "field"; text: string; filled: boolean };

export interface RenderedSection {
  number: number;
  runs: DocumentRun[];
}

export interface CoverPageRow {
  key: NdaFieldKey;
  label: string;
  value: string;
  filled: boolean;
}

const TOKEN_PATTERN = /(\*\*.+?\*\*|\{\{\w+\}\})/g;

function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fieldDisplayValue(key: NdaFieldKey, fields: MutualNdaFields): { text: string; filled: boolean } {
  const raw = fields[key].trim();
  if (!raw) {
    const label = COVER_PAGE_FIELDS.find((f) => f.key === key)?.label ?? key;
    return { text: `[${label}]`, filled: false };
  }
  return { text: key === "effectiveDate" ? formatDate(raw) : raw, filled: true };
}

function tokenizeBody(body: string, fields: MutualNdaFields): DocumentRun[] {
  return body
    .split(TOKEN_PATTERN)
    .filter((chunk) => chunk.length > 0)
    .map((chunk): DocumentRun => {
      const fieldMatch = chunk.match(/^\{\{(\w+)\}\}$/);
      if (fieldMatch) {
        const { text, filled } = fieldDisplayValue(fieldMatch[1] as NdaFieldKey, fields);
        return { kind: "field", text, filled };
      }
      const boldMatch = chunk.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        return { kind: "text", text: boldMatch[1], bold: true };
      }
      return { kind: "text", text: chunk, bold: false };
    });
}

export function buildStandardTerms(fields: MutualNdaFields): RenderedSection[] {
  return STANDARD_TERMS_SECTIONS.map((section) => ({
    number: section.number,
    runs: tokenizeBody(section.body, fields),
  }));
}

export function buildCoverPageRows(fields: MutualNdaFields): CoverPageRow[] {
  return COVER_PAGE_FIELDS.map((field) => {
    const { text, filled } = fieldDisplayValue(field.key, fields);
    return { key: field.key, label: field.label, value: text, filled };
  });
}

export function isNdaComplete(fields: MutualNdaFields): boolean {
  return COVER_PAGE_FIELDS.every((field) => fields[field.key].trim().length > 0);
}
