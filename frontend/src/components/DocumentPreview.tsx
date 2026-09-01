import { FieldRule } from "@/components/FieldRule";
import { headingSeparator } from "@/lib/clauseHeading";
import { fieldDisplayValue, unfilledFieldCount } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

interface DocumentPreviewProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
  /**
   * Marks the document as a worked example rather than the reader's own.
   * This renders in the same styling as a real agreement, so without a
   * standing marker a screenshot of it could pass for one.
   */
  isExample?: boolean;
}

// Section labels sit on a hairline that spans the column, so the page divides
// into filed sections rather than free-floating headings.
const sectionHeadingClassName = "ui-eyebrow mt-8 block border-b border-line pb-2";

export function DocumentPreview({
  documentDetail,
  values,
  isExample = false,
}: DocumentPreviewProps) {
  const total = documentDetail.fields.length;
  const filled = total - unfilledFieldCount(documentDetail.fields, values);
  const caption =
    total === 0
      ? "This template has no fields"
      : filled === total
        ? "Every field filled — ready to download"
        : `${filled} of ${total} fields filled`;

  return (
    <article className="ui-panel overflow-hidden">
      {/* The measure runs across the head of the document, striking a tick as
          each field is answered. */}
      <header className="border-b border-line bg-canvas px-6 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-4">
          <p className="ui-eyebrow" aria-hidden="true">
            {caption}
          </p>
          {total > 0 && (
            <span className="font-mono text-[11px] tabular-nums text-ink-muted" aria-hidden="true">
              {String(filled).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
          )}
        </div>
        <FieldRule filled={filled} total={total} className="mt-2.5" />
      </header>

      <div className="px-6 pt-7 pb-8 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="type-display text-2xl text-heading">{documentDetail.name}</h2>
          {/* An outlined stamp rather than a fill: it has to be unmissable in a
              screenshot without competing with the document it labels. */}
          {isExample && (
            <span className="ui-eyebrow rounded border border-line px-2 py-0.5 text-ink-muted">
              Example
            </span>
          )}
        </div>

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
                <dd className={isFilled ? "type-doc font-semibold text-ink" : "ui-blank"}>
                  {text}
                </dd>
              </div>
            );
          })}
        </dl>

        <h3 className={sectionHeadingClassName}>Standard Terms</h3>
        <div className="type-doc mt-4 space-y-4 text-[14px] text-ink">
          {documentDetail.blocks.map((block, index) => (
            <p key={index} className={block.level === 2 ? "ml-6" : ""}>
              {/* Clause numbers only need to be findable, not emphatic. */}
              <span className="font-mono text-[12px] text-ink-muted">{block.number}. </span>
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
                    <span key={runIndex} className={isFilled ? "font-semibold" : "ui-blank"}>
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
