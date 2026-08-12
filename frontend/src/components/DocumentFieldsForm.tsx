"use client";

import type { DocumentFields, FieldDef } from "@/types/document";

interface DocumentFieldsFormProps {
  fieldDefs: FieldDef[];
  values: DocumentFields;
  onFieldChange: (key: string, value: string) => void;
}

const inputClassName =
  "mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function DocumentFieldsForm({ fieldDefs, values, onFieldChange }: DocumentFieldsFormProps) {
  return (
    <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
      {fieldDefs.map((field) => (
        <div key={field.key}>
          <label
            htmlFor={field.key}
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            {field.label}
          </label>
          <input
            id={field.key}
            type="text"
            value={values[field.key] ?? ""}
            onChange={(event) => onFieldChange(field.key, event.target.value)}
            className={inputClassName}
          />
        </div>
      ))}
    </form>
  );
}
