import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { DocumentMenu } from "@/components/DocumentMenu";

const { fetchDocumentCatalog } = vi.hoisted(() => ({ fetchDocumentCatalog: vi.fn() }));

vi.mock("@/lib/documentsApi", () => ({ fetchDocumentCatalog }));

const CATALOG = [
  { id: "Mutual-NDA.md", name: "Mutual Non-Disclosure Agreement", description: "A mutual NDA." },
  { id: "CSA.md", name: "Cloud Service Agreement", description: "A standard CSA." },
];

beforeEach(() => {
  fetchDocumentCatalog.mockReset();
});

describe("DocumentMenu", () => {
  it("shows a loading state before the catalog resolves", () => {
    fetchDocumentCatalog.mockReturnValue(new Promise(() => {}));
    render(<DocumentMenu onSelect={vi.fn()} />);
    expect(screen.getByText(/Loading document types/)).toBeInTheDocument();
  });

  it("renders a button per catalog entry with its name and description", async () => {
    fetchDocumentCatalog.mockResolvedValue(CATALOG);
    render(<DocumentMenu onSelect={vi.fn()} />);

    for (const entry of CATALOG) {
      expect(await screen.findByRole("button", { name: new RegExp(entry.name) })).toHaveTextContent(
        entry.description,
      );
    }
  });

  it("calls onSelect with the document id and name when a card is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    fetchDocumentCatalog.mockResolvedValue(CATALOG);
    render(<DocumentMenu onSelect={onSelect} />);

    await user.click(await screen.findByRole("button", { name: /Cloud Service Agreement/ }));

    expect(onSelect).toHaveBeenCalledWith("CSA.md", "Cloud Service Agreement");
  });

  it("shows an error message if the catalog fails to load", async () => {
    fetchDocumentCatalog.mockRejectedValue(new Error("Failed to load the document types."));
    render(<DocumentMenu onSelect={vi.fn()} />);

    expect(await screen.findByText("Failed to load the document types.")).toBeInTheDocument();
  });
});
