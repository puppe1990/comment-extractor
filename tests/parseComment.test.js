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
    expect(
      parseComment(reply, { postUrl: POST, parentUsername: "ana" }),
    ).toMatchObject({
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

  it("marks nested permalinks as replies with reply_to parent", () => {
    const panel = load("ig-reels-expanded-replies.html");
    const rows = parseCommentList(panel, POST);
    expect(rows).toEqual([
      expect.objectContaining({
        profileName: "o_viniciusx",
        type: "comment",
        replyTo: "",
        id: "ig:111",
      }),
      expect.objectContaining({
        profileName: "degustar.io",
        type: "reply",
        replyTo: "o_viniciusx",
        id: "ig:222",
        commentText: expect.stringMatching(/Te chamei no Direct/),
      }),
    ]);
  });

  it("parses Instagram overlay where comment text is not a sibling of the timestamp link", () => {
    const panel = load("ig-reels-real-overlay.html");
    const rows = parseCommentList(panel, POST);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "ig:18114490975965464",
      profileName: "o_viniciusx",
      type: "comment",
    });
    expect(rows[0].commentText).toMatch(/representante desse capricho/);
    expect(rows[1]).toMatchObject({
      id: "ig:17904239040487551",
      profileName: "kleydsonpess4nha",
    });
    expect(rows[1].commentText).toMatch(/Gostei bastante da ideia/);
  });

  it("parses comments from permalinks on a full Reels page dump", () => {
    const root = load("ig-reels-page-dump.html");
    const rows = parseCommentList(root, POST);
    expect(rows.map((r) => r.profileName)).toEqual([
      "o_viniciusx",
      "kleydsonpess4nha",
    ]);
    expect(rows[0].id).toBe("ig:18114490975965464");
    expect(rows[1].id).toBe("ig:17904239040487551");
    expect(rows[0].commentText).toMatch(/representante desse capricho/);
    expect(rows.some((r) => r.profileName === "degustar.io")).toBe(false);
  });

  it("parses live Reels comments with avatar links and no caption row", () => {
    const root = load("ig-reels-live.html");
    const rows = parseCommentList(root, POST);
    expect(rows.map((r) => r.profileName)).toEqual([
      "o_viniciusx",
      "kleydsonpess4nha",
    ]);
    expect(rows[0]).toMatchObject({
      type: "comment",
      replyTo: "",
    });
    expect(rows[0].commentText).toMatch(/representante desse capricho/);
    expect(rows[1].commentText).toMatch(/Gostei bastante da ideia/);
  });
});
