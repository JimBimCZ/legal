import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { AuthScreen } from "@/components/AuthScreen";

const { signIn, signUp } = vi.hoisted(() => ({ signIn: vi.fn(), signUp: vi.fn() }));

vi.mock("@/lib/authApi", () => ({ signIn, signUp }));

const USER = { id: 1, email: "user@example.com", created_at: "2026-01-01 00:00:00" };

beforeEach(() => {
  signIn.mockReset();
  signUp.mockReset();
});

describe("AuthScreen", () => {
  it("defaults to sign-in mode", () => {
    render(<AuthScreen onAuthenticated={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("submits sign-in credentials and notifies the parent on success", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    signIn.mockResolvedValue(USER);

    render(<AuthScreen onAuthenticated={onAuthenticated} />);
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signIn).toHaveBeenCalledWith("user@example.com", "password123");
    expect(onAuthenticated).toHaveBeenCalledWith(USER);
  });

  it("switches to sign-up mode and submits via signUp", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    signUp.mockResolvedValue(USER);

    render(<AuthScreen onAuthenticated={onAuthenticated} />);
    await user.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(signUp).toHaveBeenCalledWith("new@example.com", "password123");
    expect(onAuthenticated).toHaveBeenCalledWith(USER);
  });

  it("shows an error message when sign-in fails", async () => {
    const user = userEvent.setup();
    signIn.mockRejectedValue(new Error("Invalid email or password"));

    render(<AuthScreen onAuthenticated={vi.fn()} />);
    await user.type(screen.getByLabelText("Email"), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
  });
});
