const REPLY_RE =
  /^\s*(view(\s+all)?(\s+\d+)?\s+repl(?:y|ies)|ver(\s+todas)?(\s+as)?(\s+\d+)?\s+respostas?|view more replies|ver mais respostas)\s*$/i;

const COMMENT_BTN_RE = /comment|coment[aá]rio|comentar/i;
const PANEL_HEADING_RE = /^(comments|comentários)$/i;
const COMPOSER_RE = /add a comment|adicione um coment[aá]rio/i;

export function commentIdFromHref(href) {
  try {
    const path = new URL(href, "https://www.instagram.com").pathname;
    const match = path.match(/\/(?:p|reel|reels)\/[^/]+\/c\/(\d+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export function findCommentPermalinkAnchors(root) {
  if (!root?.querySelectorAll) return [];
  return [...root.querySelectorAll("a[href]")].filter((anchor) =>
    Boolean(commentIdFromHref(anchor.getAttribute("href") || "")),
  );
}

function panelFromCommentLinks(root) {
  const anchors = findCommentPermalinkAnchors(root);
  if (!anchors.length) return null;
  let node = anchors[0].parentElement;
  while (node && node !== root) {
    if (anchors.every((anchor) => node.contains(anchor))) return node;
    node = node.parentElement;
  }
  return node;
}

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

function isCommentActionControl(el) {
  return el.matches("button, a, svg, [role='button']");
}

export function findCommentsPanel(root) {
  if (!root) return null;

  const fromLinks = panelFromCommentLinks(root);
  if (fromLinks) return fromLinks;

  const withAria = [root, ...root.querySelectorAll("[aria-label]")];
  const byAria = withAria.find((el) => {
    if (!el.getAttribute || isCommentActionControl(el)) return false;
    const aria = (el.getAttribute("aria-label") || "").trim();
    if (PANEL_HEADING_RE.test(aria)) return true;
    return (
      /comment/i.test(aria) &&
      el.matches('[role="dialog"], [role="complementary"], section')
    );
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

  const dialogs = [root, ...root.querySelectorAll('[role="dialog"]')].filter(
    (el) => el.matches?.('[role="dialog"]'),
  );
  const dialogWithComments = dialogs.find(
    (el) =>
      findCommentPermalinkAnchors(el).length > 0 ||
      PANEL_HEADING_RE.test(
        (el.innerText || el.textContent || "").split("\n")[0] || "",
      ),
  );
  if (dialogWithComments) return dialogWithComments;

  if (root.matches?.("[data-comments-panel], [role='dialog']")) return root;
  return root.querySelector("[data-comments-panel]") || null;
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
