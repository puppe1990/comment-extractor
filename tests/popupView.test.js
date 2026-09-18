import { describe, expect, it } from "vitest";
import { popupView } from "../src/lib/popupView.js";
import { ERRORS } from "../src/lib/errors.js";

const base = {
  postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
  shortcode: "DcxhtUfOJj4",
  rows: [],
  status: "idle",
  errorMessage: "",
  updatedAt: 0,
};

describe("popupView", () => {
  it("disables extract on unsupported URL", () => {
    const v = popupView({ supported: false, record: null });
    expect(v.extractEnabled).toBe(false);
    expect(v.pauseEnabled).toBe(false);
    expect(v.downloadEnabled).toBe(false);
    expect(v.statusText).toBe(ERRORS.UNSUPPORTED_URL);
    expect(v.counterText).toBe("0 comentários · 0 respostas");
  });

  it("idle with 0 rows: extract on, download off", () => {
    const v = popupView({ supported: true, record: base });
    expect(v.extractEnabled).toBe(true);
    expect(v.pauseEnabled).toBe(false);
    expect(v.downloadEnabled).toBe(false);
    expect(v.counterText).toBe("0 comentários · 0 respostas");
  });

  it("running: pause on, extract off, live counter", () => {
    const v = popupView({
      supported: true,
      record: {
        ...base,
        status: "running",
        rows: [
          { type: "comment" },
          { type: "comment" },
          { type: "reply" },
        ],
      },
    });
    expect(v.extractEnabled).toBe(false);
    expect(v.pauseEnabled).toBe(true);
    expect(v.downloadEnabled).toBe(true);
    expect(v.statusText).toBe("Extraindo…");
    expect(v.counterText).toBe("2 comentários · 1 respostas");
  });

  it("paused / complete / error flags", () => {
    expect(
      popupView({ supported: true, record: { ...base, status: "paused", rows: [{ type: "comment" }] } }),
    ).toMatchObject({
      extractEnabled: true,
      pauseEnabled: false,
      downloadEnabled: true,
      statusText: "Pausado",
    });
    expect(
      popupView({ supported: true, record: { ...base, status: "complete", rows: [{ type: "comment" }] } }),
    ).toMatchObject({
      extractEnabled: true,
      downloadEnabled: true,
      statusText: "Concluído",
    });
    expect(
      popupView({
        supported: true,
        record: { ...base, status: "error", errorMessage: ERRORS.PANEL_NOT_FOUND },
      }),
    ).toMatchObject({
      extractEnabled: true,
      statusText: ERRORS.PANEL_NOT_FOUND,
    });
  });
});
