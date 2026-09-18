import { describe, expect, it } from "vitest";
import {
  createStore,
  handleBatch,
  handleDisconnect,
  handleDownload,
  handleFail,
  handleGetState,
  handlePause,
  handleStart,
  handleDone,
  handleClear,
} from "../src/lib/workerLogic.js";

const URL = "https://www.instagram.com/reels/DcxhtUfOJj4/";
const NOW = 1_000;

function row(id, type = "comment") {
  return {
    id,
    profileName: id,
    commentText: id,
    type,
    replyTo: type === "reply" ? "ana" : "",
    postUrl: URL,
  };
}

describe("workerLogic", () => {
  it("GET_STATE is unsupported off a reels URL", () => {
    const state = handleGetState(
      createStore(),
      "https://www.instagram.com/",
      NOW,
    );
    expect(state.supported).toBe(false);
  });

  it("START creates a running record and asks to RUN", () => {
    const { store, effect } = handleStart(createStore(), URL, NOW);
    expect(effect).toEqual({ type: "RUN", postUrl: URL });
    expect(store.records[URL].status).toBe("running");
    expect(store.records[URL].shortcode).toBe("DcxhtUfOJj4");
  });

  it("START on a bad URL does not RUN", () => {
    const { effect, error } = handleStart(
      createStore(),
      "https://www.instagram.com/p/abc/",
      NOW,
    );
    expect(effect).toBeNull();
    expect(error).toBe("UNSUPPORTED_URL");
  });

  it("BATCH merges new ids only and ACKs counts", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    const first = handleBatch(
      store,
      { postUrl: URL, rows: [row("a"), row("b", "reply")] },
      NOW + 1,
    );
    expect(first.ack.addedCount).toBe(2);
    expect(first.ack.totalComments).toBe(1);
    expect(first.ack.totalReplies).toBe(1);
    const second = handleBatch(
      first.store,
      { postUrl: URL, rows: [row("a"), row("c")] },
      NOW + 2,
    );
    expect(second.ack.addedCount).toBe(1);
    expect(second.store.records[URL].rows.map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores BATCH for a different postUrl", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    const other = handleBatch(
      store,
      { postUrl: "https://www.instagram.com/reels/OTHER/", rows: [row("z")] },
      NOW,
    );
    expect(other.store.records[URL].rows).toEqual([]);
  });

  it("PAUSE and DONE stopped set paused; DONE exhausted sets complete", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handlePause(store, NOW).store;
    expect(store.records[URL].status).toBe("paused");
    store = handleStart(store, URL, NOW).store;
    store = handleDone(store, { postUrl: URL, reason: "exhausted" }, NOW).store;
    expect(store.records[URL].status).toBe("complete");
  });

  it("FAIL sets error message", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handleFail(
      store,
      {
        postUrl: URL,
        code: "PANEL_NOT_FOUND",
        message: "Abra os comentários deste Reel e tente de novo.",
      },
      NOW,
    ).store;
    expect(store.records[URL].status).toBe("error");
    expect(store.records[URL].errorMessage).toContain("Abra os comentários");
  });

  it("DOWNLOAD with 0 rows is a no-op; with rows returns csv and filename", () => {
    let store = createStore();
    expect(
      handleDownload(store, URL, NOW, new Date(2026, 8, 18)).effect,
    ).toBeNull();
    store = handleStart(store, URL, NOW).store;
    store = handleBatch(store, { postUrl: URL, rows: [row("a")] }, NOW).store;
    const { effect } = handleDownload(store, URL, NOW, new Date(2026, 8, 18));
    expect(effect.type).toBe("DOWNLOAD");
    expect(effect.filename).toBe(
      "instagram-comments-DcxhtUfOJj4-2026-09-18.csv",
    );
    expect(effect.csv).toContain("profile_name");
    expect(effect.csv.startsWith("\uFEFF")).toBe(true);
  });

  it("disconnect while running with rows goes paused; with none goes idle", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handleDisconnect(store, NOW).store;
    expect(store.records[URL].status).toBe("idle");
    store = handleStart(store, URL, NOW).store;
    store = handleBatch(store, { postUrl: URL, rows: [row("a")] }, NOW).store;
    store = handleDisconnect(store, NOW).store;
    expect(store.records[URL].status).toBe("paused");
  });

  it("CLEAR wipes rows and returns idle, STOP if it was running", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handleBatch(store, { postUrl: URL, rows: [row("a")] }, NOW).store;
    const { store: cleared, effect } = handleClear(store, URL, NOW + 5);
    expect(effect).toEqual({ type: "STOP" });
    expect(cleared.records[URL].rows).toEqual([]);
    expect(cleared.records[URL].status).toBe("idle");
    expect(cleared.runningPostUrl).toBeNull();
    expect(handleGetState(cleared, URL, NOW).record.rows).toEqual([]);
  });
});
