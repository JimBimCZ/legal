import { buildCoverPageRows, buildStandardTerms } from "@/lib/buildDocument";
import { SOURCE_ATTRIBUTION, STANDARD_TERMS_TITLE } from "@/lib/mutualNdaContent";
import type { MutualNdaFields } from "@/types/nda";

export function NdaPreview({ fields }: { fields: MutualNdaFields }) {
  const coverRows = buildCoverPageRows(fields);
  const sections = buildStandardTerms(fields);

  return (
    <article className="text-zinc-900 dark:text-zinc-100">
      <h2 className="text-xl font-semibold">Mutual Non-Disclosure Agreement</h2>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Cover Page
      </h3>
      <dl className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
        {coverRows.map((row) => (
          <div key={row.key} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
            <dt className="w-48 shrink-0 font-medium text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className={row.filled ? undefined : "italic text-zinc-400 dark:text-zinc-600"}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {STANDARD_TERMS_TITLE}
      </h3>
      <div className="mt-2 space-y-4">
        {sections.map((section) => (
          <p key={section.number} className="text-sm leading-relaxed">
            <span className="font-semibold">{section.number}. </span>
            {section.runs.map((run, index) => {
              if (run.kind === "field") {
                return (
                  <span
                    key={index}
                    className={
                      run.filled
                        ? "font-semibold"
                        : "italic text-zinc-400 dark:text-zinc-600"
                    }
                  >
                    {run.text}
                  </span>
                );
              }
              return (
                <span key={index} className={run.bold ? "font-semibold" : undefined}>
                  {run.text}
                </span>
              );
            })}
          </p>
        ))}
      </div>

      <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-600">{SOURCE_ATTRIBUTION}</p>
    </article>
  );
}
