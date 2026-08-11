import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Stub the PDF pipeline for this jsdom-based flow test — real PDF generation
// (web worker + Blob URLs) is exercised separately in
// NdaPdfDocument.test.tsx under a node environment.
vi.mock("@react-pdf/renderer", () => ({
  // NdaPdfDocument.tsx calls StyleSheet.create(...) at module scope, so the
  // mock needs a working stand-in even though we never render the document.
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

const { default: Home } = await import("@/app/page");

const COMPLETE_INPUT = {
  "Party 1 Name": "Acme Inc.",
  "Party 1 Address": "123 Main St, San Francisco, CA 94105",
  "Party 2 Name": "Globex Corporation",
  "Party 2 Address": "456 Market St, New York, NY 10001",
  Purpose: "evaluating a potential business relationship",
  "MNDA Term": "2 years from the Effective Date",
  "Term of Confidentiality": "3 years after expiration or termination of this MNDA",
  "Governing Law (State)": "Delaware",
  Jurisdiction: "New Castle County, Delaware",
};

async function fillTextFields(user: ReturnType<typeof userEvent.setup>) {
  for (const [label, value] of Object.entries(COMPLETE_INPUT)) {
    await user.type(screen.getByLabelText(label), value);
  }
}

function previewRegion() {
  return screen.getByRole("heading", { name: "Document Preview" }).closest("section")!;
}

describe("Home (full NDA creator flow)", () => {
  it("renders the form and an empty-state preview with a disabled download on load", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: "Mutual NDA Creator" })).toBeInTheDocument();
    expect(screen.getByLabelText("Party 1 Name")).toHaveValue("");
    expect(within(previewRegion()).getByText("[Party 1 Name]")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(screen.getByText(/Fill in all cover page fields/)).toBeInTheDocument();
  });

  it("reflects a single field edit live in the preview", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByLabelText("Party 1 Name"), "Acme Inc.");

    expect(within(previewRegion()).getByText("Acme Inc.")).toBeInTheDocument();
    expect(within(previewRegion()).queryByText("[Party 1 Name]")).not.toBeInTheDocument();
    // Other fields are untouched and still show their placeholder.
    expect(within(previewRegion()).getByText("[Party 2 Name]")).toBeInTheDocument();
  });

  it("keeps the download button disabled until every field is filled", async () => {
    const user = userEvent.setup();
    render(<Home />);

    const entries = Object.entries(COMPLETE_INPUT);
    for (const [label, value] of entries.slice(0, -1)) {
      await user.type(screen.getByLabelText(label), value);
    }
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();

    const [lastLabel, lastValue] = entries.at(-1)!;
    await user.type(screen.getByLabelText(lastLabel), lastValue);
    // Every text field is now filled, but Effective Date is still empty.
    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("enables the download link once every field, including the date, is filled", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await fillTextFields(user);
    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");

    const link = screen.getByRole("link", { name: "Download PDF" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("data-filename", "Mutual-NDA-acme-inc-globex-corporation.pdf");
    // "March 5, 2026" appears both in the cover page row and interpolated
    // into Section 5's body ({{effectiveDate}}).
    expect(within(previewRegion()).getAllByText("March 5, 2026").length).toBeGreaterThanOrEqual(1);
  });

  it("disables the download link again if a previously-filled field is cleared", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await fillTextFields(user);
    await user.type(screen.getByLabelText("Effective Date"), "2026-03-05");
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Party 1 Name"));

    expect(screen.queryByRole("link", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(within(previewRegion()).getByText("[Party 1 Name]")).toBeInTheDocument();
  });

  it("does not let editing one field bleed into another field's value", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByLabelText("Party 1 Name"), "Acme Inc.");
    await user.type(screen.getByLabelText("Party 2 Name"), "Globex Corporation");

    expect(screen.getByLabelText("Party 1 Name")).toHaveValue("Acme Inc.");
    expect(screen.getByLabelText("Party 2 Name")).toHaveValue("Globex Corporation");
  });
});
