import type { User } from "@/types/auth";

async function parseErrorDetail(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
}

export async function signUp(email: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response, "Failed to sign up. Please try again."));
  }
  return response.json();
}

export async function signIn(email: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response, "Invalid email or password."));
  }
  return response.json();
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchCurrentUser(): Promise<User | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error("Failed to check your session. Please try again.");
  }
  return response.json();
}
