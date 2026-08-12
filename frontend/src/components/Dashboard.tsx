"use client";

import { useEffect, useState } from "react";

import { DocumentMenu } from "@/components/DocumentMenu";
import { cardButtonClassName, cardCodeClassName, cardGridClassName } from "@/lib/cardStyles";
import { documentTypeCode } from "@/lib/documentTypeCode";
import { fetchSavedDocuments } from "@/lib/savedDocumentsApi";
import type { SavedDocumentSummary } from "@/types/savedDocument";

interface DashboardProps {
  onResume: (documentId: number) => void;
  onCreateNew: (documentTypeId: string, documentTypeName: string) => void;
  refreshKey: number;
  actionError: string | null;
}

const newDocumentButtonClassName =
  "inline-flex items-center justify-center rounded-sm bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700";

export function Dashboard({ onResume, onCreateNew, refreshKey, actionError }: DashboardProps) {
  const [documents, setDocuments] = useState<SavedDocumentSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSavedDocuments()
      .then((docs) => {
        if (!cancelled) {
          setDocuments(docs);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load your documents.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  function handleCreateNew(documentTypeId: string, documentTypeName: string) {
    setShowMenu(false);
    onCreateNew(documentTypeId, documentTypeName);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <h2 className="font-display text-2xl tracking-tight text-heading">
          Your Documents
        </h2>
        <button
          type="button"
          onClick={() => setShowMenu((current) => !current)}
          className={newDocumentButtonClassName}
        >
          {showMenu ? "Cancel" : "+ New Document"}
        </button>
      </div>

      {actionError && <p className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}

      {showMenu && <DocumentMenu onSelect={handleCreateNew} />}

      {!showMenu && loadError && <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>}

      {!showMenu && !loadError && !documents && (
        <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
          Loading your documents…
        </p>
      )}

      {!showMenu && documents && documents.length === 0 && (
        <p className="text-sm text-ink-muted">
          You don&apos;t have any documents yet. Click &quot;+ New Document&quot; to get started.
        </p>
      )}

      {!showMenu && documents && documents.length > 0 && (
        <div className={cardGridClassName}>
          {documents.map((document) => (
            <button
              key={document.id}
              type="button"
              onClick={() => onResume(document.id)}
              className={cardButtonClassName}
            >
              <span className={cardCodeClassName}>{documentTypeCode(document.documentTypeId)}</span>
              <span className="font-display text-base leading-snug text-heading">
                {document.documentTypeName}
              </span>
              <span className="font-mono text-[11px] text-ink-muted">
                Updated {new Date(document.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
