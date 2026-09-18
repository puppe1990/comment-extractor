import { canonicalPostUrl } from "./canonicalPostUrl.js";
import { dedupe } from "./dedupe.js";
import { csvFilename, toCsv } from "./toCsv.js";
import { ERRORS } from "./errors.js";

export function createStore() {
  return { records: {}, runningPostUrl: null };
}

export function emptyRecord(postUrl, shortcode, now) {
  return {
    postUrl,
    shortcode,
    rows: [],
    status: "idle",
    errorMessage: "",
    updatedAt: now,
  };
}

function counts(rows) {
  let comments = 0;
  let replies = 0;
  for (const row of rows) {
    if (row.type === "reply") replies += 1;
    else comments += 1;
  }
  return { comments, replies };
}

function ensureRecord(store, postUrl, shortcode, now) {
  if (!store.records[postUrl]) {
    store = {
      ...store,
      records: {
        ...store.records,
        [postUrl]: emptyRecord(postUrl, shortcode, now),
      },
    };
  }
  return store;
}

function patch(store, postUrl, now, fields) {
  const current = store.records[postUrl];
  return {
    ...store,
    records: {
      ...store.records,
      [postUrl]: { ...current, ...fields, updatedAt: now },
    },
  };
}

export function handleGetState(store, tabUrl, now) {
  const parsed = canonicalPostUrl(tabUrl);
  if (!parsed.ok) return { supported: false, record: null };
  const record =
    store.records[parsed.postUrl] ??
    emptyRecord(parsed.postUrl, parsed.shortcode, now);
  return {
    supported: true,
    record,
    postUrl: parsed.postUrl,
    shortcode: parsed.shortcode,
  };
}

export function handleStart(store, tabUrl, now) {
  const parsed = canonicalPostUrl(tabUrl);
  if (!parsed.ok) return { store, effect: null, error: "UNSUPPORTED_URL" };
  store = ensureRecord(store, parsed.postUrl, parsed.shortcode, now);
  store = patch(store, parsed.postUrl, now, {
    status: "running",
    errorMessage: "",
  });
  store = { ...store, runningPostUrl: parsed.postUrl };
  return {
    store,
    effect: { type: "RUN", postUrl: parsed.postUrl },
    error: null,
  };
}

export function handlePause(store, now) {
  const postUrl = store.runningPostUrl;
  if (!postUrl || !store.records[postUrl])
    return { store, effect: { type: "STOP" } };
  store = patch(store, postUrl, now, { status: "paused" });
  store = { ...store, runningPostUrl: null };
  return { store, effect: { type: "STOP" } };
}

export function handleBatch(store, { postUrl, rows }, now) {
  if (store.runningPostUrl !== postUrl || !store.records[postUrl]) {
    return { store, ack: { addedCount: 0, totalComments: 0, totalReplies: 0 } };
  }
  const { rows: merged, added } = dedupe(store.records[postUrl].rows, rows);
  store = patch(store, postUrl, now, { rows: merged });
  const { comments, replies } = counts(merged);
  return {
    store,
    ack: {
      addedCount: added.length,
      totalComments: comments,
      totalReplies: replies,
    },
  };
}

export function handleDone(store, { postUrl, reason }, now) {
  if (!store.records[postUrl]) return { store };
  const status = reason === "exhausted" ? "complete" : "paused";
  store = patch(store, postUrl, now, { status });
  if (store.runningPostUrl === postUrl)
    store = { ...store, runningPostUrl: null };
  return { store };
}

export function handleFail(store, { postUrl, code, message }, now) {
  if (!store.records[postUrl]) return { store };
  store = patch(store, postUrl, now, {
    status: "error",
    errorMessage: message || ERRORS[code] || code,
  });
  if (store.runningPostUrl === postUrl)
    store = { ...store, runningPostUrl: null };
  return { store };
}

export function handleDownload(store, tabUrl, now, date = new Date()) {
  const parsed = canonicalPostUrl(tabUrl);
  if (!parsed.ok) return { store, effect: null };
  const record = store.records[parsed.postUrl];
  if (!record || record.rows.length < 1) return { store, effect: null };
  return {
    store,
    effect: {
      type: "DOWNLOAD",
      filename: csvFilename(record.shortcode, date),
      csv: toCsv(record.rows),
    },
  };
}

export function handleClear(store, tabUrl, now) {
  const parsed = canonicalPostUrl(tabUrl);
  if (!parsed.ok) {
    const effect = store.runningPostUrl ? { type: "STOP" } : null;
    return { store: createStore(), effect };
  }
  const wasRunning = store.runningPostUrl === parsed.postUrl;
  store = {
    ...store,
    records: {
      ...store.records,
      [parsed.postUrl]: emptyRecord(parsed.postUrl, parsed.shortcode, now),
    },
    runningPostUrl: wasRunning ? null : store.runningPostUrl,
  };
  return { store, effect: wasRunning ? { type: "STOP" } : null };
}

export function handleDisconnect(store, now) {
  const postUrl = store.runningPostUrl;
  if (!postUrl || !store.records[postUrl]) return { store };
  const hasRows = store.records[postUrl].rows.length > 0;
  store = patch(store, postUrl, now, { status: hasRows ? "paused" : "idle" });
  return { store: { ...store, runningPostUrl: null } };
}
