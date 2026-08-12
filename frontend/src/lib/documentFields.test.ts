import { describe, expect, it } from "vitest";

import { fieldDisplayValue, isDocumentComplete } from "@/lib/documentFields";
import { TEST_DOCUMENT } from "@/lib/documentTestFixtures";

describe("fieldDisplayValue", () => {
  it("returns a bracketed placeholder using the field's label when empty", () => {
    expect(fieldDisplayValue("customer", TEST_DOCUMENT.fields, {})).toEqual({
      text: "[Customer]",
      filled: false,
    });
  });

  it("returns the trimmed value when filled", () => {
    expect(
      fieldDisplayValue("customer", TEST_DOCUMENT.fields, { customer: "  Acme Inc.  " }),
    ).toEqual({ text: "Acme Inc.", filled: true });
  });

  it("treats a whitespace-only value as unfilled", () => {
    expect(fieldDisplayValue("customer", TEST_DOCUMENT.fields, { customer: "   " })).toEqual({
      text: "[Customer]",
      filled: false,
    });
  });

  it("falls back to the raw key as the label if the field isn't defined", () => {
    expect(fieldDisplayValue("unknownKey", TEST_DOCUMENT.fields, {})).toEqual({
      text: "[unknownKey]",
      filled: false,
    });
  });
});

describe("isDocumentComplete", () => {
  it("is false when any field is empty", () => {
    expect(isDocumentComplete(TEST_DOCUMENT.fields, { customer: "Acme Inc." })).toBe(false);
  });

  it("is true only once every field has a non-whitespace value", () => {
    expect(
      isDocumentComplete(TEST_DOCUMENT.fields, {
        customer: "Acme Inc.",
        effectiveDate: "2026-03-05",
      }),
    ).toBe(true);
  });

  it("is false when a document has no fields at all", () => {
    expect(isDocumentComplete([], {})).toBe(false);
  });
});
