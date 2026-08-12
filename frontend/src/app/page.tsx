"use client";

import { useRef, useState } from "react";

import { DocumentChat } from "@/components/DocumentChat";
import { DocumentMenu } from "@/components/DocumentMenu";
import { DocumentPlaceholder } from "@/components/DocumentPlaceholder";
import { DocumentPreview } from "@/components/DocumentPreview";
import { DownloadButton } from "@/components/DownloadButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchDocumentDetail } from "@/lib/documentsApi";
import type { DocumentDetail, DocumentFields } from "@/types/document";

export default function Home() {
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [selectedDocumentName, setSelectedDocumentName] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [fields, setFields] = useState<DocumentFields>({});
  // The chat can re-select a different document mid-conversation, kicking off
  // another fetchDocumentDetail before an earlier one has resolved - track
  // which selection is current so a stale, out-of-order response can't
  // clobber state set by a newer one.
  const latestSelection = useRef(0);

  async function handleDocumentSelected(documentId: string, documentName: string) {
    const selection = ++latestSelection.current;
    setSelectedDocument(documentId);
    setSelectedDocumentName(documentName);
    setDocumentDetail(null);
    setDocumentError(null);
    setFields({});
    setIsLoadingDocument(true);
    try {
      const detail = await fetchDocumentDetail(documentId);
      if (selection === latestSelection.current) setDocumentDetail(detail);
    } catch (err) {
      if (selection === latestSelection.current) {
        setDocumentError(err instanceof Error ? err.message : "Failed to load the document.");
      }
    } finally {
      if (selection === latestSelection.current) setIsLoadingDocument(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Legal Document Creator
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Choose a document type, then chat with the AI assistant to fill it in.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <section aria-labelledby="document-chat-heading" className="flex flex-col gap-4">
            <h2
              id="document-chat-heading"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {selectedDocument ? `${selectedDocumentName} Details` : "Choose a Document Type"}
            </h2>
            {selectedDocument ? (
              <DocumentChat
                selectedDocument={selectedDocument}
                selectedDocumentName={selectedDocumentName}
                fields={fields}
                onFieldsChange={setFields}
                onDocumentSelected={handleDocumentSelected}
              />
            ) : (
              <DocumentMenu onSelect={handleDocumentSelected} />
            )}
          </section>

          <section
            aria-labelledby="document-preview-heading"
            className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start"
          >
            <div className="flex items-center justify-between">
              <h2
                id="document-preview-heading"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                Document Preview
              </h2>
              {documentDetail && <DownloadButton documentDetail={documentDetail} values={fields} />}
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
              {documentDetail ? (
                <DocumentPreview documentDetail={documentDetail} values={fields} />
              ) : isLoadingDocument ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading document…</p>
              ) : documentError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{documentError}</p>
              ) : (
                <DocumentPlaceholder />
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
