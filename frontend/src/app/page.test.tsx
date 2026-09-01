import { act, render, screen, within } from "@testing-library/react";
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
const { fetchDemo } = vi.hoisted(() => ({ fetchDemo: vi.fn() }));
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
vi.mock("@/lib/demoApi", () => ({ fetchDemo }));
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

const DEMO = {
  detail: TEST_DOCUMENT,
  fields: { customer: "Acme Corp" },
  messages: [
    { role: "assistant" as const, content: "Who are the two parties?" },
    { role: "user" as const, content: "Acme Corp and Beta Industries." },
    { role: "assistant" as const, content: "Got it. What's the purpose?" },
  ],
  isExample: true,
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

  fetchDemo.mockReset();
  fetchDocumentCatalog.mockResolvedValue(TEST_CATALOG);
  fetchSavedDocuments.mockResolvedValue([]);
  fetchDemo.mockResolvedValue(DEMO);
});

describe("Home (auth-gated multi-user flow)", () => {
  it("lands a signed-out visitor on the seeded example document", async () => {
    fetchCurrentUser.mockResolvedValue(null);
    render(<Home />);

    expect(await screen.findByRole("heading", { name: TEST_DOCUMENT.name })).toBeInTheDocument();
    // Its own chat transcript, so the mechanic is visible and not just the output.
    expect(screen.getByText("Who are the two parties?")).toBeInTheDocument();
    // Marked, because it renders in the same styling as a real agreement.
    expect(screen.getByText("Example")).toBeInTheDocument();
    // Not asked to sign in before they have looked at anything.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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

  it("logs out back to the example document", async () => {
    const user = userEvent.setup();
    fetchCurrentUser.mockResolvedValue(USER);
    signOut.mockResolvedValue(undefined);

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(signOut).toHaveBeenCalled();
    expect(await screen.findByText("Example")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("Home (signed-out demo)", () => {
  beforeEach(() => {
    fetchCurrentUser.mockResolvedValue(null);
  });

  async function renderDemo() {
    render(<Home />);
    await screen.findByText("Example");
  }

  it("asks the visitor to sign in when they try to send a message", async () => {
    const user = userEvent.setup();
    await renderDemo();

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue with github/i })).toHaveAttribute(
      "href",
      "/api/auth/github",
    );
  });

  it("asks the visitor to sign in when they type into the chat", async () => {
    const user = userEvent.setup();
    await renderDemo();

    await user.type(screen.getByLabelText("Message"), "a");

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("asks the visitor to sign in when they try to download", async () => {
    const user = userEvent.setup();
    await renderDemo();

    await user.click(screen.getByRole("button", { name: /download pdf/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("sends the header Sign in straight to GitHub, without a dialog in the way", async () => {
    await renderDemo();

    // Asking outright should not be answered with a dialog offering to ask.
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/api/auth/github",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never sends a turn to the server while locked", async () => {
    const user = userEvent.setup();
    await renderDemo();

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(sendDocumentMessage).not.toHaveBeenCalled();
  });

  it("lets the visitor dismiss and keep reading", async () => {
    const user = userEvent.setup();
    await renderDemo();

    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: /keep looking around/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Example")).toBeInTheDocument();
    // And the header route out stays available, un-modalled.
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("prompts on its own after the reading delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await renderDemo();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-arm the timer once dismissed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await renderDemo();

      await act(async () => {
        vi.advanceTimersByTime(20_000);
      });
      await user.click(screen.getByRole("button", { name: /keep looking around/i }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });

      // Dismissing is an answer. Re-asking on a schedule would be nagging.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a failed sign-in round-trip in the modal", async () => {
    window.history.replaceState({}, "", "/?auth_error=state");
    await renderDemo();

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/expired/i)).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("still offers sign-in when the example fails to load", async () => {
    fetchDemo.mockRejectedValue(new Error("nope"));
    render(<Home />);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText(/couldn't be loaded/i)).toBeInTheDocument();
  });
});
