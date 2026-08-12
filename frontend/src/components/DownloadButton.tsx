"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";

import { DocumentPdf } from "@/components/DocumentPdf";
import { isDocumentComplete, unfilledFieldCount } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
}

// Sits on the navy masthead, so both states are styled against a dark
// background rather than the light panels used elsewhere.
const buttonClassName =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400";

const disabledClassName =
  "inline-flex cursor-not-allowed items-center justify-center whitespace-nowrap rounded-sm bg-white/10 px-4 py-2 text-sm font-medium text-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400";

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
      className={buttonClassName}
    >
      {({ loading }) => (loading ? "Preparing PDF..." : "Download PDF")}
    </PDFDownloadLink>
  );
}
