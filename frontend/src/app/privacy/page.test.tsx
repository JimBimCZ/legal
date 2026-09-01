import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "@/app/privacy/page";

describe("privacy policy", () => {
  it("names the controller and a contact address", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Vít Bušek/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /busek\.vit@gmail\.com/ })).toHaveAttribute(
      "href",
      "mailto:busek.vit@gmail.com",
    );
  });

  it("discloses that document content is sent to OpenRouter", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/are sent to\s+OpenRouter/)).toBeInTheDocument();
  });

  it("names every processor", () => {
    render(<PrivacyPage />);

    for (const processor of ["OpenRouter", "Cerebras", "Neon", "Vercel", "GitHub"]) {
      expect(screen.getAllByText(new RegExp(processor)).length).toBeGreaterThan(0);
    }
  });

  it("explains that there is no tracking and therefore no cookie banner", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/no analytics/i)).toBeInTheDocument();
  });

  it("tells people how to erase their account", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Delete account/)).toBeInTheDocument();
  });

  it("links back to the app", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/");
  });
});
