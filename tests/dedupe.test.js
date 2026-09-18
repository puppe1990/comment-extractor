import { describe, expect, it } from "vitest";
import { dedupe } from "../src/lib/dedupe.js";

const a = { id: "ig:1", profileName: "ana", commentText: "a" };
const b = { id: "ig:2", profileName: "bruno", commentText: "b" };
const a2 = { id: "ig:1", profileName: "ana", commentText: "changed" };

describe("dedupe", () => {
  it("appends new ids and keeps existing order", () => {
    const { rows, added } = dedupe([a], [a2, b]);
    expect(rows).toEqual([a, b]);
    expect(added).toEqual([b]);
  });

  it("returns empty added when everything is duplicate", () => {
    const { rows, added } = dedupe([a, b], [a, b]);
    expect(rows).toEqual([a, b]);
    expect(added).toEqual([]);
  });
});
