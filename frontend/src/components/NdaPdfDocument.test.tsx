// @vitest-environment node
//
// This exercises the real @react-pdf/renderer pipeline (layout, fonts,
// PDF byte-stream serialization) end to end, unlike DownloadButton.test.tsx
// which stubs it out. jsdom lacks the Blob/worker APIs @react-pdf/renderer's
// browser entry needs, so this file runs under Node instead.
import { renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

import { NdaPdfDocument } from "@/components/NdaPdfDocument";
import { COVER_PAGE_FIELDS } from "@/lib/mutualNdaContent";
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

/**
 * @react-pdf/renderer FlateDecode-compresses page content streams and shows
 * text as hex-encoded glyph strings in TJ/Tj operators (e.g. `[<50> <6172>] TJ`),
 * not literal ASCII. To assert real content reached the page without a full
 * PDF parser, inflate each content stream and concatenate the hex glyph runs
 * — for the standard Helvetica font used here, WinAnsi glyph codes equal
 * ASCII codes for the plain English text this document contains.
 */
async function renderPdfText(fields: MutualNdaFields): Promise<string> {
  const buffer = await renderToBuffer(<NdaPdfDocument fields={fields} />);
  const pdf = buffer.toString("latin1");
  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let hexGlyphs = "";
  let streamMatch: RegExpExecArray | null;
  while ((streamMatch = streamPattern.exec(pdf))) {
    let inflated: string;
    try {
      inflated = zlib.inflateSync(Buffer.from(streamMatch[1], "latin1")).toString("latin1");
    } catch {
      continue; // Not a Flate-compressed stream (e.g. an already-plain object).
    }
    for (const hexMatch of inflated.matchAll(/<([0-9A-Fa-f]+)>/g)) {
      hexGlyphs += hexMatch[1];
    }
  }
  return Buffer.from(hexGlyphs, "hex").toString("latin1");
}

describe("NdaPdfDocument (real PDF generation)", () => {
  it("produces a well-formed PDF for an empty NDA", async () => {
    const buffer = await renderToBuffer(<NdaPdfDocument fields={EMPTY_NDA_FIELDS} />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("produces a well-formed PDF for a fully filled-in NDA", async () => {
    const buffer = await renderToBuffer(<NdaPdfDocument fields={FILLED_FIELDS} />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
  });

  it("embeds every cover page label in the generated PDF", async () => {
    const text = await renderPdfText(EMPTY_NDA_FIELDS);
    for (const field of COVER_PAGE_FIELDS) {
      expect(text).toContain(field.label);
    }
  });

  it("embeds filled cover page values in the generated PDF", async () => {
    const text = await renderPdfText(FILLED_FIELDS);
    expect(text).toContain("Acme Inc.");
    expect(text).toContain("Globex Corporation");
  });

  it("embeds the standard terms body text, with tokens interpolated", async () => {
    const text = await renderPdfText(FILLED_FIELDS);
    expect(text).toContain("Governing Law and Jurisdiction");
    expect(text).toContain("laws of the State of Delaware");
    expect(text).toContain("New Castle County, Delaware");
    expect(text).toContain("2 years from the Effective Date");
  });

  it("still shows bracketed placeholders in the PDF for unfilled fields", async () => {
    const text = await renderPdfText(EMPTY_NDA_FIELDS);
    expect(text).toContain("[Governing Law (State)]");
  });

  it("does not throw for a party name containing special characters", async () => {
    await expect(
      renderToBuffer(
        <NdaPdfDocument fields={{ ...FILLED_FIELDS, party1Name: "Röck & Röll, LLC." }} />,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
