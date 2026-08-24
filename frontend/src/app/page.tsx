"use client";

import { useEffect, useRef, useState } from "react";

import { AuthScreen } from "@/components/AuthScreen";
import { Dashboard } from "@/components/Dashboard";
import { DocumentChat } from "@/components/DocumentChat";
import { DocumentPreview } from "@/components/DocumentPreview";
import { DownloadButton } from "@/components/DownloadButton";
import { FieldRule } from "@/components/FieldRule";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchCurrentUser, signOut } from "@/lib/authApi";
import { fetchDocumentDetail } from "@/lib/documentsApi";
import { createSavedDocument, fetchSavedDocument } from "@/lib/savedDocumentsApi";
import type { User } from "@/types/auth";
import type { ChatMessage, DocumentDetail, DocumentFields } from "@/types/document";
import type { SavedDocumentDetail } from "@/types/savedDocument";

type View = "loading" | "auth" | "dashboard" | "creator";

const linkButtonClassName = "ui-link ui-eyebrow";

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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas">
        <FieldRule variant="mark" filled={1} total={1} className="w-24" />
        <p className="ui-eyebrow">Loading…</p>
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
      {/* A hairline rule instead of a solid bar: in a monochrome system a heavy
          masthead spends the strongest mark on chrome, leaving nothing for the
          primary action or the filled meter. */}
      <header className="border-b border-line bg-paper">
        {/* Three columns rather than justify-between so the download button is
            optically centred in the masthead regardless of how wide the title
            block or the signed-in email happen to be. Narrow screens can't fit
            all three side by side, so there the button drops to its own
            full-width row beneath the title and actions. The switch happens at
            `lg` rather than `sm` because the signed-in email only appears at
            the same breakpoint - going three-wide any earlier makes the title
            and both action links wrap. */}
        <div className="mx-auto grid max-w-6xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-6 py-4 lg:grid-cols-[1fr_auto_1fr]">
          <div>
            {/* The meter with every tick struck - the same mark that tracks
                progress on the document itself. */}
            <FieldRule variant="mark" filled={1} total={1} className="mb-2.5 w-24" />
            <h1 className="type-display text-base text-heading lg:text-lg">
              Legal Document Creator
            </h1>
            <p className="mt-0.5 hidden text-xs text-ink-muted lg:block">
              {view === "creator"
                ? "Answer a question at a time. The document fills itself in."
                : "Pick a template, then talk your way through it."}
            </p>
          </div>
          <div className="order-last col-span-2 justify-self-center lg:order-none lg:col-span-1">
            {view === "creator" && documentDetail && (
              <DownloadButton documentDetail={documentDetail} values={fields} />
            )}
          </div>
          <div className="flex items-center justify-self-end gap-3 lg:gap-5">
            {view === "creator" && (
              <button type="button" onClick={handleBackToDashboard} className={linkButtonClassName}>
                My Documents
              </button>
            )}
            {/* Held back to `xl`: at `lg` the third column has just appeared and
                the email's width pushes both action links onto two lines. */}
            <span className="hidden font-mono text-[11px] text-ink-muted xl:inline">
              {currentUser?.email}
            </span>
            <button type="button" onClick={handleLogout} className={linkButtonClassName}>
              Log out
            </button>
            <ThemeToggle />
          </div>
        </div>

      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
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
            <section aria-labelledby="document-chat-heading" className="flex flex-col gap-3">
              <h2 id="document-chat-heading" className="ui-eyebrow">
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
              className="flex flex-col gap-3 lg:sticky lg:top-8 lg:self-start"
            >
              <h2 id="document-preview-heading" className="ui-eyebrow">
                Document Preview
              </h2>
              {documentDetail ? (
                <DocumentPreview documentDetail={documentDetail} values={fields} />
              ) : (
                <div className="ui-panel p-6">
                  {isLoadingDocument ? (
                    <p className="ui-eyebrow">Loading document…</p>
                  ) : documentError ? (
                    <p className="text-sm font-medium text-flag-ink">{documentError}</p>
                  ) : null}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
