import { describe, expect, it } from "vitest";
import {
  createMachine,
  ingest,
  pause,
  start,
} from "../src/lib/extractionMachine.js";

describe("extractionMachine", () => {
  it("starts in idle and start moves to running", () => {
    const idle = createMachine();
    expect(idle.status).toBe("idle");
    expect(start(idle).status).toBe("running");
  });

  it("pause sets paused", () => {
    expect(pause(start(createMachine())).status).toBe("paused");
  });

  it("completes after 10 empty cycles with no reply buttons and no scroll", () => {
    let m = start(createMachine());
    for (let i = 0; i < 9; i += 1) {
      m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
      expect(m.status).toBe("running");
    }
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    expect(m.status).toBe("complete");
  });

  it("stays running when empty but reply buttons remain", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    expect(m.status).toBe("running");
    expect(m.emptyStreak).toBe(0);
  });

  it("stays running when the list still scrolled even with zero new ids", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false, scrolled: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false, scrolled: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false, scrolled: true });
    expect(m.status).toBe("running");
  });

  it("resets empty streak when new ids arrive", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    m = ingest(m, { newCount: 2, hasMoreReplyButtons: false });
    expect(m.emptyStreak).toBe(0);
    expect(m.status).toBe("running");
  });
});
