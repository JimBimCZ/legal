import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { AuthScreen } from "@/components/AuthScreen";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("AuthScreen", () => {
  beforeEach(() => {
    setSearch("");
  });

  it("offers a GitHub sign-in link pointing at the start route", () => {
    render(<AuthScreen />);

    const link = screen.getByRole("link", { name: /continue with github/i });
    expect(link).toHaveAttribute("href", "/api/auth/github");
  });

  it("links to the privacy policy", () => {
    render(<AuthScreen />);

    expect(screen.getByRole("link", { name: /privacy/i })).toHaveAttribute("href", "/privacy");
  });

  it("explains a cancelled authorization", () => {
    setSearch("?auth_error=denied");
    render(<AuthScreen />);

    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("explains a missing verified email", () => {
    setSearch("?auth_error=email");
    render(<AuthScreen />);

    expect(screen.getByText(/verified email/i)).toBeInTheDocument();
  });

  it("explains an expired sign-in attempt", () => {
    setSearch("?auth_error=state");
    render(<AuthScreen />);

    expect(screen.getByText(/expired/i)).toBeInTheDocument();
  });

  it("falls back to a generic message for an unknown code", () => {
    setSearch("?auth_error=something-else");
    render(<AuthScreen />);

    expect(screen.getByText(/could not sign you in/i)).toBeInTheDocument();
  });

  it("clears the error from the URL so a reload does not repeat it", () => {
    setSearch("?auth_error=denied");
    render(<AuthScreen />);

    expect(window.location.search).toBe("");
  });

  it("preserves other query parameters while clearing auth_error", () => {
    setSearch("?foo=bar&auth_error=denied&baz=qux");
    render(<AuthScreen />);

    expect(window.location.search).toBe("?foo=bar&baz=qux");
  });

  it("shows no error when there is none", () => {
    render(<AuthScreen />);

    expect(screen.queryByText(/could not sign you in/i)).not.toBeInTheDocument();
  });

  it("falls back to the generic message for __proto__ instead of walking the prototype chain", () => {
    setSearch("?auth_error=__proto__");
    render(<AuthScreen />);

    expect(screen.getByText(/could not sign you in/i)).toBeInTheDocument();
  });

  it("falls back to the generic message for a function-valued inherited key", () => {
    setSearch("?auth_error=constructor");
    render(<AuthScreen />);

    expect(screen.getByText(/could not sign you in/i)).toBeInTheDocument();
  });
});
