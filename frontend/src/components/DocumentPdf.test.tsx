// @vitest-environment node
//
// This exercises the real @react-pdf/renderer pipeline (layout, fonts,
// PDF byte-stream serialization) end to end, unlike DownloadButton.test.tsx
// which stubs it out. jsdom lacks the Blob/worker APIs @react-pdf/renderer's
// browser entry needs, so this file runs under Node instead.
import { renderToBuffer } from "@react-pdf/renderer";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

import { DocumentPdf } from "@/components/DocumentPdf";
import { TEST_DOCUMENT, TEST_DOCUMENT_FILLED_VALUES } from "@/lib/documentTestFixtures";
import type { DocumentFields } from "@/types/document";

/**
 * @react-pdf/renderer FlateDecode-compresses page content streams and shows
 * text as hex-encoded glyph strings in TJ/Tj operators (e.g. `[<50> <6172>] TJ`),
 * not literal ASCII. To assert real content reached the page without a full
 * PDF parser, inflate each content stream and concatenate the hex glyph runs
 * — for the standard Helvetica font used here, WinAnsi glyph codes equal
 * ASCII codes for the plain English text this document contains.
 */
async function renderPdfText(values: DocumentFields): Promise<string> {
  const buffer = await renderToBuffer(<DocumentPdf documentDetail={TEST_DOCUMENT} values={values} />);
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

describe("DocumentPdf (real PDF generation)", () => {
  it("produces a well-formed PDF for an empty document", async () => {
    const buffer = await renderToBuffer(<DocumentPdf documentDetail={TEST_DOCUMENT} values={{}} />);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("produces a well-formed PDF for a fully filled-in document", async () => {
    const buffer = await renderToBuffer(
      <DocumentPdf documentDetail={TEST_DOCUMENT} values={TEST_DOCUMENT_FILLED_VALUES} />,
    );
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buffer.subarray(-6).toString("latin1").trim()).toBe("%%EOF");
  });

  it("embeds every field label in the generated PDF", async () => {
    const text = await renderPdfText({});
    for (const field of TEST_DOCUMENT.fields) {
      expect(text).toContain(field.label);
    }
  });

  it("embeds filled field values in the generated PDF", async () => {
    const text = await renderPdfText(TEST_DOCUMENT_FILLED_VALUES);
    expect(text).toContain("Acme Inc.");
  });

  it("still shows bracketed placeholders in the PDF for unfilled fields", async () => {
    const text = await renderPdfText({});
    expect(text).toContain("[Customer]");
  });

  it("includes nested (level 2) block text in the PDF", async () => {
    const text = await renderPdfText({});
    expect(text).toContain("nested provision");
  });

  it("does not throw for a value containing special characters", async () => {
    await expect(
      renderToBuffer(
        <DocumentPdf
          documentDetail={TEST_DOCUMENT}
          values={{ ...TEST_DOCUMENT_FILLED_VALUES, customer: "Röck & Röll, LLC." }}
        />,
      ),
    ).resolves.toBeInstanceOf(Buffer);
  });
});
