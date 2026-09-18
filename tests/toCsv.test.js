import { describe, expect, it } from "vitest";
import { csvFilename, toCsv } from "../src/lib/toCsv.js";
import { ERRORS } from "../src/lib/errors.js";

describe("toCsv", () => {
  it("writes BOM, header, and empty reply_to for comments", () => {
    const csv = toCsv([
      {
        profileName: "ana",
        commentText: "amei",
        type: "comment",
        replyTo: "",
        postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      },
      {
        profileName: "bruno",
        commentText: 'eu, "também"',
        type: "reply",
        replyTo: "ana",
        postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const body = csv.slice(1);
    expect(body).toContain("profile_name,comment_text,type,reply_to,post_url");
    expect(body).toContain(
      "ana,amei,comment,,https://www.instagram.com/reels/DcxhtUfOJj4/",
    );
    expect(body).toContain('"eu, ""também"""');
  });

  it("escapes newlines inside comment text", () => {
    const csv = toCsv([
      {
        profileName: "ana",
        commentText: "linha1\nlinha2",
        type: "comment",
        replyTo: "",
        postUrl: "https://www.instagram.com/reels/x/",
      },
    ]);
    expect(csv).toContain('"linha1\nlinha2"');
  });
});

describe("csvFilename", () => {
  it("uses shortcode and local date", () => {
    const date = new Date(2026, 8, 18);
    expect(csvFilename("DcxhtUfOJj4", date)).toBe(
      "instagram-comments-DcxhtUfOJj4-2026-09-18.csv",
    );
  });
});

describe("ERRORS", () => {
  it("exposes the Portuguese catalog", () => {
    expect(ERRORS.UNSUPPORTED_URL).toBe(
      "Abra um Reel do Instagram para extrair comentários.",
    );
    expect(ERRORS.PANEL_NOT_FOUND).toBe(
      "Abra os comentários deste Reel e tente de novo.",
    );
    expect(ERRORS.NO_COMMENTS_FOUND).toBe(
      "Não encontrei comentários neste layout. O Instagram pode ter mudado a página.",
    );
  });
});
