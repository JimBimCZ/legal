import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NdaPreview } from "@/components/NdaPreview";
import { STANDARD_TERMS_SECTIONS } from "@/lib/mutualNdaContent";
import { EMPTY_NDA_FIELDS, type MutualNdaFields } from "@/types/nda";

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

describe("NdaPreview", () => {
  it("renders the document title and cover page field labels", () => {
    render(<NdaPreview fields={EMPTY_NDA_FIELDS} />);
    expect(screen.getByRole("heading", { name: "Mutual Non-Disclosure Agreement" })).toBeInTheDocument();
    expect(screen.getByText("Party 1 Name")).toBeInTheDocument();
    expect(screen.getByText("Jurisdiction")).toBeInTheDocument();
  });

  it("shows bracketed placeholders for empty cover page fields", () => {
    render(<NdaPreview fields={EMPTY_NDA_FIELDS} />);
    expect(screen.getByText("[Party 1 Name]")).toBeInTheDocument();
  });

  it("shows the actual value once a cover page field is filled in", () => {
    render(<NdaPreview fields={FILLED_FIELDS} />);
    expect(screen.queryByText("[Party 1 Name]")).not.toBeInTheDocument();
    expect(screen.getByText("Acme Inc.")).toBeInTheDocument();
  });

  it("formats the effective date for display", () => {
    render(<NdaPreview fields={FILLED_FIELDS} />);
    // "March 5, 2026" appears both in the cover page row and interpolated
    // into Section 5's body ({{effectiveDate}}), so there are two matches.
    expect(screen.getAllByText("March 5, 2026").length).toBeGreaterThanOrEqual(1);
  });

  it("renders every standard terms section, numbered", () => {
    render(<NdaPreview fields={EMPTY_NDA_FIELDS} />);
    for (const section of STANDARD_TERMS_SECTIONS) {
      expect(screen.getByText(`${section.number}.`)).toBeInTheDocument();
    }
  });

  it("renders the source attribution", () => {
    render(<NdaPreview fields={EMPTY_NDA_FIELDS} />);
    expect(screen.getByText(/Common Paper Mutual Non-Disclosure Agreement/)).toBeInTheDocument();
  });

  it("interpolates a filled field into the body text of the standard terms", () => {
    render(<NdaPreview fields={FILLED_FIELDS} />);
    // {{purpose}} appears in Section 1's body, rendered as a run alongside plain text.
    expect(screen.getAllByText("evaluating a potential business relationship").length).toBeGreaterThan(0);
  });
});
