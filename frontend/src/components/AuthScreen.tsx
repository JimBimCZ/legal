"use client";

import { useState, type FormEvent } from "react";

import { FieldRule } from "@/components/FieldRule";
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
      {/* The mark sits above the wordmark, the way a rule sits above a heading
          on a filed document. */}
      <div className="ui-panel">
        <div className="border-b border-line px-8 pt-8 pb-6">
          <FieldRule variant="mark" filled={1} total={1} className="w-24" />
          <h1 className="type-display mt-4 text-xl text-heading">Legal Document Creator</h1>
          <p className="ui-eyebrow mt-2">
            {mode === "signin" ? "Welcome back" : "Let's get you set up"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-8 pt-6">
          <div>
            <label htmlFor="auth-email" className="mb-1.5 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="ui-input"
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-sm font-medium text-ink">
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
              className="ui-input"
            />
          </div>

          {/* A heavy accent rule down the side rather than a tinted box: the
              only place colour appears on this screen, and it still reads as
              an error with the colour stripped out. */}
          {error && (
            <p className="border-l-2 border-flag py-1 pl-3 text-sm font-medium text-flag-ink">
              {error}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className="ui-btn ui-btn-primary mt-2 w-full">
            {isSubmitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <div className="px-8 pt-5 pb-8">
          <button
            type="button"
            onClick={toggleMode}
            className="ui-link w-full text-center text-sm font-medium underline decoration-line underline-offset-4 hover:decoration-current"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
