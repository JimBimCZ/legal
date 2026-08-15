import { SunMeter } from "@/components/SunMeter";
import { headingSeparator } from "@/lib/clauseHeading";
import { fieldDisplayValue, unfilledFieldCount } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

interface DocumentPreviewProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

// A blank reads as a rule waiting to be written on. Brick is spent here and on
// errors and nowhere else, so an unanswered field is findable at a glance in a
// long document without the page turning into a highlighter test.
const blankClassName =
  "text-ink-muted underline decoration-ember decoration-dotted underline-offset-4";

// Section labels sit on a hairline that spans the column, so the page divides
// into filed sections rather than free-floating headings.
const sectionHeadingClassName = "groove-eyebrow mt-9 block border-b border-line pb-2";

export function DocumentPreview({ documentDetail, values }: DocumentPreviewProps) {
  const total = documentDetail.fields.length;
  const filled = total - unfilledFieldCount(documentDetail.fields, values);
  const caption =
    total === 0
      ? "This template has no fields"
      : filled === total
        ? "Every field filled — ready to download"
        : `${filled} of ${total} fields filled`;

  return (
    <article className="groove-panel overflow-hidden">
      {/* The sun rises across the top of the page as the chat answers fields. */}
      <header className="border-b border-line bg-canvas px-6 pt-6 pb-4 text-center">
        <SunMeter filled={filled} total={total} className="mx-auto h-14 w-28 text-heading" />
        <p className="groove-eyebrow mt-2.5" aria-hidden="true">
          {caption}
        </p>
      </header>

      <div className="px-7 pt-7 pb-8 sm:px-9">
        <h2 className="type-display text-2xl text-heading">{documentDetail.name}</h2>

        <h3 className={sectionHeadingClassName}>The Particulars</h3>
        <dl className="mt-1 divide-y divide-line text-sm">
          {documentDetail.fields.map((field) => {
            const { text, filled: isFilled } = fieldDisplayValue(
              field.key,
              documentDetail.fields,
              values,
            );
            return (
              <div key={field.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-4">
                <dt className="w-44 shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                  {field.label}
                </dt>
                <dd className={isFilled ? "type-doc font-semibold text-ink" : blankClassName}>
                  {text}
                </dd>
              </div>
            );
          })}
        </dl>

        <h3 className={sectionHeadingClassName}>Standard Terms</h3>
        <div className="type-doc mt-4 space-y-4 text-[15px] leading-[1.75] text-ink">
          {documentDetail.blocks.map((block, index) => (
            <p key={index} className={block.level === 2 ? "ml-6" : ""}>
              {/* Muted, not accented - a whole contract of orange numerals is
                  the loudest thing on the page, and they only need to be
                  findable, not emphatic. */}
              <span className="font-mono text-[12px] font-bold text-ink-muted">
                {block.number}.{" "}
              </span>
              {block.heading && (
                <span className="font-semibold">
                  {block.heading}
                  {headingSeparator(block)}
                </span>
              )}
              {block.runs.map((run, runIndex) => {
                if (run.kind === "field") {
                  const { text, filled: isFilled } = fieldDisplayValue(
                    run.fieldKey,
                    documentDetail.fields,
                    values,
                  );
                  return (
                    <span key={runIndex} className={isFilled ? "font-semibold" : blankClassName}>
                      {text}
                    </span>
                  );
                }
                return (
                  <span key={runIndex} className={run.bold ? "font-semibold" : undefined}>
                    {run.text}
                  </span>
                );
              })}
            </p>
          ))}
        </div>

        <p className="mt-9 border-t border-line pt-4 font-mono text-[11px] leading-relaxed text-ink-muted">
          {documentDetail.sourceAttribution}
        </p>
      </div>
    </article>
  );
}
