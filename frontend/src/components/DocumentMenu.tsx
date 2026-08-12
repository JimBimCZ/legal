"use client";

import { useEffect, useState } from "react";

import { cardButtonClassName, cardCodeClassName, cardGridClassName } from "@/lib/cardStyles";
import { documentTypeCode } from "@/lib/documentTypeCode";
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
    return (
      <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
        Loading document types…
      </p>
    );
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
          <span className={cardCodeClassName}>{documentTypeCode(entry.id)}</span>
          <span className="font-display text-base leading-snug text-heading">
            {entry.name}
          </span>
          <span className="text-xs leading-relaxed text-ink-muted">{entry.description}</span>
        </button>
      ))}
    </div>
  );
}
