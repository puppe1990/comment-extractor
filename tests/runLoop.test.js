import { describe, expect, it } from "vitest";
import { ERRORS } from "../src/lib/errors.js";
import { runLoop } from "../src/lib/runLoop.js";

const POST = "https://www.instagram.com/reels/DcxhtUfOJj4/";

function comment(id) {
  return {
    id,
    profileName: id,
    commentText: id,
    type: "comment",
    replyTo: "",
    postUrl: POST,
  };
}

function harness(overrides = {}) {
  const clicks = [];
  const batches = [];
  const scrolls = [];
  let stopped = false;
  const deps = {
    postUrl: POST,
    getPanel: () => document.createElement("div"),
    openPanel: () => {},
    parseCommentList: () => [comment("a")],
    findReplyButtons: () => [],
    click: (b) => clicks.push(b),
    scrollPanel: (el) => {
      scrolls.push(el);
      return false;
    },
    delay: async () => {},
    settle: async () => {},
    sendBatch: async (batch) => {
      batches.push(batch);
      return { addedCount: batch.rows.length };
    },
    isStopped: () => stopped,
    now: () => 0,
    noCommentsTimeoutMs: 50,
    randomDelayMs: () => 0,
    ...overrides,
  };
  return {
    clicks,
    batches,
    scrolls,
    stop: () => {
      stopped = true;
    },
    deps,
    setStopped(fn) {
      deps.isStopped = fn;
    },
  };
}

describe("runLoop", () => {
  it("fails when the panel cannot be found", async () => {
    const h = harness({ getPanel: () => null, openPanel: () => {} });
    const result = await runLoop(h.deps);
    expect(result).toEqual({
      fail: { code: "PANEL_NOT_FOUND", message: ERRORS.PANEL_NOT_FOUND },
    });
  });

  it("fails NO_COMMENTS_FOUND when the panel stays empty past the timeout", async () => {
    let t = 0;
    const h = harness({
      parseCommentList: () => [],
      now: () => t,
      delay: async () => {
        t += 100;
      },
      noCommentsTimeoutMs: 50,
    });
    const result = await runLoop(h.deps);
    expect(result.fail.code).toBe("NO_COMMENTS_FOUND");
    expect(result.fail.message).toBe(ERRORS.NO_COMMENTS_FOUND);
  });

  it("clicks remaining reply buttons and does not exhaust while they exist", async () => {
    const btn = { id: "view-replies", textContent: "View replies" };
    let finds = 0;
    let added = 0;
    const h = harness({
      findReplyButtons: () => {
        finds += 1;
        return finds < 3 ? [btn] : [];
      },
      sendBatch: async (batch) => {
        h.batches.push(batch);
        added += 1;
        return { addedCount: added === 1 ? 1 : 0 };
      },
    });
    const result = await runLoop(h.deps);
    expect(h.clicks).toContain(btn);
    expect(result.done.reason).toBe("exhausted");
  });

  it("exhausts after three cycles with zero new ids and no reply buttons", async () => {
    const h = harness({
      sendBatch: async (batch) => {
        h.batches.push(batch);
        return { addedCount: 0 };
      },
    });
    const result = await runLoop(h.deps);
    expect(result.done.reason).toBe("exhausted");
    expect(h.batches).toHaveLength(3);
    expect(h.scrolls.length).toBeGreaterThanOrEqual(2);
  });

  it("stops with reason stopped when isStopped becomes true", async () => {
    let n = 0;
    const h = harness({
      sendBatch: async (batch) => {
        h.batches.push(batch);
        n += 1;
        return { addedCount: 1 };
      },
    });
    h.setStopped(() => n >= 1);
    const result = await runLoop(h.deps);
    expect(result.done.reason).toBe("stopped");
  });

  it("does not exhaust an empty panel before the no-comments timeout", async () => {
    let cycles = 0;
    const h = harness({
      parseCommentList: () => [],
      now: () => (cycles >= 5 ? 100 : 0),
      delay: async () => {
        cycles += 1;
      },
      noCommentsTimeoutMs: 50,
    });
    const result = await runLoop(h.deps);
    expect(result.fail?.code).toBe("NO_COMMENTS_FOUND");
    expect(result.done).toBeUndefined();
    expect(cycles).toBeGreaterThanOrEqual(5);
  });

  it("clicks two reply buttons that share the same label", async () => {
    const a = { textContent: "View replies" };
    const b = { textContent: "View replies" };
    let finds = 0;
    const h = harness({
      findReplyButtons: () => {
        finds += 1;
        if (finds === 1) return [a];
        if (finds === 2) return [a, b];
        return [];
      },
      sendBatch: async (batch) => {
        h.batches.push(batch);
        return { addedCount: finds === 1 ? 1 : 0 };
      },
    });
    await runLoop(h.deps);
    expect(h.clicks).toEqual([a, b]);
  });
});
