import { describe, expect, it } from "vitest";

import { COVER_PAGE_FIELDS, STANDARD_TERMS_SECTIONS } from "@/lib/mutualNdaContent";
import { EMPTY_NDA_FIELDS, type NdaFieldKey } from "@/types/nda";

const KNOWN_FIELD_KEYS = new Set<NdaFieldKey>(Object.keys(EMPTY_NDA_FIELDS) as NdaFieldKey[]);

describe("COVER_PAGE_FIELDS", () => {
  it("declares exactly one entry per MutualNdaFields key, with no duplicates", () => {
    const keys = COVER_PAGE_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(keys)).toEqual(KNOWN_FIELD_KEYS);
  });

  it("gives every field a non-empty label", () => {
    for (const field of COVER_PAGE_FIELDS) {
      expect(field.label.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("STANDARD_TERMS_SECTIONS", () => {
  it("is numbered sequentially starting at 1 with no gaps or duplicates", () => {
    const numbers = STANDARD_TERMS_SECTIONS.map((s) => s.number);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
  });

  it("gives every section a non-empty body", () => {
    for (const section of STANDARD_TERMS_SECTIONS) {
      expect(section.body.trim().length).toBeGreaterThan(0);
    }
  });

  it("only references {{token}} placeholders that map to a known cover-page field", () => {
    const tokenPattern = /\{\{(\w+)\}\}/g;
    for (const section of STANDARD_TERMS_SECTIONS) {
      for (const match of section.body.matchAll(tokenPattern)) {
        expect(KNOWN_FIELD_KEYS.has(match[1] as NdaFieldKey)).toBe(true);
      }
    }
  });

  it("has balanced ** bold markers within each section body", () => {
    for (const section of STANDARD_TERMS_SECTIONS) {
      const markerCount = (section.body.match(/\*\*/g) ?? []).length;
      expect(markerCount % 2).toBe(0);
    }
  });
});
