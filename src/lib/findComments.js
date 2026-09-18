const REPLY_RE =
  /^\s*(view(\s+all)?(\s+\d+)?\s+repl(?:y|ies)|ver(\s+todas)?(\s+as)?(\s+\d+)?\s+respostas?|view more replies|ver mais respostas)\s*$/i;

const COMMENT_BTN_RE = /comment|coment[aá]rio|comentar/i;
const PANEL_HEADING_RE = /^(comments|comentários)$/i;
const COMPOSER_RE = /add a comment|adicione um coment[aá]rio/i;

export function isReplyExpanderLabel(text) {
  return REPLY_RE.test(
    String(text || "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function visibleLabel(el) {
  return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
}

function climbFromHeading(heading) {
  let node = heading.parentElement;
  while (node && node !== heading.ownerDocument?.documentElement) {
    const text = node.innerText || "";
    if (
      node.matches?.('[role="dialog"], [data-comments-panel], section') ||
      COMPOSER_RE.test(text)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return heading.parentElement;
}

export function findCommentsPanel(root) {
  if (!root) return null;

  const withAria = [root, ...root.querySelectorAll("[aria-label]")];
  const byAria = withAria.find((el) => {
    if (!el.getAttribute || el.matches("button, a")) return false;
    return /comment/i.test(el.getAttribute("aria-label") || "");
  });
  if (byAria) return byAria;

  const headingCandidates = [
    ...root.querySelectorAll("h1, h2, h3, [role='heading']"),
  ];
  const heading =
    headingCandidates.find((el) =>
      PANEL_HEADING_RE.test((el.textContent || "").trim()),
    ) ||
    [...root.querySelectorAll("span, div")].find(
      (el) =>
        el.children.length === 0 &&
        PANEL_HEADING_RE.test((el.textContent || "").trim()),
    );
  if (heading) return climbFromHeading(heading);

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
  const nodes = [
    ...panel.querySelectorAll("button, [role='button'], span, div, a"),
  ];
  return nodes.filter((el) => {
    const label = visibleLabel(el);
    if (!isReplyExpanderLabel(label)) return false;
    return ![...el.children].some((child) =>
      isReplyExpanderLabel(visibleLabel(child)),
    );
  });
}
