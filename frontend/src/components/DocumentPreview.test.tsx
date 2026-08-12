import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocumentPreview } from "@/components/DocumentPreview";
import { TEST_DOCUMENT, TEST_DOCUMENT_FILLED_VALUES } from "@/lib/documentTestFixtures";

describe("DocumentPreview", () => {
  it("renders the document name as the title", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.getByRole("heading", { name: "Test Agreement" })).toBeInTheDocument();
  });

  it("shows a bracketed placeholder for each unfilled field", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={{}} />);
    // "[Customer]" appears twice: once in the Fields summary, once inline
    // where the "Customer" field is referenced in the document body.
    expect(screen.getAllByText("[Customer]").length).toBe(2);
    expect(screen.getAllByText("[Effective Date]").length).toBe(2);
  });

  it("shows the actual value once a field is filled in", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />);
    expect(screen.queryByText("[Customer]")).not.toBeInTheDocument();
    expect(screen.getAllByText("Acme Inc.").length).toBe(2);
  });

  it("renders every block numbered, with nested blocks indented under level 2", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.getByText("1.")).toBeInTheDocument();
    const nested = screen.getByText("1.1.");
    expect(nested).toBeInTheDocument();
    expect(nested.closest("p")).toHaveClass("ml-6");
  });

  it("renders block headings", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.getByText(/Introduction/)).toBeInTheDocument();
    expect(screen.getByText(/Sub-clause/)).toBeInTheDocument();
  });

  it("interpolates a filled field into the body text", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />);
    expect(screen.getByText(/This agreement is between/)).toBeInTheDocument();
  });

  it("renders the source attribution", () => {
    render(<DocumentPreview documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.getByText(/Common Paper Test Agreement/)).toBeInTheDocument();
  });
});
