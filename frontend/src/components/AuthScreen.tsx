"use client";

import { useEffect, useState } from "react";

import { FieldRule } from "@/components/FieldRule";

// Keyed by the auth_error codes routes/auth.py redirects with.
const ERROR_MESSAGES: Record<string, string> = {
  denied: "Sign-in was cancelled. You can try again whenever you're ready.",
  state: "That sign-in attempt expired. Please try again.",
  email: "Your GitHub account has no verified email address. Verify one on GitHub, then try again.",
  github: "We couldn't reach GitHub just now. Please try again in a moment.",
};

const FALLBACK_MESSAGE = "We could not sign you in. Please try again.";

export function AuthScreen() {
  const [error, setError] = useState<string | null>(null);

  // Read from location rather than useSearchParams: this renders inside a
  // client-side root page, and useSearchParams would force a Suspense
  // boundary around it for no benefit. Clearing the parameter stops a
  // reload from replaying a stale error.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (!code) return;
    // The page is prerendered by output: "export", so window.location is
    // unavailable at build time. A useState lazy initializer would render
    // nothing at build and the error at hydration, which is a hydration
    // mismatch - worse than the cascading render this rule guards against.
    // The value is read once at mount and never changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE);
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      {/* The mark sits above the wordmark, the way a rule sits above a heading
          on a filed document. */}
      <div className="ui-panel">
        <div className="border-b border-line px-8 pt-8 pb-6">
          <FieldRule variant="mark" filled={1} total={1} className="w-24" />
          <h1 className="type-display mt-4 text-xl text-heading">Legal Document Creator</h1>
          <p className="ui-eyebrow mt-2">Sign in to start drafting</p>
        </div>

        <div className="flex flex-col gap-4 px-8 pt-6 pb-8">
          {/* A heavy accent rule down the side rather than a tinted box: the
              only place colour appears on this screen, and it still reads as
              an error with the colour stripped out. */}
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
