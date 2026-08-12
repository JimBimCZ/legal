"use client";

import { useState, type FormEvent } from "react";

import { signIn, signUp } from "@/lib/authApi";
import type { User } from "@/types/auth";

interface AuthScreenProps {
  onAuthenticated: (user: User) => void;
}

const inputClassName =
  "w-full rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink shadow-sm placeholder:text-ink-muted/60 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const submitClassName =
  "inline-flex items-center justify-center rounded-sm bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-500/50";

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
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <div className="rounded-sm border border-line bg-paper p-8 shadow-sm">
        <div className="mb-8 border-t-2 border-navy-950 pt-5 text-center">
          <h1 className="font-display text-2xl tracking-tight text-heading">
            Legal Document Creator
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-widest text-ink-muted">
            {mode === "signin" ? "Sign in to your account" : "Create an account to get started"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-ink">
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
              className={inputClassName}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button type="submit" disabled={isSubmitting} className={submitClassName}>
            {isSubmitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          className="mt-6 w-full text-center text-sm text-blue-600 underline underline-offset-2 hover:text-blue-500 dark:text-blue-500"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
