import type { DocumentBlock } from "@/types/document";

const ENDS_WITH_PUNCTUATION = /[.:;,!?]$/;
const STARTS_WITH_PUNCTUATION = /^\s*[.:;,!?]/;

/**
 * What to render between a clause heading and the clause text.
 *
 * The templates are inconsistent about where the period after a heading lives.
 * Sometimes it sits inside the bold span the parser reads as the heading;
 * sometimes it sits just outside, in which case the block's first run opens
 * with ". " instead. Appending a period unconditionally rendered
 * "Term and Termination. . This MNDA…" on almost every clause of every
 * document, on screen and in the PDF alike.
 */
export function headingSeparator(block: DocumentBlock): string {
  const firstRun = block.runs[0];
  // The text carries its own punctuation - anything added here doubles it.
  if (firstRun && STARTS_WITH_PUNCTUATION.test(firstRun.text)) return "";
  if (ENDS_WITH_PUNCTUATION.test(block.heading ?? "")) return " ";
  return ". ";
}
