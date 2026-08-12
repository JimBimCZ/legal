import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { Dashboard } from "@/components/Dashboard";

const { fetchSavedDocuments } = vi.hoisted(() => ({ fetchSavedDocuments: vi.fn() }));
const { fetchDocumentCatalog } = vi.hoisted(() => ({ fetchDocumentCatalog: vi.fn() }));

vi.mock("@/lib/savedDocumentsApi", () => ({ fetchSavedDocuments }));
vi.mock("@/lib/documentsApi", () => ({ fetchDocumentCatalog }));

const CATALOG = [
  { id: "Mutual-NDA.md", name: "Mutual Non-Disclosure Agreement", description: "A mutual NDA." },
];

const SAVED_DOCUMENTS = [
  {
    id: 1,
    documentTypeId: "Mutual-NDA.md",
    documentTypeName: "Mutual Non-Disclosure Agreement",
    createdAt: "2026-01-01 00:00:00",
    updatedAt: "2026-01-02 00:00:00",
  },
];

beforeEach(() => {
  fetchSavedDocuments.mockReset();
  fetchDocumentCatalog.mockReset();
  fetchDocumentCatalog.mockResolvedValue(CATALOG);
});

describe("Dashboard", () => {
  it("shows an empty state when the user has no saved documents", async () => {
    fetchSavedDocuments.mockResolvedValue([]);
    render(<Dashboard onResume={vi.fn()} onCreateNew={vi.fn()} refreshKey={0} actionError={null} />);

    expect(await screen.findByText(/don't have any documents yet/)).toBeInTheDocument();
  });

  it("lists saved documents and calls onResume when one is clicked", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    fetchSavedDocuments.mockResolvedValue(SAVED_DOCUMENTS);

    render(<Dashboard onResume={onResume} onCreateNew={vi.fn()} refreshKey={0} actionError={null} />);
    await user.click(await screen.findByRole("button", { name: /Mutual Non-Disclosure Agreement/ }));

    expect(onResume).toHaveBeenCalledWith(1);
  });

  it("reveals the document menu and calls onCreateNew when a type is picked", async () => {
    const user = userEvent.setup();
    const onCreateNew = vi.fn();
    fetchSavedDocuments.mockResolvedValue([]);

    render(<Dashboard onResume={vi.fn()} onCreateNew={onCreateNew} refreshKey={0} actionError={null} />);
    await user.click(await screen.findByRole("button", { name: "+ New Document" }));
    await user.click(await screen.findByRole("button", { name: /Mutual Non-Disclosure Agreement/ }));

    expect(onCreateNew).toHaveBeenCalledWith("Mutual-NDA.md", "Mutual Non-Disclosure Agreement");
  });

  it("shows an action error passed from the parent", async () => {
    fetchSavedDocuments.mockResolvedValue([]);
    render(
      <Dashboard
        onResume={vi.fn()}
        onCreateNew={vi.fn()}
        refreshKey={0}
        actionError="Failed to create the document. Please try again."
      />,
    );

    expect(
      await screen.findByText("Failed to create the document. Please try again."),
    ).toBeInTheDocument();
  });

  it("re-fetches the list when refreshKey changes", async () => {
    fetchSavedDocuments.mockResolvedValue([]);
    const { rerender } = render(
      <Dashboard onResume={vi.fn()} onCreateNew={vi.fn()} refreshKey={0} actionError={null} />,
    );
    await screen.findByText(/don't have any documents yet/);
    expect(fetchSavedDocuments).toHaveBeenCalledTimes(1);

    rerender(<Dashboard onResume={vi.fn()} onCreateNew={vi.fn()} refreshKey={1} actionError={null} />);
    expect(fetchSavedDocuments).toHaveBeenCalledTimes(2);
  });
});
