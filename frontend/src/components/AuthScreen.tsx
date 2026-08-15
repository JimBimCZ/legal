"use client";

import { useState, type FormEvent } from "react";

import { SunMeter, SunRule } from "@/components/SunMeter";
import { signIn, signUp } from "@/lib/authApi";
import type { User } from "@/types/auth";

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleMode() {
    setMode((current) => (current === "signin" ? "signup" : "signin"));
    setError(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
      {/* A shallow arch: the sun mark sits inside the curve it echoes. Enough
          shoulder to be a deliberate detail, not a tent. */}
      <div className="groove-panel overflow-hidden rounded-t-[40px]">
        <div className="border-b border-line bg-canvas px-10 pt-9 pb-7 text-center">
          <SunMeter variant="mark" filled={1} total={1} className="mx-auto h-12 w-24 text-heading" />
          <h1 className="type-display mt-4 text-xl text-heading">Legal Document Creator</h1>
          <p className="groove-eyebrow mt-2.5">
            {mode === "signin" ? "Welcome back" : "Let's get you set up"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-8 pt-7">
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block pl-1 text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="groove-input"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block pl-1 text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="groove-input"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-ember bg-ember/5 px-3.5 py-2 text-sm font-medium text-ember-ink">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="groove-btn groove-btn-primary mt-2 w-full"
          >
            {isSubmitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="groove-link mt-6 w-full px-8 text-center text-sm font-medium text-ink-muted underline decoration-line underline-offset-4 transition-colors hover:text-ink hover:decoration-marigold-deep"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>

        <SunRule className="mt-7" />
      </div>
    </div>
  );
}
