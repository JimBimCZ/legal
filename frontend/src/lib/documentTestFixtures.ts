import type { DocumentDetail, DocumentFields, DocumentSummary } from "@/types/document";

export const TEST_CATALOG: DocumentSummary[] = [
  {
    id: "Test-Doc.md",
    name: "Test Agreement",
    description: "A test document for exercising the generic document UI.",
  },
];

export const TEST_DOCUMENT: DocumentDetail = {
  id: "Test-Doc.md",
  name: "Test Agreement",
  description: "A test document for exercising the generic document UI.",
  fields: [
    { key: "customer", label: "Customer" },
    { key: "effectiveDate", label: "Effective Date" },
  ],
  blocks: [
    {
      level: 1,
      number: "1",
      heading: "Introduction",
      runs: [
        { kind: "text", text: ". This agreement is between ", bold: false },
        { kind: "field", text: "Customer", fieldKey: "customer" },
        { kind: "text", text: " and starts on ", bold: false },
        { kind: "field", text: "Effective Date", fieldKey: "effectiveDate" },
        { kind: "text", text: ".", bold: false },
      ],
    },
    {
      level: 2,
      number: "1.1",
      heading: "Sub-clause.",
      runs: [{ kind: "text", text: "A nested provision with no fields.", bold: false }],
    },
  ],
  sourceAttribution:
    "Adapted from the Common Paper Test Agreement template, licensed under CC BY 4.0.",
};

export const TEST_DOCUMENT_FILLED_VALUES: DocumentFields = {
  customer: "Acme Inc.",
  effectiveDate: "2026-03-05",
};

export const TEST_DOCUMENT_B: DocumentDetail = {
  id: "Test-Doc-B.md",
  name: "Other Test Agreement",
  description: "A second test document, distinct from TEST_DOCUMENT, for exercising switches.",
  fields: [{ key: "vendor", label: "Vendor" }],
  blocks: [
    {
      level: 1,
      number: "1",
      heading: "Scope",
      runs: [
        { kind: "text", text: ". Services are provided by ", bold: false },
        { kind: "field", text: "Vendor", fieldKey: "vendor" },
        { kind: "text", text: ".", bold: false },
      ],
    },
  ],
  sourceAttribution:
    "Adapted from the Common Paper Other Test Agreement template, licensed under CC BY 4.0.",
};
