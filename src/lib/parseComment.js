import {
  commentIdFromHref,
  findCommentsPanel,
  isReplyExpanderLabel,
} from "./findComments.js";
import { commentId } from "./hashId.js";

const RESERVED = new Set([
  "reels",
  "reel",
  "p",
  "stories",
  "explore",
  "accounts",
  "direct",
  "legal",
  "about",
  "lite",
]);

const TIME_RE = /^\d+\s*[smhdwy]$/i;
const CHROME_LINE_RE =
  /^(reply|like|liked by author|hide replies|ocultar respostas|\d+\s*likes?)$/i;

export function findProfileLink(node) {
  const links = [...node.querySelectorAll("a[href]")];
  return (
    links.find((a) => {
      try {
        const path = new URL(
          a.getAttribute("href"),
          "https://www.instagram.com",
        ).pathname;
        const m = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
        return m && !RESERVED.has(m[1].toLowerCase());
      } catch {
        return false;
      }
    }) ?? null
  );
}

export function usernameFromLink(link) {
  if (!link) return "";
  const href = link.getAttribute("href") || "";
  if (commentIdFromHref(href)) return "";
  try {
    const path = new URL(href, "https://www.instagram.com").pathname;
    const match = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
    if (match && !RESERVED.has(match[1].toLowerCase())) return match[1];
  } catch {
    /* fall through to visible text */
  }
  const fromText = link.textContent.trim().replace(/^@/, "");
  if (TIME_RE.test(fromText) || /^https?:/i.test(fromText)) return "";
  if (
    fromText &&
    /^[A-Za-z0-9._]+$/.test(fromText) &&
    !RESERVED.has(fromText.toLowerCase())
  ) {
    return fromText;
  }
  return "";
}

function igIdFromBlock(block) {
  for (const anchor of block.querySelectorAll("a[href]")) {
    const id = commentIdFromHref(anchor.getAttribute("href") || "");
    if (id) return id;
  }
  return null;
}

function isCaption(node) {
  return (
    node.matches("[data-caption]") || Boolean(node.closest("[data-caption]"))
  );
}

export function parseComment(node, { postUrl, parentUsername = "" }) {
  if (!node || isCaption(node)) return null;
  const link = findProfileLink(node);
  if (!link) return null;
  const profileName = usernameFromLink(link);
  const textEl = node.querySelector("[data-comment-text]");
  const commentText = textEl
    ? textEl.textContent.trim()
    : commentTextFromBlock(node, profileName);
  if (!profileName || !commentText) return null;
  const type = parentUsername ? "reply" : "comment";
  const replyTo = type === "reply" ? parentUsername : "";
  const igId = node.getAttribute("data-comment-id");
  return {
    id: commentId(igId, { profileName, type, replyTo, commentText }),
    profileName,
    commentText,
    type,
    replyTo,
    postUrl,
  };
}

function directCommentChildren(container) {
  return [...container.children].filter(
    (el) => el.matches("[data-comment]") && !el.matches("[data-caption]"),
  );
}

function walk(container, parentUsername, postUrl, rows) {
  for (const node of directCommentChildren(container)) {
    const row = parseComment(node, { postUrl, parentUsername });
    if (row) rows.push(row);
    const nested = node.querySelector(":scope > [data-replies]");
    if (nested)
      walk(nested, row ? row.profileName : parentUsername, postUrl, rows);
  }
}

function profileLinksInOrder(panel) {
  return [...panel.querySelectorAll("a[href]")].filter((a) =>
    Boolean(usernameFromLink(a)),
  );
}

function blockText(el) {
  return el.innerText || el.textContent || "";
}

