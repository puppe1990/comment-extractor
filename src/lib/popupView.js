import { ERRORS } from "./errors.js";

export function countByType(rows) {
  let comments = 0;
  let replies = 0;
  for (const row of rows || []) {
    if (row.type === "reply") replies += 1;
    else if (row.type === "comment") comments += 1;
  }
  return { comments, replies };
}

export function popupView({ supported, record }) {
  if (!supported) {
    return {
      extractEnabled: false,
      pauseEnabled: false,
      downloadEnabled: false,
      statusText: ERRORS.UNSUPPORTED_URL,
      counterText: "0 comentários · 0 respostas",
    };
  }
  const { comments, replies } = countByType(record.rows);
  const counterText = `${comments} comentários · ${replies} respostas`;
  const downloadEnabled = (record.rows || []).length >= 1;
  if (record.status === "running") {
    return {
      extractEnabled: false,
      pauseEnabled: true,
      downloadEnabled,
      statusText: "Extraindo…",
      counterText,
    };
  }
  if (record.status === "paused") {
    return {
      extractEnabled: true,
      pauseEnabled: false,
      downloadEnabled,
      statusText: "Pausado",
      counterText,
    };
  }
  if (record.status === "complete") {
    return {
      extractEnabled: true,
      pauseEnabled: false,
      downloadEnabled,
      statusText: "Concluído",
      counterText,
    };
  }
  if (record.status === "error") {
    return {
      extractEnabled: true,
      pauseEnabled: false,
      downloadEnabled,
      statusText: record.errorMessage,
      counterText,
    };
  }
  return {
    extractEnabled: true,
    pauseEnabled: false,
    downloadEnabled,
    statusText: "",
    counterText,
  };
}
