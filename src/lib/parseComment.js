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

function profileLinksInOrder(panel) {
  return [...panel.querySelectorAll("a[href]")].filter((a) =>
    Boolean(findProfileLink(a.parentElement ?? a)),
  );
}

function commentTextFromBlock(block, profileName) {
  const spans = [...block.querySelectorAll("span")];
  const hit = spans.find((s) => {
    const t = s.textContent.trim();
    if (!t || t === profileName) return false;
    if (s.closest("button")) return false;
    return true;
  });
  return hit ? hit.textContent.trim() : "";
}

function parseHeuristic(panel, postUrl) {
  const links = profileLinksInOrder(panel);
  const rows = [];
  const seen = [];
  for (let i = 1; i < links.length; i += 1) {
    const link = links[i];
    const profileName = link.textContent.trim().replace(/^@/, "");
    const block = link.parentElement;
    const commentText = commentTextFromBlock(block, profileName);
    if (!profileName || !commentText) continue;
    let parentUsername = "";
    for (let j = seen.length - 1; j >= 0; j -= 1) {
      if (seen[j].el.contains(block) && seen[j].el !== block) {
        parentUsername = seen[j].profileName;
        break;
      }
    }
    const type = parentUsername ? "reply" : "comment";
    const replyTo = parentUsername;
    rows.push({
      id: commentId(null, { profileName, type, replyTo, commentText }),
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
  const panel = findPanel(root);
  if (panel.querySelector("[data-comment]")) {
    walk(panel, "", postUrl, rows);
    return rows;
  }
  return parseHeuristic(panel, postUrl);
}

function findPanel(root) {
  if (root.matches?.("[data-comments-panel], [role='dialog']")) return root;
  return (
    root.querySelector("[data-comments-panel]") ||
    root.querySelector('[role="dialog"]') ||
    root
  );
}
