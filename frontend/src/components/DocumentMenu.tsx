"use client";

import { useEffect, useState } from "react";

import { cardButtonClassName, cardGridClassName, cardTitleClassName } from "@/lib/cardStyles";
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
    return <p className="text-sm font-medium text-ember-ink">{error}</p>;
  }

  if (!catalog) {
    return <p className="groove-eyebrow">Loading document types…</p>;
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
          <span className="groove-chip">{documentTypeCode(entry.id)}</span>
          <span className={cardTitleClassName}>{entry.name}</span>
          <span className="text-sm leading-relaxed text-ink-muted">{entry.description}</span>
        </button>
      ))}
    </div>
  );
}
