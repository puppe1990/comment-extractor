import { popupView } from "../lib/popupView.js";

const statusEl = document.getElementById("status");
const counterEl = document.getElementById("counter");
const extractBtn = document.getElementById("extract");
const pauseBtn = document.getElementById("pause");
const downloadBtn = document.getElementById("download");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function paint(view) {
  statusEl.textContent = view.statusText;
  counterEl.textContent = view.counterText;
  extractBtn.disabled = !view.extractEnabled;
  pauseBtn.disabled = !view.pauseEnabled;
  downloadBtn.disabled = !view.downloadEnabled;
}

async function refresh() {
  const tab = await activeTab();
  const state = await chrome.runtime.sendMessage({
    type: "GET_STATE",
    tabId: tab.id,
    tabUrl: tab.url,
  });
  paint(popupView(state));
}

extractBtn.addEventListener("click", async () => {
  const tab = await activeTab();
  await chrome.runtime.sendMessage({
    type: "START",
    tabId: tab.id,
    tabUrl: tab.url,
  });
  await refresh();
});

pauseBtn.addEventListener("click", async () => {
  const tab = await activeTab();
  await chrome.runtime.sendMessage({ type: "PAUSE", tabId: tab.id });
  await refresh();
});

downloadBtn.addEventListener("click", async () => {
  const tab = await activeTab();
  await chrome.runtime.sendMessage({
    type: "DOWNLOAD",
    tabId: tab.id,
    tabUrl: tab.url,
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE") paint(popupView(msg.state));
});

refresh();
