import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { TEST_CATALOG, TEST_DOCUMENT, TEST_DOCUMENT_B } from "@/lib/documentTestFixtures";

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
const { fetchDocumentDetail, fetchDocumentCatalog } = vi.hoisted(() => ({
  fetchDocumentDetail: vi.fn(),
  fetchDocumentCatalog: vi.fn(),
}));

vi.mock("@/lib/chatApi", () => ({ sendChatMessage }));
vi.mock("@/lib/documentsApi", () => ({ fetchDocumentDetail, fetchDocumentCatalog }));

const { default: Home } = await import("@/app/page");

function previewRegion() {
  return screen.getByRole("heading", { name: "Document Preview" }).closest("section")!;
}

async function selectTestDocument(user: ReturnType<typeof userEvent.setup>) {
  fetchDocumentDetail.mockResolvedValueOnce(TEST_DOCUMENT);
  await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));
  await screen.findByRole("heading", { name: "Test Agreement Details" });
}

beforeEach(() => {
  sendChatMessage.mockReset();
  fetchDocumentDetail.mockReset();
  fetchDocumentCatalog.mockReset();
  fetchDocumentCatalog.mockResolvedValue(TEST_CATALOG);
});

describe("Home (menu-driven document creator flow)", () => {
  it("shows the document menu and a placeholder preview before a document is selected", async () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Legal Document Creator" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Test Agreement/ })).toBeInTheDocument();
    expect(
      within(previewRegion()).getByText(/Choose a document type to see a preview here/),
    ).toBeInTheDocument();
  });

  it("shows the chat and preview once a document is chosen from the menu", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await selectTestDocument(user);

    expect(screen.getByText(/let's fill in your Test Agreement/)).toBeInTheDocument();
    expect(within(previewRegion()).getAllByText("[Customer]").length).toBe(2);
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Test Agreement/ })).not.toBeInTheDocument();
  });

  it("shows a loading state while the selected document's details are being fetched", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: typeof TEST_DOCUMENT) => void;
    fetchDocumentDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));

    expect(await screen.findByText("Loading document…")).toBeInTheDocument();

    resolveFetch(TEST_DOCUMENT);
    await screen.findByRole("heading", { name: "Test Agreement Details" });
  });

  it("shows an error if the selected document's details fail to load", async () => {
    const user = userEvent.setup();
    fetchDocumentDetail.mockRejectedValueOnce(new Error("Failed to load the document."));

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));

    expect(await screen.findByText("Failed to load the document.")).toBeInTheDocument();
  });

  it("reflects field values returned by the chat live in the preview", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    sendChatMessage.mockResolvedValueOnce({
      reply: "Got it, when does it start?",
      selectedDocument: TEST_DOCUMENT.id,
      selectedDocumentName: TEST_DOCUMENT.name,
      fields: { customer: "Acme Inc." },
    });
    await user.type(screen.getByLabelText("Message"), "The customer is Acme Inc.{enter}");
    await screen.findByText("Got it, when does it start?");

    // "Acme Inc." appears twice: once in the Fields summary, once inline
    // where the "Customer" field is referenced in the document body.
    expect(within(previewRegion()).getAllByText("Acme Inc.").length).toBe(2);
    expect(within(previewRegion()).queryByText("[Customer]")).not.toBeInTheDocument();
    expect(within(previewRegion()).getAllByText("[Effective Date]").length).toBe(2);
  });

  it("enables the download link once every field is known, and disables it again if one is cleared", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    sendChatMessage.mockResolvedValueOnce({
      reply: "All set.",
      selectedDocument: TEST_DOCUMENT.id,
      selectedDocumentName: TEST_DOCUMENT.name,
      fields: { customer: "Acme Inc.", effectiveDate: "2026-03-05" },
    });
    await user.type(screen.getByLabelText("Message"), "Acme Inc., starting 2026-03-05{enter}");
    await screen.findByText("All set.");

    const link = screen.getByRole("link", { name: "Download PDF" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("data-filename", "test-agreement.pdf");

    sendChatMessage.mockResolvedValueOnce({
      reply: "Actually, who's the customer again?",
      selectedDocument: TEST_DOCUMENT.id,
      selectedDocumentName: TEST_DOCUMENT.name,
      fields: { customer: "", effectiveDate: "2026-03-05" },
    });
    await user.type(screen.getByLabelText("Message"), "Actually, remove the customer{enter}");
    await screen.findByText("Actually, who's the customer again?");

    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("switches to a different document when the chat resolves one mid-conversation", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await selectTestDocument(user);

    sendChatMessage.mockResolvedValueOnce({
      reply: "Switching you to an Other Test Agreement.",
      selectedDocument: TEST_DOCUMENT_B.id,
      selectedDocumentName: TEST_DOCUMENT_B.name,
      fields: {},
    });
    fetchDocumentDetail.mockResolvedValueOnce(TEST_DOCUMENT_B);
    await user.type(screen.getByLabelText("Message"), "Actually, I need the other one{enter}");

    await screen.findByRole("heading", { name: "Other Test Agreement Details" });
    expect(within(previewRegion()).getAllByText("[Vendor]").length).toBe(2);
    expect(within(previewRegion()).queryByText("[Customer]")).not.toBeInTheDocument();
  });

  it("ignores a stale document-detail response that resolves after a newer selection", async () => {
    const user = userEvent.setup();
    let resolveFirstFetch!: (value: typeof TEST_DOCUMENT) => void;
    fetchDocumentDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstFetch = resolve;
      }),
    );

    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Test Agreement/ }));
    await screen.findByText("Loading document…");

    sendChatMessage.mockResolvedValueOnce({
      reply: "Switching you to an Other Test Agreement.",
      selectedDocument: TEST_DOCUMENT_B.id,
      selectedDocumentName: TEST_DOCUMENT_B.name,
      fields: {},
    });
    fetchDocumentDetail.mockResolvedValueOnce(TEST_DOCUMENT_B);
    await user.type(screen.getByLabelText("Message"), "Actually, I need the other one{enter}");
    await screen.findByRole("heading", { name: "Other Test Agreement Details" });

    // The stale first fetch (for the document the user has already switched
    // away from) resolves last - it must not clobber the newer selection.
    resolveFirstFetch(TEST_DOCUMENT);

    expect(screen.getByRole("heading", { name: "Other Test Agreement Details" })).toBeInTheDocument();
    expect(within(previewRegion()).getAllByText("[Vendor]").length).toBe(2);
    expect(within(previewRegion()).queryByText("[Customer]")).not.toBeInTheDocument();
  });
});
