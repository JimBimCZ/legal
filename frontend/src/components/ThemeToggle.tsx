"use client";

import { useSyncExternalStore } from "react";

const buttonClassName =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const listeners = new Set<() => void>();

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  window.localStorage.setItem("theme", dark ? "dark" : "light");
  for (const listener of listeners) listener();
}

// Notified by applyTheme() below so a click re-renders every mounted toggle.
// Separately, React also re-renders once automatically right after hydration:
// the static export bakes in the light-mode server snapshot below, so the
// first client render corrects to the real class set by the no-flash script
// in layout.tsx before hydration.
function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot() {
  return false;
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    applyTheme(!isDark);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={buttonClassName}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path
            fill="currentColor"
            d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5-3.5a1 1 0 0 1 1-1H22a1 1 0 1 1 0 2h-1.5a1 1 0 0 1-1-1ZM2 12a1 1 0 0 1 1-1h1.5a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1Zm15.66-6.66a1 1 0 0 1 1.41 0l.71.7a1 1 0 0 1-1.41 1.42l-.71-.71a1 1 0 0 1 0-1.41ZM5.63 17.66a1 1 0 0 1 1.41 0l.71.71a1 1 0 1 1-1.41 1.41l-.71-.7a1 1 0 0 1 0-1.42ZM12 18.5a1 1 0 0 1 1 1V21a1 1 0 1 1-2 0v-1.5a1 1 0 0 1 1-1Zm6.37-.84a1 1 0 0 1 1.41 1.41l-.71.71a1 1 0 0 1-1.41-1.41l.71-.71ZM6.34 6.34a1 1 0 0 1 1.41-1.41l.71.7a1 1 0 0 1-1.41 1.42l-.71-.71Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <path
            fill="currentColor"
            d="M20.74 15.5a8.5 8.5 0 0 1-10.24-10.24.75.75 0 0 0-.96-.9A9.5 9.5 0 1 0 21.64 16.46a.75.75 0 0 0-.9-.96Z"
          />
        </svg>
      )}
    </button>
  );
}
