"use client";

import { useEffect, useState } from "react";

import { fetchDocumentCatalog } from "@/lib/documentsApi";
import type { DocumentSummary } from "@/types/document";

interface DocumentMenuProps {
  onSelect: (documentId: string, documentName: string) => void;
}

const cardClassName =
  "flex flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900";

export function DocumentMenu({ onSelect }: DocumentMenuProps) {
  const [catalog, setCatalog] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDocumentCatalog()
      .then((entries) => {
        if (!cancelled) setCatalog(entries);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load the document types.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!catalog) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading document types…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {catalog.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onSelect(entry.id, entry.name)}
          className={cardClassName}
        >
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {entry.name}
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{entry.description}</span>
        </button>
      ))}
    </div>
  );
}
