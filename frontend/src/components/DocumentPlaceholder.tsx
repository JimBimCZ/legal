export function DocumentPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <svg
        viewBox="0 0 64 64"
        aria-hidden="true"
        className="h-16 w-16 text-zinc-300 dark:text-zinc-700"
      >
        <path
          fill="currentColor"
          d="M16 4h24l12 12v44a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
          opacity="0.25"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          d="M16 4h24l12 12v44a2 2 0 0 1-2 2H16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"
        />
        <path fill="none" stroke="currentColor" strokeWidth="2" d="M40 4v12h12" />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          d="M22 30h20M22 38h20M22 46h12"
        />
      </svg>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Choose a document type to see a preview here.
      </p>
    </div>
  );
}
