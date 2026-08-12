import type { DocumentFields, FieldDef } from "@/types/document";

export function fieldDisplayValue(
  fieldKey: string,
  fieldDefs: FieldDef[],
  values: DocumentFields,
): { text: string; filled: boolean } {
  const raw = (values[fieldKey] ?? "").trim();
  if (raw) return { text: raw, filled: true };
  const label = fieldDefs.find((f) => f.key === fieldKey)?.label ?? fieldKey;
  return { text: `[${label}]`, filled: false };
}

export function isDocumentComplete(fieldDefs: FieldDef[], values: DocumentFields): boolean {
  return fieldDefs.length > 0 && fieldDefs.every((f) => (values[f.key] ?? "").trim().length > 0);
}
