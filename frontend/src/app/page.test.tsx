import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { TEST_CATALOG, TEST_DOCUMENT } from "@/lib/documentTestFixtures";

// Stub the PDF pipeline for this jsdom-based flow test — real PDF generation
// (web worker + Blob URLs) is exercised separately in DocumentPdf.test.tsx
// under a node environment.
vi.mock("@react-pdf/renderer", () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Document: "document-stub",
  Page: "page-stub",
  Text: "text-stub",
  View: "view-stub",
  PDFDownloadLink: (props: {
    fileName: string;
    className: string;
    children: (state: { loading: boolean }) => ReactNode;
  }) => (
    <a href="#" className={props.className} data-filename={props.fileName}>
      {props.children({ loading: false })}
    </a>
  ),
}));

const { fetchCurrentUser, signOut, deleteAccount } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
}));
const { fetchDocumentDetail, fetchDocumentCatalog } = vi.hoisted(() => ({
  fetchDocumentDetail: vi.fn(),
  fetchDocumentCatalog: vi.fn(),
}));
const { fetchSavedDocuments, createSavedDocument, fetchSavedDocument, sendDocumentMessage } = vi.hoisted(
  () => ({
    fetchSavedDocuments: vi.fn(),
    createSavedDocument: vi.fn(),
    fetchSavedDocument: vi.fn(),
    sendDocumentMessage: vi.fn(),
  }),
);

vi.mock("@/lib/authApi", () => ({ fetchCurrentUser, signOut, deleteAccount }));
vi.mock("@/lib/documentsApi", () => ({ fetchDocumentDetail, fetchDocumentCatalog }));
vi.mock("@/lib/savedDocumentsApi", () => ({
  fetchSavedDocuments,
  createSavedDocument,
  fetchSavedDocument,
  sendDocumentMessage,
}));

const { default: Home } = await import("@/app/page");

const USER = {
  id: 1,
  email: "user@example.com",
  github_login: "octocat",
  created_at: "2026-01-01 00:00:00",
};

const SAVED_DOCUMENT = {
  id: 7,
  documentTypeId: TEST_DOCUMENT.id,
  documentTypeName: TEST_DOCUMENT.name,
  fields: {},
  messages: [{ role: "assistant" as const, content: "Great, let's fill in your Test Agreement." }],
  createdAt: "2026-01-01 00:00:00",
  updatedAt: "2026-01-01 00:00:00",
};

beforeEach(() => {
  fetchCurrentUser.mockReset();
  deleteAccount.mockReset();
  signOut.mockReset();
  fetchDocumentDetail.mockReset();
  fetchDocumentCatalog.mockReset();
  fetchSavedDocuments.mockReset();
  createSavedDocument.mockReset();
  fetchSavedDocument.mockReset();
  sendDocumentMessage.mockReset();

  fetchDocumentCatalog.mockResolvedValue(TEST_CATALOG);
  fetchSavedDocuments.mockResolvedValue([]);
});

describe("Home (auth-gated multi-user flow)", () => {
  it("shows the sign-in screen when there is no active session", async () => {
    fetchCurrentUser.mockResolvedValue(null);
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "Legal Document Creator" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /continue with github/i }),
    ).toBeInTheDocument();
  });

  it("goes straight to the dashboard when a session already exists", async () => {
    fetchCurrentUser.mockResolvedValue(USER);
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "Your Documents" })).toBeInTheDocument();
    expect(screen.getByText(USER.email)).toBeInTheDocument();
  });

  it("shows an empty state on the dashboard with no saved documents", async () => {
    fetchCurrentUser.mockResolvedValue(USER);
    render(<Home />);

    expect(await screen.findByText(/don't have any documents yet/)).toBeInTheDocument();
  });

  it("creates a new document from the dashboard menu and enters the creator", async () => {
    const user = userEvent.setup();
    fetchCurrentUser.mockResolvedValue(USER);
    createSavedDocument.mockResolvedValue(SAVED_DOCUMENT);
    fetchDocumentDetail.mockResolvedValue(TEST_DOCUMENT);

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "+ New Document" }));
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));

    expect(createSavedDocument).toHaveBeenCalledWith("Test-Doc.md");
    expect(await screen.findByRole("heading", { name: "Test Agreement Details" })).toBeInTheDocument();
    expect(screen.getByText("Great, let's fill in your Test Agreement.")).toBeInTheDocument();
  });

  it("resumes an existing saved document with its persisted messages and fields", async () => {
    const user = userEvent.setup();
    fetchCurrentUser.mockResolvedValue(USER);
    fetchSavedDocuments.mockResolvedValue([SAVED_DOCUMENT]);
    fetchSavedDocument.mockResolvedValue({
      ...SAVED_DOCUMENT,
      fields: { customer: "Acme Inc." },
      messages: [
        { role: "assistant", content: "Great, let's fill in your Test Agreement." },
        { role: "user", content: "The customer is Acme Inc." },
        { role: "assistant", content: "Got it, when does it start?" },
      ],
    });
    fetchDocumentDetail.mockResolvedValue(TEST_DOCUMENT);

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));

    expect(fetchSavedDocument).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Got it, when does it start?")).toBeInTheDocument();
    const previewRegion = screen.getByRole("heading", { name: "Document Preview" }).closest("section")!;
    expect(within(previewRegion).getAllByText("Acme Inc.").length).toBeGreaterThan(0);
  });

  it("returns to the dashboard via My Documents and refreshes the list", async () => {
    const user = userEvent.setup();
    fetchCurrentUser.mockResolvedValue(USER);
    createSavedDocument.mockResolvedValue(SAVED_DOCUMENT);
    fetchDocumentDetail.mockResolvedValue(TEST_DOCUMENT);

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "+ New Document" }));
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));
    await screen.findByRole("heading", { name: "Test Agreement Details" });

    fetchSavedDocuments.mockClear();
    await user.click(screen.getByRole("button", { name: "My Documents" }));

    expect(await screen.findByRole("heading", { name: "Your Documents" })).toBeInTheDocument();
    expect(fetchSavedDocuments).toHaveBeenCalled();
  });

  it("logs out back to the sign-in screen", async () => {
    const user = userEvent.setup();
    fetchCurrentUser.mockResolvedValue(USER);
    signOut.mockResolvedValue(undefined);

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(signOut).toHaveBeenCalled();
    expect(
      await screen.findByRole("link", { name: /continue with github/i }),
    ).toBeInTheDocument();
  });
});
