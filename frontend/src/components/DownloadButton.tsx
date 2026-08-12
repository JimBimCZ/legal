"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";

import { DocumentPdf } from "@/components/DocumentPdf";
import { isDocumentComplete } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
}

const buttonClassName =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

const disabledClassName =
  "inline-flex cursor-not-allowed items-center justify-center rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500";

interface DownloadButtonProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

export function DownloadButton({ documentDetail, values }: DownloadButtonProps) {
  if (!isDocumentComplete(documentDetail.fields, values)) {
    return (
      <div>
        <span className={disabledClassName}>Download PDF</span>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Fill in all fields to enable download.
        </p>
      </div>
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
