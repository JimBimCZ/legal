"use client";

import { useEffect, useState } from "react";

import { DocumentMenu } from "@/components/DocumentMenu";
import { cardButtonClassName, cardGridClassName } from "@/lib/cardStyles";
import { fetchSavedDocuments } from "@/lib/savedDocumentsApi";
import type { SavedDocumentSummary } from "@/types/savedDocument";

interface DashboardProps {
  onResume: (documentId: number) => void;
  onCreateNew: (documentTypeId: string, documentTypeName: string) => void;
  refreshKey: number;
  actionError: string | null;
}

const newDocumentButtonClassName =
  "inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900";

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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Your Documents</h2>
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
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading your documents…</p>
      )}

      {!showMenu && documents && documents.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {document.documentTypeName}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Last updated {new Date(document.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
