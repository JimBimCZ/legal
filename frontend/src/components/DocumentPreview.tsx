import { fieldDisplayValue } from "@/lib/documentFields";
import type { DocumentDetail, DocumentFields } from "@/types/document";

interface DocumentPreviewProps {
  documentDetail: DocumentDetail;
  values: DocumentFields;
}

export function DocumentPreview({ documentDetail, values }: DocumentPreviewProps) {
  return (
    <article className="text-zinc-900 dark:text-zinc-100">
      <h2 className="text-xl font-semibold">{documentDetail.name}</h2>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Fields
      </h3>
      <dl className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        {documentDetail.fields.map((field) => {
          const { text, filled } = fieldDisplayValue(field.key, documentDetail.fields, values);
          return (
            <div key={field.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
              <dt className="w-48 shrink-0 font-medium text-zinc-500 dark:text-zinc-400">
                {field.label}
              </dt>
              <dd className={filled ? undefined : "italic text-zinc-400 dark:text-zinc-600"}>
                {text}
              </dd>
            </div>
          );
        })}
      </dl>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Standard Terms
      </h3>
      <div className="mt-2 space-y-4">
        {documentDetail.blocks.map((block, index) => (
          <p
            key={index}
            className={`text-sm leading-relaxed ${block.level === 2 ? "ml-6" : ""}`}
          >
            <span className="font-semibold">{block.number}. </span>
            {block.heading && <span className="font-semibold">{block.heading}. </span>}
            {block.runs.map((run, runIndex) => {
              if (run.kind === "field") {
                const { text, filled } = fieldDisplayValue(
                  run.fieldKey,
                  documentDetail.fields,
                  values,
                );
                return (
                  <span
                    key={runIndex}
                    className={filled ? "font-semibold" : "italic text-zinc-400 dark:text-zinc-600"}
                  >
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

      <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-600">
        {documentDetail.sourceAttribution}
      </p>
    </article>
  );
}
