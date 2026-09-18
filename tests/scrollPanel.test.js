import { describe, expect, it } from "vitest";
import { findScrollable, scrollPanel } from "../src/lib/scrollPanel.js";

describe("scrollPanel", () => {
  it("moves scrollTop on the container, not window", () => {
    const windowTop = window.scrollY;
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 500, configurable: true },
      scrollTop: { value: 0, writable: true },
    });
    const moved = scrollPanel(container);
    expect(moved).toBe(true);
    expect(container.scrollTop).toBe(240);
    expect(window.scrollY).toBe(windowTop);
  });

  it("returns false when already at the bottom", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 100 },
      scrollTop: { value: 0, writable: true },
    });
    expect(scrollPanel(container)).toBe(false);
  });

  it("picks the child with the largest overflow as the scroller", () => {
    const panel = document.createElement("div");
    const inner = document.createElement("div");
    panel.append(inner);
    Object.defineProperties(panel, {
      clientHeight: { value: 400 },
      scrollHeight: { value: 400 },
    });
    Object.defineProperties(inner, {
      clientHeight: { value: 200 },
      scrollHeight: { value: 2000 },
    });
    expect(findScrollable(panel)).toBe(inner);
  });
});
