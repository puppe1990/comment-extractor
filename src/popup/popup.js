import { popupView } from "../lib/popupView.js";

const statusEl = document.getElementById("status");
const counterEl = document.getElementById("counter");
const extractBtn = document.getElementById("extract");
const pauseBtn = document.getElementById("pause");
const downloadBtn = document.getElementById("download");
const reloadBtn = document.getElementById("reload");
const hintEl = document.querySelector(".hint");

let reloading = false;

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function paint(view) {
  if (reloading) return;
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

reloadBtn.addEventListener("click", async () => {
  reloading = true;
  reloadBtn.disabled = true;
  reloadBtn.classList.add("is-busy");
  reloadBtn.textContent = "Recarregando…";
  statusEl.classList.add("status-busy");
  statusEl.textContent = "Recarregando extensões unpacked…";
  if (hintEl) hintEl.textContent = "O popup fecha sozinho ao recarregar.";
  extractBtn.disabled = true;
  pauseBtn.disabled = true;
  downloadBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({
      type: "RELOAD_UNPACKED",
    });
    if (!result?.ok) {
      throw new Error(result?.message || "Falha ao recarregar.");
    }
    const n = result.count || 1;
    statusEl.textContent =
      n > 1
        ? `Recarregando ${n} extensões unpacked…`
        : "Recarregando esta extensão…";
  } catch {
    reloading = false;
    reloadBtn.disabled = false;
    reloadBtn.classList.remove("is-busy");
    reloadBtn.textContent = "Recarregar extensões";
    statusEl.classList.remove("status-busy");
    statusEl.textContent =
      "Não deu para recarregar. Use o botão de recarregar em chrome://extensions.";
    if (hintEl) hintEl.textContent = "Atalho: Alt+Shift+R";
    await refresh();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATE") paint(popupView(msg.state));
});

refresh();
