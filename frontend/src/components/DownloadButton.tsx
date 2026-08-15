"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";

import { DocumentPdf } from "@/components/DocumentPdf";
import { isDocumentComplete, unfilledFieldCount } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
}

// Completion is solid ink, not colour: in a monochrome system the strongest
// mark available is already the filled one, so the preview's measure and this
// button reach it together. Blocked, it is a hairline outline - present and
// focusable, but plainly not yet the thing to press.
const enabledClassName = "ui-btn ui-btn-primary";

const disabledClassName = "ui-btn cursor-not-allowed border-line text-ink-faint";

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
