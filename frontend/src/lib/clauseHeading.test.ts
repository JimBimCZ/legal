import { describe, expect, it } from "vitest";

import { headingSeparator } from "@/lib/clauseHeading";
import type { DocumentBlock } from "@/types/document";

function block(heading: string | null, firstRunText: string): DocumentBlock {
  return {
    level: 1,
    number: "1",
    heading,
    runs: [{ kind: "text", text: firstRunText, bold: false }],
  };
}

describe("headingSeparator", () => {
  it("adds nothing when the clause text already opens with the period", () => {
    // How every Common Paper template is actually parsed: the period sits
    // outside the bold span, so the heading run stops short of it.
    expect(headingSeparator(block("Term and Termination", ". This MNDA commences"))).toBe("");
  });

  it("adds only a space when the heading already carries its own period", () => {
    expect(headingSeparator(block("Term and Termination.", "This MNDA commences"))).toBe(" ");
  });

  it("adds a period when neither side has one", () => {
    expect(headingSeparator(block("Term and Termination", "This MNDA commences"))).toBe(". ");
  });

  it("treats a block with no runs as needing its own period", () => {
    expect(headingSeparator({ level: 1, number: "1", heading: "General", runs: [] })).toBe(". ");
  });
});
