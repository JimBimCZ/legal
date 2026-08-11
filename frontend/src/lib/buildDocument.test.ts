import { describe, expect, it } from "vitest";

import { buildCoverPageRows, buildStandardTerms, isNdaComplete } from "@/lib/buildDocument";
import { COVER_PAGE_FIELDS, STANDARD_TERMS_SECTIONS } from "@/lib/mutualNdaContent";
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

describe("buildCoverPageRows", () => {
  it("returns one row per cover page field, in declared order", () => {
    const rows = buildCoverPageRows(EMPTY_NDA_FIELDS);
    expect(rows.map((row) => row.key)).toEqual(COVER_PAGE_FIELDS.map((f) => f.key));
  });

  it("marks empty fields as unfilled and brackets the label as a placeholder", () => {
    const rows = buildCoverPageRows(EMPTY_NDA_FIELDS);
    const party1 = rows.find((row) => row.key === "party1Name")!;
    expect(party1.filled).toBe(false);
    expect(party1.value).toBe("[Party 1 Name]");
  });

  it("treats whitespace-only input as unfilled", () => {
    const rows = buildCoverPageRows({ ...EMPTY_NDA_FIELDS, party1Name: "   " });
    const party1 = rows.find((row) => row.key === "party1Name")!;
    expect(party1.filled).toBe(false);
  });

  it("marks filled fields as filled and passes through their raw value", () => {
    const rows = buildCoverPageRows(FILLED_FIELDS);
    const party1 = rows.find((row) => row.key === "party1Name")!;
    expect(party1.filled).toBe(true);
    expect(party1.value).toBe("Acme Inc.");
  });

  it("formats the effective date as a long-form date", () => {
    const rows = buildCoverPageRows(FILLED_FIELDS);
    const date = rows.find((row) => row.key === "effectiveDate")!;
    expect(date.value).toBe("March 5, 2026");
    expect(date.filled).toBe(true);
  });

  it("falls back to the raw string when the effective date is not parseable", () => {
    const rows = buildCoverPageRows({ ...EMPTY_NDA_FIELDS, effectiveDate: "not-a-date" });
    const date = rows.find((row) => row.key === "effectiveDate")!;
    expect(date.value).toBe("not-a-date");
    expect(date.filled).toBe(true);
  });
});

describe("buildStandardTerms", () => {
  it("returns one rendered section per standard-terms section, numbered in order", () => {
    const sections = buildStandardTerms(EMPTY_NDA_FIELDS);
    expect(sections.map((s) => s.number)).toEqual(STANDARD_TERMS_SECTIONS.map((s) => s.number));
  });

  it("renders bold markdown markers as bold text runs without the ** delimiters", () => {
    const sections = buildStandardTerms(EMPTY_NDA_FIELDS);
    const intro = sections.find((s) => s.number === 1)!;
    const boldRun = intro.runs.find((run) => run.kind === "text" && run.bold);
    expect(boldRun).toBeDefined();
    expect((boldRun as { text: string }).text).toBe("Introduction");
    expect(intro.runs.some((run) => run.kind === "text" && run.text.includes("**"))).toBe(false);
  });

  it("renders unfilled field tokens as bracketed placeholders", () => {
    const sections = buildStandardTerms(EMPTY_NDA_FIELDS);
    const termSection = sections.find((s) => s.number === 5)!;
    const fieldRun = termSection.runs.find(
      (run) => run.kind === "field" && run.text === "[Effective Date]",
    );
    expect(fieldRun).toBeDefined();
    expect((fieldRun as { filled: boolean }).filled).toBe(false);
  });

  it("interpolates filled field values into the body, formatting dates", () => {
    const sections = buildStandardTerms(FILLED_FIELDS);
    const termSection = sections.find((s) => s.number === 5)!;
    const dateRun = termSection.runs.find(
      (run) => run.kind === "field" && run.text === "March 5, 2026",
    );
    expect(dateRun).toBeDefined();
    expect((dateRun as { filled: boolean }).filled).toBe(true);
  });

  it("repeats the same field token consistently across multiple occurrences in one section", () => {
    const sections = buildStandardTerms(FILLED_FIELDS);
    const governingLawSection = sections.find((s) => s.number === 9)!;
    const governingLawRuns = governingLawSection.runs.filter(
      (run) => run.kind === "field" && run.text === "Delaware",
    );
    // {{governingLaw}} appears twice in section 9's body.
    expect(governingLawRuns.length).toBe(2);
  });

  it("preserves surrounding plain text around tokens", () => {
    const sections = buildStandardTerms(FILLED_FIELDS);
    const disclaimer = sections.find((s) => s.number === 8)!;
    const joined = disclaimer.runs.map((run) => run.text).join("");
    expect(joined).toContain("ALL CONFIDENTIAL INFORMATION IS PROVIDED");
  });
});

describe("isNdaComplete", () => {
  it("is false when every field is empty", () => {
    expect(isNdaComplete(EMPTY_NDA_FIELDS)).toBe(false);
  });

  it("is false when only some fields are filled", () => {
    expect(isNdaComplete({ ...EMPTY_NDA_FIELDS, party1Name: "Acme Inc." })).toBe(false);
  });

  it("is false when a required field is whitespace-only", () => {
    const almostComplete: MutualNdaFields = { ...FILLED_FIELDS, jurisdiction: "   " };
    expect(isNdaComplete(almostComplete)).toBe(false);
  });

  it("is true when every field has a non-whitespace value", () => {
    expect(isNdaComplete(FILLED_FIELDS)).toBe(true);
  });
});
