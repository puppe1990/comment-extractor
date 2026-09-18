import { findCommentsButton, findCommentsPanel, findReplyButtons } from "../lib/findComments.js";
import { parseCommentList } from "../lib/parseComment.js";
import { runLoop } from "../lib/runLoop.js";
import { scrollPanel } from "../lib/scrollPanel.js";

let stopFlag = false;
let port = null;

function connect() {
  port = chrome.runtime.connect({ name: "extractor" });
}

function settle(ms = 300) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, ms);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(done, 1200);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "STOP") {
    stopFlag = true;
    sendResponse({ ok: true });
    return;
  }
  if (msg.type !== "RUN") return;
  stopFlag = false;
  connect();
  (async () => {
    const result = await runLoop({
      postUrl: msg.postUrl,
      getPanel: () => findCommentsPanel(document),
      openPanel: () => {
        const btn = findCommentsButton(document);
        if (btn) btn.click();
      },
      parseCommentList,
      findReplyButtons,
      click: (el) => el.click(),
      scrollPanel: (panel) => {
        const scroller =
          panel.querySelector("[data-comments-list]") || panel;
        scrollPanel(scroller);
      },
      delay: (ms) => new Promise((r) => setTimeout(r, ms)),
      settle,
      sendBatch: async (batch) =>
        chrome.runtime.sendMessage({ type: "BATCH", ...batch }),
      isStopped: () => stopFlag,
    });
    if (result.fail) {
      await chrome.runtime.sendMessage({
        type: "FAIL",
        postUrl: msg.postUrl,
        code: result.fail.code,
        message: result.fail.message,
      });
    } else {
      await chrome.runtime.sendMessage({
        type: "DONE",
        postUrl: msg.postUrl,
        reason: result.done.reason,
      });
    }
  })();
  sendResponse({ ok: true });
  return true;
});
