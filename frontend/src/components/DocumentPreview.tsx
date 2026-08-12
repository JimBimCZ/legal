import { fieldDisplayValue } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

interface DocumentPreviewProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

const blankClassName = "border-b border-dotted border-ink-muted/60 text-ink-muted";

export function DocumentPreview({ documentDetail, values }: DocumentPreviewProps) {
  return (
    <article className="rounded-sm border border-line bg-paper p-8 shadow-sm">
      <header className="border-t-2 border-navy-950 pt-4">
        <div className="mb-3 h-0.5 w-10 bg-yellow-400" />
        <h2 className="font-display text-2xl leading-tight text-heading">
          {documentDetail.name}
        </h2>
      </header>

      <h3 className="mt-8 font-mono text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-500">
        Fields
      </h3>
      <dl className="mt-2 divide-y divide-line text-sm">
        {documentDetail.fields.map((field) => {
          const { text, filled } = fieldDisplayValue(field.key, documentDetail.fields, values);
          return (
            <div key={field.key} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
              <dt className="w-48 shrink-0 text-ink-muted">{field.label}</dt>
              <dd className={filled ? "font-medium text-ink" : blankClassName}>{text}</dd>
            </div>
          );
        })}
      </dl>

      <h3 className="mt-8 font-mono text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-500">
        Standard Terms
      </h3>
      <div className="mt-3 space-y-4 font-document text-[15px] leading-relaxed text-ink">
        {documentDetail.blocks.map((block, index) => (
          <p key={index} className={block.level === 2 ? "ml-6" : ""}>
            <span className="font-mono text-[13px] font-semibold text-heading">
              {block.number}.{" "}
            </span>
            {block.heading && <span className="font-semibold">{block.heading}. </span>}
            {block.runs.map((run, runIndex) => {
              if (run.kind === "field") {
                const { text, filled } = fieldDisplayValue(
                  run.fieldKey,
                  documentDetail.fields,
                  values,
                );
                return (
                  <span key={runIndex} className={filled ? "font-semibold" : blankClassName}>
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

      <p className="mt-8 border-t border-line pt-4 font-mono text-[11px] text-ink-muted">
        {documentDetail.sourceAttribution}
      </p>
    </article>
  );
}
