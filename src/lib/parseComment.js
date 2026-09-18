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

export function findProfileLink(node) {
  const links = [...node.querySelectorAll("a[href]")];
  return (
    links.find((a) => {
      try {
        const path = new URL(a.getAttribute("href"), "https://www.instagram.com")
          .pathname;
        const m = path.match(/^\/([A-Za-z0-9._]+)\/?$/);
        return m && !RESERVED.has(m[1].toLowerCase());
      } catch {
        return false;
      }
    }) ?? null
  );
}

function isCaption(node) {
  return node.matches("[data-caption]") || Boolean(node.closest("[data-caption]"));
}

export function parseComment(node, { postUrl, parentUsername = "" }) {
  if (!node || isCaption(node)) return null;
  const link = findProfileLink(node);
  if (!link) return null;
  const profileName = link.textContent.trim().replace(/^@/, "");
  const textEl = node.querySelector("[data-comment-text]");
  const commentText = textEl ? textEl.textContent.trim() : "";
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
    if (nested) walk(nested, row ? row.profileName : parentUsername, postUrl, rows);
  }
}

export function parseCommentList(root, postUrl) {
  const rows = [];
  const panel = root.matches("[data-comments-panel]")
    ? root
    : root.querySelector("[data-comments-panel]") ?? root;
  walk(panel, "", postUrl, rows);
  return rows;
}
