import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SignInModal } from "@/components/SignInModal";

describe("SignInModal", () => {
  it("offers GitHub sign-in as a real navigation", () => {
    render(<SignInModal error={null} onDismiss={vi.fn()} />);

    // An anchor, not a button - OAuth cannot go through fetch.
    expect(screen.getByRole("link", { name: /continue with github/i })).toHaveAttribute(
      "href",
      "/api/auth/github",
    );
  });

  it("links to the privacy policy", () => {
    render(<SignInModal error={null} onDismiss={vi.fn()} />);

    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy");
  });

  it("is announced as a dialog", () => {
    render(<SignInModal error={null} onDismiss={vi.fn()} />);

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("shows a sign-in error when one is passed", () => {
    render(<SignInModal error="That sign-in attempt expired." onDismiss={vi.fn()} />);

    expect(screen.getByText("That sign-in attempt expired.")).toBeInTheDocument();
  });

  it("shows no error treatment when there is none", () => {
    render(<SignInModal error={null} onDismiss={vi.fn()} />);

    expect(screen.queryByText(/expired|cancelled|could not sign/i)).not.toBeInTheDocument();
  });

  it("dismisses from the escape-route button", async () => {
    const onDismiss = vi.fn();
    render(<SignInModal error={null} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole("button", { name: /keep looking around/i }));

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("dismisses on Escape", async () => {
    const onDismiss = vi.fn();
    render(<SignInModal error={null} onDismiss={onDismiss} />);

    await userEvent.keyboard("{Escape}");

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("does not dismiss when the panel itself is clicked", async () => {
    const onDismiss = vi.fn();
    render(<SignInModal error={null} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole("heading", { name: /sign in to keep going/i }));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("puts focus on the escape route, not the sign-in link", () => {
    render(<SignInModal error={null} onDismiss={vi.fn()} />);

    expect(screen.getByRole("button", { name: /keep looking around/i })).toHaveFocus();
  });
});
