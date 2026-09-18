import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseComment, parseCommentList } from "../src/lib/parseComment.js";

const dir = dirname(fileURLToPath(import.meta.url));
const POST = "https://www.instagram.com/reels/DcxhtUfOJj4/";

function load(name) {
  const html = readFileSync(join(dir, "fixtures", name), "utf8");
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

describe("parseComment", () => {
  it("reads username without @, text, comment type, empty replyTo", () => {
    const panel = load("one-comment.html");
    const node = panel.querySelector("[data-comment]");
    expect(parseComment(node, { postUrl: POST })).toMatchObject({
      id: "ig:c1",
      profileName: "ana.silva",
      commentText: "amei esse reel",
      type: "comment",
      replyTo: "",
      postUrl: POST,
    });
  });

  it("sets reply type and immediate parent username", () => {
    const panel = load("comment-and-replies.html");
    const reply = panel.querySelector("[data-reply]");
    expect(parseComment(reply, { postUrl: POST, parentUsername: "ana" })).toMatchObject({
      id: "ig:r1",
      profileName: "bruno",
      commentText: "eu também",
      type: "reply",
      replyTo: "ana",
    });
  });
});

describe("parseCommentList", () => {
  it("walks comments and nested replies with immediate parents", () => {
    const panel = load("nested-replies.html");
    expect(parseCommentList(panel, POST)).toEqual([
      expect.objectContaining({
        profileName: "ana",
        type: "comment",
        replyTo: "",
        commentText: "top",
      }),
      expect.objectContaining({
        profileName: "bruno",
        type: "reply",
        replyTo: "ana",
        commentText: "mid",
      }),
      expect.objectContaining({
        profileName: "carla",
        type: "reply",
        replyTo: "bruno",
        commentText: "nested",
      }),
    ]);
  });

  it("skips caption, like buttons, composer, and empty nodes", () => {
    const panel = load("caption-and-comments.html");
    const rows = parseCommentList(panel, POST);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentText).toBe("real comment");
    expect(rows[0].profileName).toBe("ana");
  });
});

describe("parseCommentList heuristic (no data-comment)", () => {
  it("skips the first caption block and parses nested replies", () => {
    const panel = load("ig-reels-panel.html");
    expect(parseCommentList(panel, POST)).toEqual([
      expect.objectContaining({
        profileName: "ana",
        commentText: "amei",
        type: "comment",
        replyTo: "",
      }),
      expect.objectContaining({
        profileName: "bruno",
        commentText: "eu também",
        type: "reply",
        replyTo: "ana",
      }),
    ]);
  });
});
