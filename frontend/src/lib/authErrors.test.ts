import { beforeEach, describe, expect, it } from "vitest";

import { authErrorMessage, readAndClearAuthError } from "@/lib/authErrors";

function setSearch(search: string) {
  window.history.replaceState({}, "", `/${search}`);
}

describe("authErrorMessage", () => {
  it("explains each code the backend actually sends", () => {
    expect(authErrorMessage("denied")).toMatch(/cancelled/i);
    expect(authErrorMessage("state")).toMatch(/expired/i);
    expect(authErrorMessage("email")).toMatch(/verified email/i);
    expect(authErrorMessage("github")).toMatch(/couldn't reach GitHub/i);
  });

  it("falls back for an unknown code", () => {
    expect(authErrorMessage("something-else")).toMatch(/could not sign you in/i);
  });

  it("falls back for prototype keys rather than returning an object", () => {
    // A bare `MESSAGES[code]` hands back Object.prototype here, which React
    // cannot render - it takes down the whole screen for anyone sent the link.
    for (const key of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
      expect(typeof authErrorMessage(key)).toBe("string");
      expect(authErrorMessage(key)).toMatch(/could not sign you in/i);
    }
  });
});

describe("readAndClearAuthError", () => {
  beforeEach(() => {
    setSearch("");
  });

  it("returns null when there is no error", () => {
    expect(readAndClearAuthError()).toBeNull();
  });

  it("returns the message and strips the parameter", () => {
    setSearch("?auth_error=denied");

    expect(readAndClearAuthError()).toMatch(/cancelled/i);
    expect(window.location.search).toBe("");
  });

  it("preserves other query parameters", () => {
    setSearch("?ref=newsletter&auth_error=state&plan=pro");

    readAndClearAuthError();

    const params = new URLSearchParams(window.location.search);
    expect(params.get("auth_error")).toBeNull();
    expect(params.get("ref")).toBe("newsletter");
    expect(params.get("plan")).toBe("pro");
  });
});
