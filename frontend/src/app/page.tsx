"use client";

import { useEffect, useRef, useState } from "react";

import { AuthScreen } from "@/components/AuthScreen";
import { Dashboard } from "@/components/Dashboard";
import { DocumentChat } from "@/components/DocumentChat";
import { DocumentPreview } from "@/components/DocumentPreview";
import { DownloadButton } from "@/components/DownloadButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchCurrentUser, signOut } from "@/lib/authApi";
import { fetchDocumentDetail } from "@/lib/documentsApi";
import { createSavedDocument, fetchSavedDocument } from "@/lib/savedDocumentsApi";
import type { User } from "@/types/auth";
import type { ChatMessage, DocumentDetail, DocumentFields } from "@/types/document";
import type { SavedDocumentDetail } from "@/types/savedDocument";

type View = "loading" | "auth" | "dashboard" | "creator";

const linkButtonClassName =
  "font-mono text-xs uppercase tracking-widest text-white/70 transition-colors hover:text-yellow-400";

export default function Home() {
  const [view, setView] = useState<View>("loading");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [savedDocumentId, setSavedDocumentId] = useState<number | null>(null);
  const [documentTypeId, setDocumentTypeId] = useState<string | null>(null);
  const [documentTypeName, setDocumentTypeName] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [documentDetail, setDocumentDetail] = useState<DocumentDetail | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [fields, setFields] = useState<DocumentFields>({});
  // A document's catalog detail can be re-fetched if the chat resolves a
  // different document type mid-conversation - track which fetch is current
  // so a stale, out-of-order response can't clobber a newer one.
  const latestDetailFetch = useRef(0);

  useEffect(() => {
    fetchCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        setView(user ? "dashboard" : "auth");
      })
      .catch(() => setView("auth"));
  }, []);

  async function loadDocumentDetail(documentId: string) {
    const fetchId = ++latestDetailFetch.current;
    setDocumentDetail(null);
    setDocumentError(null);
    setIsLoadingDocument(true);
    try {
      const detail = await fetchDocumentDetail(documentId);
      if (fetchId === latestDetailFetch.current) setDocumentDetail(detail);
    } catch (err) {
      if (fetchId === latestDetailFetch.current) {
        setDocumentError(err instanceof Error ? err.message : "Failed to load the document.");
      }
    } finally {
      if (fetchId === latestDetailFetch.current) setIsLoadingDocument(false);
    }
  }

  function enterCreator(saved: SavedDocumentDetail) {
    setSavedDocumentId(saved.id);
    setDocumentTypeId(saved.documentTypeId);
    setDocumentTypeName(saved.documentTypeName);
    setInitialMessages(saved.messages);
    setFields(saved.fields);
    setView("creator");
    void loadDocumentDetail(saved.documentTypeId);
  }

  async function handleCreateNew(newDocumentTypeId: string) {
    setDashboardError(null);
    try {
      const saved = await createSavedDocument(newDocumentTypeId);
      enterCreator(saved);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Failed to create the document.");
    }
  }

  // DocumentMenu's onSelect (and therefore Dashboard's onCreateNew) passes
  // both id and name, but the id alone is enough to create the saved
  // document - the server returns the authoritative name.

  async function handleResume(id: number) {
    setDashboardError(null);
    try {
      const saved = await fetchSavedDocument(id);
      enterCreator(saved);
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : "Failed to load the document.");
    }
  }

  function handleDocumentTypeChanged(newTypeId: string, newTypeName: string) {
    setDocumentTypeId(newTypeId);
    setDocumentTypeName(newTypeName);
    void loadDocumentDetail(newTypeId);
  }

  function handleBackToDashboard() {
    setSavedDocumentId(null);
    setDocumentTypeId(null);
    setDocumentTypeName(null);
    setDocumentDetail(null);
    setFields({});
    setInitialMessages([]);
    setDashboardRefreshKey((key) => key + 1);
    setView("dashboard");
  }

  async function handleLogout() {
    await signOut();
    setCurrentUser(null);
    handleBackToDashboard();
    setView("auth");
  }

  if (view === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center bg-canvas">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (view === "auth") {
    return (
      <div className="flex flex-1 flex-col bg-canvas">
        <AuthScreen
          onAuthenticated={(user) => {
            setCurrentUser(user);
            setView("dashboard");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      <header className="border-b border-navy-950 bg-navy-950 px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl tracking-tight text-white">
              Legal Document Creator
            </h1>
            <p className="mt-1 text-xs text-white/60">
              {view === "creator"
                ? "Chat with the AI assistant to fill in your document."
                : "Choose a document type, then chat with the AI assistant to fill it in."}
            </p>
          </div>
          <div className="flex items-center gap-5">
            {view === "creator" && (
              <button type="button" onClick={handleBackToDashboard} className={linkButtonClassName}>
                My Documents
              </button>
            )}
            <span className="hidden font-mono text-xs text-white/50 sm:inline">{currentUser?.email}</span>
            <button type="button" onClick={handleLogout} className={linkButtonClassName}>
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8">
        {view === "dashboard" && (
          <Dashboard
            onResume={handleResume}
            onCreateNew={handleCreateNew}
            refreshKey={dashboardRefreshKey}
            actionError={dashboardError}
          />
        )}

        {view === "creator" && savedDocumentId !== null && documentTypeId !== null && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <section aria-labelledby="document-chat-heading" className="flex flex-col gap-4">
              <h2
                id="document-chat-heading"
                className="font-mono text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-500"
              >
                {documentTypeName} Details
              </h2>
              <DocumentChat
                savedDocumentId={savedDocumentId}
                initialMessages={initialMessages}
                currentDocumentTypeId={documentTypeId}
                onFieldsChange={setFields}
                onDocumentTypeChanged={handleDocumentTypeChanged}
              />
            </section>

            <section
              aria-labelledby="document-preview-heading"
              className="flex flex-col gap-4 lg:sticky lg:top-8 lg:self-start"
            >
              <h2
                id="document-preview-heading"
                className="font-mono text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-500"
              >
                Document Preview
              </h2>
              {documentDetail ? (
                <DocumentPreview documentDetail={documentDetail} values={fields} />
              ) : (
                <div className="rounded-sm border border-line bg-paper p-6 shadow-sm">
                  {isLoadingDocument ? (
                    <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
                      Loading document…
                    </p>
                  ) : documentError ? (
                    <p className="text-sm text-red-600 dark:text-red-400">{documentError}</p>
                  ) : null}
                </div>
              )}
              {documentDetail && (
                <div className="flex justify-end">
                  <DownloadButton documentDetail={documentDetail} values={fields} />
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
