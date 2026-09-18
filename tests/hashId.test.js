import { describe, expect, it } from "vitest";
import { commentId, hashId } from "../src/lib/hashId.js";

const fields = {
  profileName: "ana",
  type: "comment",
  replyTo: "",
  commentText: "amei",
};

describe("hashId", () => {
  it("returns a stable hash: prefix for the same fields", () => {
    expect(hashId(fields)).toBe(hashId(fields));
    expect(hashId(fields)).toMatch(/^hash:[0-9a-f]{16}$/);
  });

  it("changes when comment text changes", () => {
    expect(hashId({ ...fields, commentText: "x" })).not.toBe(
      hashId({ ...fields, commentText: "y" }),
    );
  });
});

describe("commentId", () => {
  it("prefers an Instagram id when present", () => {
    expect(commentId("123", fields)).toBe("ig:123");
  });

  it("falls back to hash when Instagram id is missing", () => {
    expect(commentId("", fields)).toBe(hashId(fields));
    expect(commentId(null, fields)).toBe(hashId(fields));
  });
});
