import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findCommentsButton,
  findCommentsPanel,
  findReplyButtons,
  isCommentsPanelOpen,
} from "../src/lib/findComments.js";

const dir = dirname(fileURLToPath(import.meta.url));

function load(name) {
  const html = readFileSync(join(dir, "fixtures", name), "utf8");
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

describe("findCommentsPanel", () => {
  it("returns the panel node when open", () => {
    const root = load("panel-open.html");
    const panel = findCommentsPanel(root);
    expect(panel).not.toBeNull();
    expect(isCommentsPanelOpen(root)).toBe(true);
  });

  it("returns null when the panel is closed", () => {
    const root = load("panel-closed.html");
    expect(findCommentsPanel(root)).toBeNull();
    expect(isCommentsPanelOpen(root)).toBe(false);
    expect(findCommentsButton(root)).not.toBeNull();
  });
});

describe("findReplyButtons", () => {
  it("matches English reply labels and ignores Hide/Like", () => {
    const labels = findReplyButtons(load("reply-buttons-en.html")).map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual([
      "View replies",
      "View 3 replies",
      "View more replies",
    ]);
  });

  it("matches Portuguese reply labels", () => {
    const labels = findReplyButtons(load("reply-buttons-pt.html")).map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual([
      "Ver respostas",
      "Ver 3 respostas",
      "Ver mais respostas",
    ]);
  });
});

it("treats a role=dialog root as the panel", () => {
  const panel = load("ig-reels-panel.html");
  expect(findCommentsPanel(panel)).toBe(panel);
  expect(findReplyButtons(panel).map((b) => b.textContent.trim())).toEqual([
    "View 1 reply",
  ]);
});

it("finds View all replies on the real Instagram overlay markup", () => {
  const panel = load("ig-reels-real-overlay.html");
  const labels = findReplyButtons(panel).map((el) =>
    el.textContent.replace(/\s+/g, " ").trim(),
  );
  expect(labels).toEqual(["View all 2 replies", "View all 1 replies"]);
});

it("does not treat the Comment action SVG as the comments panel", () => {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <main>
      <svg aria-label="Comment" viewBox="0 0 24 24"></svg>
      <div role="button" aria-label="Comment">811</div>
    </main>
    <div class="overlay">
      <a href="/ana/">ana</a>
      <a href="/p/DcxhtUfOJj4/c/18114490975965464/">2w</a>
      <div>amei</div>
    </div>
  `;
  const panel = findCommentsPanel(wrap);
  expect(panel.tagName).not.toBe("svg");
  expect(panel.getAttribute("aria-label")).not.toBe("Comment");
  expect(panel.querySelector("a[href*='/c/']")).not.toBeNull();
});

describe("live Reels comments tray from page dump", () => {
  it("finds the overlay via comment permalinks, not main", () => {
    const root = load("ig-reels-page-dump.html");
    const panel = findCommentsPanel(root);
    expect(panel).not.toBeNull();
    expect(panel.querySelector("a[href*='/c/']")).not.toBeNull();
    expect(panel.querySelector("main")).toBeNull();
    expect(panel.textContent).toMatch(/o_viniciusx/);
    expect(panel.textContent).not.toMatch(/82\.5K/);
  });
});

describe("live Reels comments tray", () => {
  it("finds the Comments section instead of another dialog", () => {
    const root = load("ig-reels-live.html");
    const panel = findCommentsPanel(root);
    expect(panel).not.toBeNull();
    expect(panel.querySelector("h2")?.textContent.trim()).toBe("Comments");
    expect(panel.getAttribute("aria-label")).not.toBe("Notifications");
  });

  it("finds View all N replies controls that are not button elements", () => {
    const root = load("ig-reels-live.html");
    const panel = findCommentsPanel(root);
    const labels = findReplyButtons(panel).map((el) =>
      el.textContent.replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual(["View all 2 replies", "View all 1 replies"]);
  });
});
