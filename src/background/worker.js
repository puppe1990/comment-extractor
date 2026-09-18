import { unpackedToReload } from "../lib/reloadUnpacked.js";
import {
  createStore,
  handleBatch,
  handleDisconnect,
  handleDownload,
  handleDone,
  handleFail,
  handleGetState,
  handlePause,
  handleStart,
} from "../lib/workerLogic.js";

const KEY = "extractorStore";

async function loadStore() {
  const data = await chrome.storage.local.get(KEY);
  return data[KEY] ?? createStore();
}

async function saveStore(store) {
  await chrome.storage.local.set({ [KEY]: store });
}

function broadcast(state) {
  chrome.runtime.sendMessage({ type: "STATE", state }).catch(() => {});
}

async function reloadUnpackedExtensions() {
  const all = await chrome.management.getAll();
  const others = unpackedToReload(all, chrome.runtime.id);
  for (const ext of others) {
    await chrome.management.setEnabled(ext.id, false);
    await chrome.management.setEnabled(ext.id, true);
  }
  chrome.runtime.reload();
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "reload-unpacked") {
    reloadUnpackedExtensions();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "RELOAD_UNPACKED") {
      sendResponse({ ok: true });
      await reloadUnpackedExtensions();
      return;
    }
    let store = await loadStore();
    const now = Date.now();
    if (msg.type === "GET_STATE") {
      const state = handleGetState(store, msg.tabUrl, now);
      sendResponse(state);
      return;
    }
    if (msg.type === "START") {
      const result = handleStart(store, msg.tabUrl, now);
      await saveStore(result.store);
      if (result.effect?.type === "RUN") {
        try {
          await chrome.tabs.sendMessage(msg.tabId, {
            type: "RUN",
            postUrl: result.effect.postUrl,
          });
        } catch {
          const failed = handleFail(
            result.store,
            {
              postUrl: result.effect.postUrl,
              code: "CONTENT_SCRIPT_MISSING",
              message: "Recarregue a página do Reel e tente de novo.",
            },
            now,
          );
          await saveStore(failed.store);
          broadcast(handleGetState(failed.store, msg.tabUrl, now));
          sendResponse(failed);
          return;
        }
      }
      broadcast(handleGetState(result.store, msg.tabUrl, now));
      sendResponse(result);
      return;
    }
    if (msg.type === "PAUSE") {
      const postUrl = store.runningPostUrl;
      const result = handlePause(store, now);
      await saveStore(result.store);
      if (msg.tabId) {
        chrome.tabs.sendMessage(msg.tabId, { type: "STOP" }).catch(() => {});
      }
      if (postUrl) {
        broadcast(handleGetState(result.store, postUrl, now));
      }
      sendResponse(result);
      return;
    }
    if (msg.type === "DOWNLOAD") {
      const result = handleDownload(store, msg.tabUrl, now, new Date());
      if (result.effect?.type === "DOWNLOAD") {
        const blobUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(result.effect.csv)}`;
        await chrome.downloads.download({
          url: blobUrl,
          filename: result.effect.filename,
          saveAs: true,
        });
      }
      sendResponse(result);
      return;
    }
    if (msg.type === "BATCH") {
      const result = handleBatch(store, msg, now);
      await saveStore(result.store);
      if (msg.postUrl) {
        broadcast(handleGetState(result.store, msg.postUrl, now));
      }
      sendResponse(result.ack);
      return;
    }
    if (msg.type === "DONE") {
      const result = handleDone(store, msg, now);
      await saveStore(result.store);
      if (msg.postUrl) {
        broadcast(handleGetState(result.store, msg.postUrl, now));
      }
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "FAIL") {
      const result = handleFail(store, msg, now);
      await saveStore(result.store);
      if (msg.postUrl) {
        broadcast(handleGetState(result.store, msg.postUrl, now));
      }
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "extractor") return;
  port.onDisconnect.addListener(async () => {
    const store = await loadStore();
    const now = Date.now();
    const postUrl = store.runningPostUrl;
    const result = handleDisconnect(store, now);
    await saveStore(result.store);
    if (postUrl) {
      broadcast(handleGetState(result.store, postUrl, now));
    }
  });
});
