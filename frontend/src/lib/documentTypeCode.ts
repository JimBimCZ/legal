/**
 * Short mono "docket code" shown on catalog/saved-document cards, in the
 * same spirit as a real matter or filing reference. Keyed by the catalog
 * entry's id (the template filename) since that's stable and unique -
 * deriving initials from the display name would collide (e.g. "Design
 * Partner Agreement" and "Data Processing Agreement" both reduce to "DPA").
 */
const DOCUMENT_TYPE_CODES: Record<string, string> = {
  "Mutual-NDA.md": "NDA",
  "CSA.md": "CSA",
  "Design-Partner-Agreement.md": "DESIGN",
  "SLA.md": "SLA",
  "PSA.md": "PSA",
  "DPA.md": "DPA",
  "Software-License-Agreement.md": "LICENSE",
  "Partnership-Agreement.md": "PARTNER",
  "Pilot-Agreement.md": "PILOT",
  "BAA.md": "BAA",
  "AI-Addendum.md": "ADDENDUM",
};

export function documentTypeCode(documentTypeId: string): string {
  return DOCUMENT_TYPE_CODES[documentTypeId] ?? documentTypeId.replace(/\.md$/, "").split("-")[0].toUpperCase();
}
