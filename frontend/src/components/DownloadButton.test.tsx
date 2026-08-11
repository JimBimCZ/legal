import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadButton } from "@/components/DownloadButton";
import type { MutualNdaFields } from "@/types/nda";

// @react-pdf/renderer's real PDFDownloadLink generates a PDF via a web worker
// and browser Blob URLs, which don't exist in jsdom. We stub it so
// DownloadButton's own logic (the completeness gate and file naming) can be
// tested in isolation; NdaPdfDocument.test.tsx separately exercises the real
// PDF pipeline in a node environment.
const pdfDownloadLinkSpy = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  // NdaPdfDocument.tsx calls StyleSheet.create(...) at module scope, so the
  // mock needs a working stand-in even though we never render the document.
  StyleSheet: { create: (styles: unknown) => styles },
  Document: "document-stub",
  Page: "page-stub",
  Text: "text-stub",
  View: "view-stub",
  PDFDownloadLink: (props: {
    document: ReactElement;
    fileName: string;
    className: string;
    children: (state: { loading: boolean }) => ReactNode;
  }) => {
    pdfDownloadLinkSpy(props);
    return (
      <a href="#" className={props.className} data-filename={props.fileName}>
        {props.children({ loading: false })}
      </a>
    );
  },
}));

const FILLED_FIELDS: MutualNdaFields = {
  party1Name: "Acme Inc.",
  party1Address: "123 Main St, San Francisco, CA 94105",
  party2Name: "Globex Corporation",
  party2Address: "456 Market St, New York, NY 10001",
  effectiveDate: "2026-03-05",
  purpose: "evaluating a potential business relationship",
  mndaTerm: "2 years from the Effective Date",
  termOfConfidentiality: "3 years after expiration or termination of this MNDA",
  governingLaw: "Delaware",
  jurisdiction: "New Castle County, Delaware",
};

const EMPTY_FIELDS: MutualNdaFields = {
  party1Name: "",
  party1Address: "",
  party2Name: "",
  party2Address: "",
  effectiveDate: "",
  purpose: "",
  mndaTerm: "",
  termOfConfidentiality: "",
  governingLaw: "",
  jurisdiction: "",
};

describe("DownloadButton", () => {
  beforeEach(() => {
    pdfDownloadLinkSpy.mockClear();
  });

  it("shows a disabled placeholder and a hint when the NDA is incomplete", () => {
    render(<DownloadButton fields={EMPTY_FIELDS} />);
    expect(screen.getByText("Download PDF")).toBeInTheDocument();
    expect(screen.getByText(/Fill in all cover page fields/)).toBeInTheDocument();
    expect(pdfDownloadLinkSpy).not.toHaveBeenCalled();
  });

  it("does not render a real download link when incomplete", () => {
    render(<DownloadButton fields={EMPTY_FIELDS} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a real download link once every cover page field is filled", () => {
    render(<DownloadButton fields={FILLED_FIELDS} />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/Fill in all cover page fields/)).not.toBeInTheDocument();
  });

  it("is still incomplete if exactly one field is left blank", () => {
    render(<DownloadButton fields={{ ...FILLED_FIELDS, jurisdiction: "" }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("treats a whitespace-only field as incomplete", () => {
    render(<DownloadButton fields={{ ...FILLED_FIELDS, jurisdiction: "   " }} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("names the file after both parties, slugified", () => {
    render(<DownloadButton fields={FILLED_FIELDS} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "data-filename",
      "Mutual-NDA-acme-inc-globex-corporation.pdf",
    );
  });

  it("slugifies party names with punctuation, spacing, and case variance", () => {
    render(
      <DownloadButton
        fields={{ ...FILLED_FIELDS, party1Name: "  Röck & Röll, LLC.  ", party2Name: "B2B Co." }}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "data-filename",
      expect.stringMatching(/^Mutual-NDA-.+-b2b-co\.pdf$/),
    );
  });

  it("falls back to 'party' when a party name has no alphanumeric characters", () => {
    render(<DownloadButton fields={{ ...FILLED_FIELDS, party1Name: "***" }} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "data-filename",
      "Mutual-NDA-party-globex-corporation.pdf",
    );
  });

  it("passes an NdaPdfDocument built from the current fields to PDFDownloadLink", () => {
    render(<DownloadButton fields={FILLED_FIELDS} />);
    expect(pdfDownloadLinkSpy).toHaveBeenCalledTimes(1);
    const passedProps = pdfDownloadLinkSpy.mock.calls[0][0];
    expect(passedProps.document.props.fields).toEqual(FILLED_FIELDS);
  });
});
