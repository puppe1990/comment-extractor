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
    expect(labels).toEqual(["View replies", "View 3 replies", "View more replies"]);
  });

  it("matches Portuguese reply labels", () => {
    const labels = findReplyButtons(load("reply-buttons-pt.html")).map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual(["Ver respostas", "Ver 3 respostas", "Ver mais respostas"]);
  });
});

it("treats a role=dialog root as the panel", () => {
  const panel = load("ig-reels-panel.html");
  expect(findCommentsPanel(panel)).toBe(panel);
  expect(findReplyButtons(panel).map((b) => b.textContent.trim())).toEqual([
    "View 1 reply",
  ]);
});
