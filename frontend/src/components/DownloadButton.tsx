"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";

import { DocumentPdf } from "@/components/DocumentPdf";
import { isDocumentComplete, unfilledFieldCount } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
}

// Sits on the masthead, so both states are styled against plum rather than the
// light panels used elsewhere. Enabled, it takes the marigold of a full sun -
// the preview's meter and this button unlock together, and it is the only
// place in the interface the accent appears as a fill.
const enabledClassName = "groove-btn groove-btn-sun";

const disabledClassName =
  "groove-btn cursor-not-allowed border-on-shell/20 bg-transparent text-on-shell/45 shadow-none";

interface DownloadButtonProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

export function DownloadButton({ documentDetail, values }: DownloadButtonProps) {
  if (!isDocumentComplete(documentDetail.fields, values)) {
    const remaining = unfilledFieldCount(documentDetail.fields, values);
    const hint =
      remaining === 0
        ? "This document has no fields to fill in."
        : `Fill in all fields to enable download — ${remaining} ${
            remaining === 1 ? "field" : "fields"
          } remaining.`;
    return (
      // aria-disabled rather than the `disabled` attribute so the control stays
      // focusable and keyboard users can reach it to hear why it's blocked.
      // `title` doubles as the accessible description, so the hint needs no
      // separate sr-only copy - that would just announce the reason twice.
      <button type="button" aria-disabled="true" title={hint} className={disabledClassName}>
        Download PDF
      </button>
    );
  }

  const fileName = `${slugify(documentDetail.name)}.pdf`;

  return (
    <PDFDownloadLink
      document={<DocumentPdf documentDetail={documentDetail} values={values} />}
      fileName={fileName}
      className={enabledClassName}
    >
      {({ loading }) => (loading ? "Preparing PDF..." : "Download PDF")}
    </PDFDownloadLink>
  );
}
