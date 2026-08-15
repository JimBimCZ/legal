"use client";

import { useEffect, useState } from "react";

import { DocumentMenu } from "@/components/DocumentMenu";
import { cardButtonClassName, cardGridClassName, cardTitleClassName } from "@/lib/cardStyles";
import { documentTypeCode } from "@/lib/documentTypeCode";
import { fetchSavedDocuments } from "@/lib/savedDocumentsApi";
import type { SavedDocumentSummary } from "@/types/savedDocument";

interface DashboardProps {
  onResume: (documentId: number) => void;
  onCreateNew: (documentTypeId: string, documentTypeName: string) => void;
  refreshKey: number;
  actionError: string | null;
}

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
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="ui-eyebrow">{showMenu ? "Pick a template" : "Pick up where you left off"}</p>
          <h2 className="type-display mt-2 text-2xl text-heading sm:text-3xl">Your Documents</h2>
        </div>
        {/* Starting a document is the primary action; backing out of the
            template list is not, so the two states carry different weight. */}
        <button
          type="button"
          onClick={() => setShowMenu((current) => !current)}
          className={`ui-btn ${showMenu ? "ui-btn-quiet" : "ui-btn-primary"}`}
        >
          {showMenu ? "Cancel" : "+ New Document"}
        </button>
      </div>

      {actionError && (
        <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
          {actionError}
        </p>
      )}

      {showMenu && <DocumentMenu onSelect={handleCreateNew} />}

      {!showMenu && loadError && (
        <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
          {loadError}
        </p>
      )}

      {!showMenu && !loadError && !documents && <p className="ui-eyebrow">Loading your documents…</p>}

      {!showMenu && documents && documents.length === 0 && (
        <p className="max-w-md text-sm leading-relaxed text-ink-muted">
          You don&apos;t have any documents yet. Start one and the assistant will ask for what the
          template needs, a question at a time.
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
              <span className="ui-chip">{documentTypeCode(document.documentTypeId)}</span>
              <span className={cardTitleClassName}>{document.documentTypeName}</span>
              <span className="font-mono text-[11px] tracking-wide text-ink-muted">
                Updated {new Date(document.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
