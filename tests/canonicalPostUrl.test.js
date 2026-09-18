import { describe, expect, it } from "vitest";
import { canonicalPostUrl } from "../src/lib/canonicalPostUrl.js";

describe("canonicalPostUrl", () => {
  it("canonicalizes www, query, and trailing slash", () => {
    expect(
      canonicalPostUrl("https://instagram.com/reels/DcxhtUfOJj4/?utm=share"),
    ).toEqual({
      ok: true,
      postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      shortcode: "DcxhtUfOJj4",
    });
  });

  it("accepts an already canonical reels URL", () => {
    expect(
      canonicalPostUrl("https://www.instagram.com/reels/DcxhtUfOJj4/"),
    ).toMatchObject({ ok: true, shortcode: "DcxhtUfOJj4" });
  });

  it("rejects /reel/, /p/, and other paths", () => {
    expect(canonicalPostUrl("https://www.instagram.com/reel/DcxhtUfOJj4/").ok).toBe(
      false,
    );
    expect(canonicalPostUrl("https://www.instagram.com/p/DcxhtUfOJj4/").ok).toBe(
      false,
    );
    expect(canonicalPostUrl("https://www.instagram.com/").ok).toBe(false);
  });

  it("rejects an empty or invalid href", () => {
    expect(canonicalPostUrl("").ok).toBe(false);
    expect(canonicalPostUrl("not a url").ok).toBe(false);
  });
});
