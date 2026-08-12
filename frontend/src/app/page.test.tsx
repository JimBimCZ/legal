import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { TEST_DOCUMENT } from "@/lib/documentTestFixtures";

// Stub the PDF pipeline for this jsdom-based flow test — real PDF generation
// (web worker + Blob URLs) is exercised separately in DocumentPdf.test.tsx
// under a node environment.
vi.mock("@react-pdf/renderer", () => ({
  // DocumentPdf.tsx calls StyleSheet.create(...) at module scope, so the mock
  // needs a working stand-in even though we never render the document.
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

const { sendChatMessage } = vi.hoisted(() => ({ sendChatMessage: vi.fn() }));
const { fetchDocumentDetail } = vi.hoisted(() => ({ fetchDocumentDetail: vi.fn() }));

vi.mock("@/lib/chatApi", () => ({ sendChatMessage }));
vi.mock("@/lib/documentsApi", () => ({ fetchDocumentDetail }));

const { default: Home } = await import("@/app/page");

function previewRegion() {
  return screen.getByRole("heading", { name: "Document Preview" }).closest("section")!;
}

async function selectTestDocument(user: ReturnType<typeof userEvent.setup>) {
  sendChatMessage.mockResolvedValueOnce({
    reply: "Sure, let's set up a Test Agreement.",
    selectedDocument: TEST_DOCUMENT.id,
    selectedDocumentName: TEST_DOCUMENT.name,
    fields: {},
  });
  fetchDocumentDetail.mockResolvedValueOnce(TEST_DOCUMENT);
  await user.type(screen.getByLabelText("Message"), "I need a test agreement{enter}");
  await screen.findByRole("heading", { name: "Document Preview" });
}

beforeEach(() => {
  sendChatMessage.mockReset();
  fetchDocumentDetail.mockReset();
});

describe("Home (chat-driven document creator flow)", () => {
  it("shows only the chat before a document is selected", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Legal Document Creator" })).toBeInTheDocument();
    expect(screen.getByText(/choose a document to get started/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Document Preview" })).not.toBeInTheDocument();
  });

  it("shows the form and preview once the chat selects a document", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await selectTestDocument(user);

    expect(screen.getByLabelText("Customer")).toHaveValue("");
    expect(within(previewRegion()).getAllByText("[Customer]").length).toBe(2);
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.queryByText(/choose a document to get started/)).not.toBeInTheDocument();
  });

  it("shows a loading state while the selected document's details are being fetched", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: typeof TEST_DOCUMENT) => void;
    sendChatMessage.mockResolvedValueOnce({
      reply: "One sec.",
      selectedDocument: TEST_DOCUMENT.id,
      selectedDocumentName: TEST_DOCUMENT.name,
      fields: {},
    });
    fetchDocumentDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<Home />);
    await user.type(screen.getByLabelText("Message"), "I need a test agreement{enter}");

    expect(await screen.findByText("Loading document…")).toBeInTheDocument();

    resolveFetch(TEST_DOCUMENT);
    await screen.findByRole("heading", { name: "Document Preview" });
  });

  it("shows an error if the selected document's details fail to load", async () => {
    const user = userEvent.setup();
    sendChatMessage.mockResolvedValueOnce({
      reply: "One sec.",
      selectedDocument: TEST_DOCUMENT.id,
      selectedDocumentName: TEST_DOCUMENT.name,
      fields: {},
    });
    fetchDocumentDetail.mockRejectedValueOnce(new Error("Failed to load the document."));

    render(<Home />);
    await user.type(screen.getByLabelText("Message"), "I need a test agreement{enter}");

    expect(await screen.findByText("Failed to load the document.")).toBeInTheDocument();
  });

  it("reflects a single field edit live in the preview", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    await user.type(screen.getByLabelText("Customer"), "Acme Inc.");

    // "Acme Inc." appears twice: once in the Fields summary, once inline
    // where the "Customer" field is referenced in the document body.
    expect(within(previewRegion()).getAllByText("Acme Inc.").length).toBe(2);
    expect(within(previewRegion()).queryByText("[Customer]")).not.toBeInTheDocument();
    expect(within(previewRegion()).getAllByText("[Effective Date]").length).toBe(2);
  });

  it("enables the download link once every field is filled", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    await user.type(screen.getByLabelText("Customer"), "Acme Inc.");
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");

    const link = screen.getByRole("link", { name: "Download PDF" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("data-filename", "test-agreement.pdf");
  });

  it("disables the download link again if a previously-filled field is cleared", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    await user.type(screen.getByLabelText("Customer"), "Acme Inc.");
    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Customer"));

    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(within(previewRegion()).getAllByText("[Customer]").length).toBe(2);
  });

  it("does not let editing one field bleed into another field's value", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    await user.type(screen.getByLabelText("Customer"), "Acme Inc.");
    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");

    expect(screen.getByLabelText("Customer")).toHaveValue("Acme Inc.");
    expect(screen.getByLabelText("Effective Date")).toHaveValue("2026-03-05");
  });
});
