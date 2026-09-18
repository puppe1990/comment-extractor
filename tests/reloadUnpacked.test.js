import { describe, expect, it } from "vitest";
import { unpackedToReload } from "../src/lib/reloadUnpacked.js";

const selfId = "self";

describe("unpackedToReload", () => {
  it("returns other enabled development extensions, not self or store installs", () => {
    const list = [
      { id: selfId, installType: "development", enabled: true },
      { id: "extract", installType: "development", enabled: true },
      { id: "disabled", installType: "development", enabled: false },
      { id: "store", installType: "normal", enabled: true },
    ];
    expect(unpackedToReload(list, selfId).map((ext) => ext.id)).toEqual([
      "extract",
    ]);
  });
});
