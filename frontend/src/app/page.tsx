"use client";

import { useState } from "react";

import { DocumentChat } from "@/components/DocumentChat";
import { DocumentFieldsForm } from "@/components/DocumentFieldsForm";
import { DocumentPreview } from "@/components/DocumentPreview";
import { DownloadButton } from "@/components/DownloadButton";
import { fetchDocumentDetail } from "@/lib/documentsApi";
import type { DocumentDetail, DocumentFields } from "@/types/document";

export default function Home() {
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [fields, setFields] = useState<DocumentFields>({});

  function handleFieldChange(key: string, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function handleDocumentSelected(documentId: string) {
    setSelectedDocument(documentId);
    setDocumentDetail(null);
    setDocumentError(null);
    setIsLoadingDocument(true);
    try {
      const detail = await fetchDocumentDetail(documentId);
      setDocumentDetail(detail);
    } catch (err) {
      setDocumentError(err instanceof Error ? err.message : "Failed to load the document.");
    } finally {
      setIsLoadingDocument(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Legal Document Creator
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Chat with the AI assistant to choose and fill in a legal document.
          </p>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        <section aria-labelledby="document-chat-heading" className="flex flex-col gap-4">
          <h2
            id="document-chat-heading"
            className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
          >
            Chat with the AI Assistant
          </h2>
          <DocumentChat
            selectedDocument={selectedDocument}
            fields={fields}
            onFieldsChange={setFields}
            onDocumentSelected={handleDocumentSelected}
          />
        </section>

        {!selectedDocument && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Chat with the assistant above to choose a document to get started.
          </p>
        )}

        {selectedDocument && isLoadingDocument && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading document…</p>
        )}

        {selectedDocument && documentError && (
          <p className="text-sm text-red-600 dark:text-red-400">{documentError}</p>
        )}

        {documentDetail && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section aria-labelledby="document-form-heading" className="flex flex-col gap-4">
              <h2
                id="document-form-heading"
                className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
              >
                {documentDetail.name} Details
              </h2>
              <DocumentFieldsForm
                fieldDefs={documentDetail.fields}
                values={fields}
                onFieldChange={handleFieldChange}
              />
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
                <DownloadButton documentDetail={documentDetail} values={fields} />
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
                <DocumentPreview documentDetail={documentDetail} values={fields} />
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
