"use client";

import { useEffect, useRef } from "react";

import { FieldRule } from "@/components/FieldRule";

interface SignInModalProps {
  /** A message from a failed OAuth round-trip, or null. */
  error: string | null;
  onDismiss: () => void;
}

export function SignInModal({ error, onDismiss }: SignInModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Focus lands on the dismiss control, not the sign-in link: the visitor was
  // reading, and the escape route should be the thing under their thumb.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6 py-12"
      // Clicking the backdrop dismisses; clicking the panel must not.
      onMouseDown={(event) => {
        if (!panelRef.current?.contains(event.target as Node)) onDismiss();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-modal-title"
        className="ui-panel w-full max-w-md bg-paper"
      >
        <div className="border-b border-line px-8 pt-8 pb-6">
          <FieldRule variant="mark" filled={1} total={1} className="w-24" />
          <h2 id="signin-modal-title" className="type-display mt-4 text-xl text-heading">
            Sign in to keep going
          </h2>
          <p className="ui-eyebrow mt-2">The document above is an example</p>
        </div>

        <div className="flex flex-col gap-4 px-8 pt-6 pb-8">
          <p className="text-sm leading-relaxed text-ink">
            Sign in to start your own document. We&apos;ll save it as you go, so you can come back
            to it whenever you like.
          </p>

          {/* A heavy accent rule down the side rather than a tinted box: the
              only place colour appears here, and it still reads as an error
              with the colour stripped out. */}
          {error && (
            <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
              {error}
            </p>
          )}

          {/* An anchor, not a button: OAuth needs a top-level navigation, so
              this cannot go through fetch. */}
          <a href="/api/auth/github" className="ui-btn ui-btn-primary w-full text-center">
            Continue with GitHub
          </a>

          <button
            ref={closeRef}
            type="button"
            onClick={onDismiss}
            className="ui-link ui-eyebrow w-full text-center"
          >
            Keep looking around
          </button>

          <p className="text-xs text-ink-muted">
            We store your GitHub username and email address, and the documents you draft.{" "}
            <a href="/privacy" className="ui-link underline decoration-line underline-offset-4">
              Privacy policy
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
