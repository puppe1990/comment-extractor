import { ERRORS } from "./errors.js";
import { createMachine, ingest, start } from "./extractionMachine.js";
import { findReplyButtons as defaultFindReplyButtons } from "./findComments.js";
import { parseCommentList as defaultParse } from "./parseComment.js";
import { scrollPanel as defaultScroll } from "./scrollPanel.js";

export async function runLoop(deps) {
  const {
    postUrl,
    getPanel,
    openPanel,
    parseCommentList = defaultParse,
    findReplyButtons = defaultFindReplyButtons,
    click,
    scrollPanel = defaultScroll,
    delay,
    settle,
    sendBatch,
    isStopped,
    now = () => Date.now(),
    noCommentsTimeoutMs = 8000,
    panelOpenTimeoutMs = 5000,
    randomDelayMs = () => 400 + Math.floor(Math.random() * 501),
  } = deps;

  const panelWaitStart = now();
  let panel = getPanel();
  while (!panel && now() - panelWaitStart < panelOpenTimeoutMs) {
    const before = now();
    if (openPanel) openPanel();
    await settle();
    panel = getPanel();
    if (panel) break;
    await delay(randomDelayMs());
    if (now() <= before) break;
  }
  if (!panel) {
    return {
      fail: { code: "PANEL_NOT_FOUND", message: ERRORS.PANEL_NOT_FOUND },
    };
  }

  let machine = start(createMachine());
  const clicked = new Set();
  let sawComment = false;
  const startedAt = now();

  while (machine.status === "running") {
    if (isStopped()) {
      return { done: { reason: "stopped", postUrl } };
    }
    panel = getPanel() || panel;
    let rows = parseCommentList(panel, postUrl);
    if (!rows.length && panel !== getPanel()) {
      const latest = getPanel();
      if (latest) {
        panel = latest;
        rows = parseCommentList(panel, postUrl);
      }
    }
    if (rows.length > 0) sawComment = true;
    if (!sawComment && now() - startedAt >= noCommentsTimeoutMs) {
      return {
        fail: { code: "NO_COMMENTS_FOUND", message: ERRORS.NO_COMMENTS_FOUND },
      };
    }
    const buttons = findReplyButtons(panel).filter((b) => {
      return Boolean(b.textContent.trim()) && !clicked.has(b);
    });
    const ack = await sendBatch({
      postUrl,
      rows,
      hasMoreReplyButtons: buttons.length > 0,
    });
    for (const button of buttons) {
      click(button);
      clicked.add(button);
      await settle();
    }
    const scrolled = Boolean(scrollPanel(panel));
    if (sawComment) {
      machine = ingest(machine, {
        newCount: ack.addedCount,
        hasMoreReplyButtons: buttons.length > 0,
        scrolled,
      });
    }
    if (machine.status !== "running") break;
    await delay(scrolled ? 900 + randomDelayMs() : randomDelayMs());
  }

  if (machine.status === "complete") {
    return { done: { reason: "exhausted", postUrl } };
  }
  return { done: { reason: "stopped", postUrl } };
}
