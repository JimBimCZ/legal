import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DownloadButton } from "@/components/DownloadButton";
import { TEST_DOCUMENT, TEST_DOCUMENT_FILLED_VALUES } from "@/lib/documentTestFixtures";

// @react-pdf/renderer's real PDFDownloadLink generates a PDF via a web worker
// and browser Blob URLs, which don't exist in jsdom. We stub it so
// DownloadButton's own logic (the completeness gate and file naming) can be
// tested in isolation; DocumentPdf.test.tsx separately exercises the real PDF
// pipeline in a node environment.
const pdfDownloadLinkSpy = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  // DocumentPdf.tsx calls StyleSheet.create(...) at module scope, so the mock
  // needs a working stand-in even though we never render the document.
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

describe("DownloadButton", () => {
  beforeEach(() => {
    pdfDownloadLinkSpy.mockClear();
  });

  it("shows a disabled placeholder and a hint when the document is incomplete", () => {
    render(<DownloadButton documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.getByText("Download PDF")).toBeInTheDocument();
    expect(screen.getByText(/Fill in all fields/)).toBeInTheDocument();
    expect(pdfDownloadLinkSpy).not.toHaveBeenCalled();
  });

  it("does not render a real download link when incomplete", () => {
    render(<DownloadButton documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders a real download link once every field is filled", () => {
    render(<DownloadButton documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />);
    expect(screen.getByRole("link", { name: "Download PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/Fill in all fields/)).not.toBeInTheDocument();
  });

  it("is still incomplete if exactly one field is left blank", () => {
    render(
      <DownloadButton
        documentDetail={TEST_DOCUMENT}
        values={{ ...TEST_DOCUMENT_FILLED_VALUES, effectiveDate: "" }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("treats a whitespace-only field as incomplete", () => {
    render(
      <DownloadButton
        documentDetail={TEST_DOCUMENT}
        values={{ ...TEST_DOCUMENT_FILLED_VALUES, effectiveDate: "   " }}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("names the file after the document, slugified", () => {
    render(<DownloadButton documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />);
    expect(screen.getByRole("link")).toHaveAttribute("data-filename", "test-agreement.pdf");
  });

  it("slugifies a document name with punctuation, spacing, and case variance", () => {
    render(
      <DownloadButton
        documentDetail={{ ...TEST_DOCUMENT, name: "  Röck & Röll Agreement, LLC.  " }}
        values={TEST_DOCUMENT_FILLED_VALUES}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "data-filename",
      expect.stringMatching(/^r.*ck.*agreement-llc\.pdf$/),
    );
  });

  it("falls back to 'document' when the document name has no alphanumeric characters", () => {
    render(
      <DownloadButton
        documentDetail={{ ...TEST_DOCUMENT, name: "***" }}
        values={TEST_DOCUMENT_FILLED_VALUES}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("data-filename", "document.pdf");
  });

  it("passes a DocumentPdf built from the current document and values to PDFDownloadLink", () => {
    render(<DownloadButton documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />);
    expect(pdfDownloadLinkSpy).toHaveBeenCalledTimes(1);
    const passedProps = pdfDownloadLinkSpy.mock.calls[0][0];
    expect(passedProps.document.props.documentDetail).toEqual(TEST_DOCUMENT);
    expect(passedProps.document.props.values).toEqual(TEST_DOCUMENT_FILLED_VALUES);
  });
});
