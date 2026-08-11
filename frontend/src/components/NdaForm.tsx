"use client";

import { COVER_PAGE_FIELDS } from "@/lib/mutualNdaContent";
import type { MutualNdaFields, NdaFieldKey } from "@/types/nda";

interface NdaFormProps {
  fields: MutualNdaFields;
  onFieldChange: (key: NdaFieldKey, value: string) => void;
}

const inputClassName =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function NdaForm({ fields, onFieldChange }: NdaFormProps) {
  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      {COVER_PAGE_FIELDS.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {field.label}
          </label>
          {field.type === "textarea" ? (
            <textarea
              id={field.key}
              rows={3}
              value={fields[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => onFieldChange(field.key, event.target.value)}
              className={inputClassName}
            />
          ) : (
            <input
              id={field.key}
              type={field.type}
              value={fields[field.key]}
              placeholder={field.placeholder}
              onChange={(event) => onFieldChange(field.key, event.target.value)}
              className={inputClassName}
            />
          )}
        </div>
      ))}
    </form>
  );
}
