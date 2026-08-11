"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";

import { isNdaComplete } from "@/lib/buildDocument";
import { NdaPdfDocument } from "@/components/NdaPdfDocument";
import type { MutualNdaFields } from "@/types/nda";

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "party";
}

const buttonClassName =
  "inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";

const disabledClassName =
  "inline-flex cursor-not-allowed items-center justify-center rounded-md bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500";

export function DownloadButton({ fields }: { fields: MutualNdaFields }) {
  if (!isNdaComplete(fields)) {
    return (
      <div>
        <span className={disabledClassName}>Download PDF</span>
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Fill in all cover page fields to enable download.
        </p>
      </div>
    );
  }

  const fileName = `Mutual-NDA-${slugify(fields.party1Name)}-${slugify(fields.party2Name)}.pdf`;

  return (
    <PDFDownloadLink
      document={<NdaPdfDocument fields={fields} />}
      fileName={fileName}
      className={buttonClassName}
    >
      {({ loading }) => (loading ? "Preparing PDF..." : "Download PDF")}
    </PDFDownloadLink>
  );
}
