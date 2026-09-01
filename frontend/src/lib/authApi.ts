import type { User } from "@/types/auth";

async function parseErrorDetail(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.detail === "string" ? body.detail : fallback;
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

export async function deleteAccount(): Promise<void> {
  const response = await fetch("/api/auth/me", { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      await parseErrorDetail(response, "Failed to delete your account. Please try again."),
    );
  }
}