function isNoiseText(line, profileName) {
  if (!line || line === profileName || line === `@${profileName}`) return true;
  if (TIME_RE.test(line) || CHROME_LINE_RE.test(line)) return true;
  if (isReplyExpanderLabel(line)) return true;
  if (/^https?:\/\//i.test(line)) return true;
  return /^\d+$/.test(line);
}

function commentTextFromBlock(block, profileName) {
  const nodes = [...block.querySelectorAll("span, div, p, li")];
  for (const el of nodes) {
    if (el.closest("button, textarea, form")) continue;
    if (el.querySelector("a[href]")) continue;
    const line = (el.innerText || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (isNoiseText(line, profileName)) continue;
    if (el.closest("[role='button']") && isReplyExpanderLabel(line)) continue;
    return line;
  }
  const lines = blockText(block)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines.find((line) => !isNoiseText(line, profileName)) || "";
}

function looksLikeCommentChrome(block) {
  const text = blockText(block).replace(/\s+/g, " ");
  return /\breply\b/i.test(text) || isReplyExpanderLabel(text);
}

function blockForLink(link, panel) {
  let node = link.parentElement;
  if (!node) return null;
  while (node.parentElement && node.parentElement !== panel) {
    const parent = node.parentElement;
    const names = new Set(
      [...parent.querySelectorAll("a[href]")]
        .map(usernameFromLink)
        .filter(Boolean),
    );
    if (names.size > 1) return node;
    node = parent;
  }
  return node;
}

function textFromNode(node, profileName, nextPermalink) {
  if (!node) return "";
  if (node.nodeType !== 1) {
    const raw = (node.textContent || "").replace(/\s+/g, " ").trim();
    return isNoiseText(raw, profileName) ? "" : raw;
  }
  if (nextPermalink && node.contains(nextPermalink)) return "";
  return commentTextFromBlock(node, profileName);
}

function textBetween(start, end, profileName) {
  let current = start;
  while (current) {
    let sibling = current.nextSibling;
    while (sibling) {
      if (end && sibling === end) return "";
      if (end && sibling.nodeType === 1 && sibling.contains(end)) {
        sibling = sibling.nextSibling;
        continue;
      }
      const text = textFromNode(sibling, profileName, end);
      if (text) return text;
      sibling = sibling.nextSibling;
    }
    current = current.parentElement;
  }
  return "";
}

function rowForPermalink(timeLink, panel) {
  let node = timeLink.parentElement;
  let best = node;
  while (node && node !== panel) {
    const first = [...node.querySelectorAll("a[href]")].find((anchor) =>
      commentIdFromHref(anchor.getAttribute("href") || ""),
    );
    if (first === timeLink) best = node;
    node = node.parentElement;
  }
  return best;
}

function parseByPermalinks(panel, permalinks, postUrl) {
  const anchors = [...panel.querySelectorAll("a[href]")];
  const rows = [];
  const seen = new Set();
  const placed = [];
  for (let i = 0; i < permalinks.length; i += 1) {
    const timeLink = permalinks[i];
    const igId = commentIdFromHref(timeLink.getAttribute("href") || "");
    const index = anchors.indexOf(timeLink);
    let profileName = "";
    for (let j = index - 1; j >= 0; j -= 1) {
      const name = usernameFromLink(anchors[j]);
      if (name) {
        profileName = name;
        break;
      }
    }
    const commentText = textBetween(
      timeLink,
      permalinks[i + 1] || null,
      profileName,
    );
    if (!profileName || !commentText) continue;
    if (seen.has(igId)) continue;
    seen.add(igId);
    let parentUsername = "";
    for (let k = placed.length - 1; k >= 0; k -= 1) {
      if (placed[k].rowEl?.contains(timeLink)) {
        parentUsername = placed[k].profileName;
        break;
      }
    }
    const type = parentUsername ? "reply" : "comment";
    const replyTo = parentUsername;
    const rowEl = rowForPermalink(timeLink, panel);
    rows.push({
      id: commentId(igId, { profileName, type, replyTo, commentText }),
      profileName,
      commentText,
      type,
      replyTo,
      postUrl,
    });
    placed.push({ rowEl, profileName });
  }
  return rows;
}

function parseHeuristic(panel, postUrl) {
  const permalinks = [...panel.querySelectorAll("a[href]")].filter((anchor) =>
    commentIdFromHref(anchor.getAttribute("href") || ""),
  );
  if (permalinks.length) return parseByPermalinks(panel, permalinks, postUrl);

  const links = profileLinksInOrder(panel);
  const rows = [];
  const seen = [];
  const seenKeys = new Set();
  for (const link of links) {
    const profileName = usernameFromLink(link);
    const block = blockForLink(link, panel);
    if (!profileName || !block) continue;
    const commentText = commentTextFromBlock(block, profileName);
    if (!commentText) continue;
    let parentUsername = "";
    for (let j = seen.length - 1; j >= 0; j -= 1) {
      if (seen[j].el.contains(block) && seen[j].el !== block) {
        parentUsername = seen[j].profileName;
        break;
      }
    }
    const igId = igIdFromBlock(block);
    if (
      !parentUsername &&
      !igId &&
      !looksLikeCommentChrome(block) &&
      !block.querySelector("[data-comment-text]")
    ) {
      continue;
    }
    const type = parentUsername ? "reply" : "comment";
    const replyTo = parentUsername;
    const key = igId || `${profileName}\n${type}\n${replyTo}\n${commentText}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    rows.push({
      id: commentId(igId, { profileName, type, replyTo, commentText }),
      profileName,
      commentText,
      type,
      replyTo,
      postUrl,
    });
    seen.push({ el: block, profileName });
  }
  return rows;
}

export function parseCommentList(root, postUrl) {
  const rows = [];
  const panel = findCommentsPanel(root) ?? root;
  if (panel.querySelector("[data-comment]")) {
    walk(panel, "", postUrl, rows);
    return rows;
  }
  return parseHeuristic(panel, postUrl);
}
