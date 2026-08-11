"use client";

import { useState } from "react";

import { DownloadButton } from "@/components/DownloadButton";
import { NdaForm } from "@/components/NdaForm";
import { NdaPreview } from "@/components/NdaPreview";
import { EMPTY_NDA_FIELDS, type NdaFieldKey } from "@/types/nda";

export default function Home() {
  const [fields, setFields] = useState(EMPTY_NDA_FIELDS);

  function handleFieldChange(key: NdaFieldKey, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Mutual NDA Creator
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Fill in the details below to generate a Mutual Non-Disclosure Agreement.
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-2">
        <section aria-labelledby="nda-form-heading" className="flex flex-col gap-4">
          <h2 id="nda-form-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Cover Page Details
          </h2>
          <NdaForm fields={fields} onFieldChange={handleFieldChange} />
        </section>

        <section
          aria-labelledby="nda-preview-heading"
          className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start"
        >
          <div className="flex items-center justify-between">
            <h2
              id="nda-preview-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              Document Preview
            </h2>
            <DownloadButton fields={fields} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <NdaPreview fields={fields} />
          </div>
        </section>
      </main>
    </div>
  );
}
