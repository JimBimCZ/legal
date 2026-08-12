"use client";

import { useEffect, useState } from "react";

import { cardButtonClassName, cardGridClassName } from "@/lib/cardStyles";
import { fetchDocumentCatalog } from "@/lib/documentsApi";
import type { DocumentSummary } from "@/types/document";

interface DocumentMenuProps {
  onSelect: (documentId: string, documentName: string) => void;
}

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
    <div className={cardGridClassName}>
      {catalog.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onSelect(entry.id, entry.name)}
          className={cardButtonClassName}
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
