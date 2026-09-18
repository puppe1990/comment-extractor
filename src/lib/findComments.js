const REPLY_RE =
  /^\s*(view(\s+all)?(\s+\d+)?\s+repl(?:y|ies)|ver(\s+todas)?(\s+as)?(\s+\d+)?\s+respostas?|view more replies|ver mais respostas)\s*$/i;

const COMMENT_BTN_RE = /comment|coment[aá]rio|comentar/i;

export function findCommentsPanel(root) {
  if (!root) return null;
  if (root.matches?.("[data-comments-panel], [role='dialog']")) return root;
  return (
    root.querySelector("[data-comments-panel]") ||
    root.querySelector('[role="dialog"]') ||
    null
  );
}

export function isCommentsPanelOpen(root) {
  return Boolean(findCommentsPanel(root));
}

export function findCommentsButton(root) {
  return (
    [...root.querySelectorAll("button")].find((b) =>
      COMMENT_BTN_RE.test(
        `${b.getAttribute("aria-label") || ""} ${b.textContent}`,
      ),
    ) || null
  );
}

export function findReplyButtons(panel) {
  if (!panel) return [];
  return [...panel.querySelectorAll("button")].filter((b) =>
    REPLY_RE.test(b.textContent.trim()),
  );
}
