// Keyed by the auth_error codes routes/auth.py redirects with.
const ERROR_MESSAGES: Record<string, string> = {
  denied: "Sign-in was cancelled. You can try again whenever you're ready.",
  state: "That sign-in attempt expired. Please try again.",
  email: "Your GitHub account has no verified email address. Verify one on GitHub, then try again.",
  github: "We couldn't reach GitHub just now. Please try again in a moment.",
};

const FALLBACK_MESSAGE = "We could not sign you in. Please try again.";

export function authErrorMessage(code: string): string {
  // Own-property check, not a bare lookup: `__proto__` and `constructor` walk
  // the prototype chain and hand back an object or a function, which React
  // then refuses to render, taking the whole screen down with it.
  return Object.hasOwn(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : FALLBACK_MESSAGE;
}

/**
 * Read `auth_error` from the current URL and strip it, leaving every other
 * query parameter in place. Returns the message to show, or null.
 *
 * Stripping stops a reload from replaying a stale error. Rebuilding the query
 * string rather than clearing it wholesale keeps any parameter a future
 * feature adds - the previous version discarded all of them.
 */
export function readAndClearAuthError(): string | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("auth_error");
  if (!code) return null;

  params.delete("auth_error");
  const query = params.toString();
  window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  return authErrorMessage(code);
}
