# Instagram Reels Comment Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Manifest V3 Chrome extension that, on an open Instagram Reel (`/reels/{shortcode}/`), scrolls the comments panel, expands replies, saves rows incrementally, and downloads a CSV (`profile_name,comment_text,type,reply_to,post_url`).

**Architecture:** Pure modules in `src/lib/` own URL, parse, dedupe, CSV, machine, worker reduce, popup view, and the extraction loop. The service worker and content script are thin adapters over Chrome APIs. Popup talks only to the worker. Content scripts load ESM via a classic bootstrap + `import()` because Chrome does not allow static `import` in declarative content scripts.

**Tech Stack:** Vanilla JS ESM, Chrome MV3, Vitest + jsdom. No bundler, no framework.

**Spec:** `docs/superpowers/specs/2026-09-18-instagram-reels-comment-extractor-design.md`

---

## File map

| File                           | Responsibility                                                            |
| ------------------------------ | ------------------------------------------------------------------------- |
| `package.json`                 | `"type": "module"`, `vitest`                                              |
| `vitest.config.js`             | jsdom environment                                                         |
| `.gitignore`                   | `node_modules`                                                            |
| `manifest.json`                | MV3, popup, module worker, content bootstrap, WAR for ESM                 |
| `src/lib/hashId.js`            | FNV-1a 64-bit; `hash:` / `ig:` ids                                        |
| `src/lib/canonicalPostUrl.js`  | Accept only `/reels/{shortcode}`, canonicalize                            |
| `src/lib/errors.js`            | User-facing Portuguese messages                                           |
| `src/lib/toCsv.js`             | BOM CSV + download filename                                               |
| `src/lib/dedupe.js`            | Merge unique rows by `id`, keep order                                     |
| `src/lib/parseComment.js`      | Node → row; list walk including nested replies                            |
| `src/lib/findComments.js`      | Panel, comments button, reply buttons, comment nodes                      |
| `src/lib/extractionMachine.js` | idle/running/paused/complete + empty streak                               |
| `src/lib/scrollPanel.js`       | Scroll the panel container, not `window`                                  |
| `src/lib/workerLogic.js`       | Records keyed by postUrl; START/PAUSE/BATCH/DONE/FAIL/DOWNLOAD/disconnect |
| `src/lib/popupView.js`         | Button flags, status text, counter                                        |
| `src/lib/runLoop.js`           | Cycle: parse, batch, expand replies, scroll, stop rules                   |
| `src/background/worker.js`     | Chrome storage, ports, downloads, tab messaging                           |
| `src/content/bootstrap.js`     | Classic script; dynamic `import()` of extractor                           |
| `src/content/extractor.js`     | DOM adapter calling `runLoop`                                             |
| `src/popup/popup.html`         | PT UI                                                                     |
| `src/popup/popup.css`          | Layout                                                                    |
| `src/popup/popup.js`           | GET_STATE / START / PAUSE / DOWNLOAD                                      |
| `tests/*.test.js`              | One test file per lib module                                              |
| `tests/fixtures/*.html`        | Panel shapes                                                              |

Do not create a bundler, React, or settings page.

---

### Task 1: Scaffold Vitest

**Files:**

- Create: `package.json`
- Create: `vitest.config.js`
- Create: `.gitignore`

- [ ] **Step 1: Write scaffold files**

`package.json`:

```json
{
  "name": "comment-extractor",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

`vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

`.gitignore`:

```
node_modules
```

- [ ] **Step 2: Install**

Run: `rtk npm install`

Expected: `vitest` and `jsdom` in `node_modules`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json vitest.config.js .gitignore
git commit -m "chore: scaffold vitest for the chrome extension"
```

---

### Task 2: hashId

**Files:**

- Create: `tests/hashId.test.js`
- Create: `src/lib/hashId.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { commentId, hashId } from "../src/lib/hashId.js";

const fields = {
  profileName: "ana",
  type: "comment",
  replyTo: "",
  commentText: "amei",
};

describe("hashId", () => {
  it("returns a stable hash: prefix for the same fields", () => {
    expect(hashId(fields)).toBe(hashId(fields));
    expect(hashId(fields)).toMatch(/^hash:[0-9a-f]{16}$/);
  });

  it("changes when comment text changes", () => {
    expect(hashId({ ...fields, commentText: "x" })).not.toBe(
      hashId({ ...fields, commentText: "y" }),
    );
  });
});

describe("commentId", () => {
  it("prefers an Instagram id when present", () => {
    expect(commentId("123", fields)).toBe("ig:123");
  });

  it("falls back to hash when Instagram id is missing", () => {
    expect(commentId("", fields)).toBe(hashId(fields));
    expect(commentId(null, fields)).toBe(hashId(fields));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/hashId.test.js`

Expected: FAIL resolving `../src/lib/hashId.js` or export missing.

- [ ] **Step 3: Write minimal implementation**

```js
export function fnv1a64(str) {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const ch of str) {
    h ^= BigInt(ch.codePointAt(0));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function hashId({ profileName, type, replyTo, commentText }) {
  return `hash:${fnv1a64(`${profileName}\n${type}\n${replyTo}\n${commentText}`)}`;
}

export function commentId(nodeId, fields) {
  if (nodeId) return `ig:${nodeId}`;
  return hashId(fields);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/hashId.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/hashId.test.js src/lib/hashId.js
git commit -m "feat: add stable comment ids"
```

---

### Task 3: canonicalPostUrl

**Files:**

- Create: `tests/canonicalPostUrl.test.js`
- Create: `src/lib/canonicalPostUrl.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { canonicalPostUrl } from "../src/lib/canonicalPostUrl.js";

describe("canonicalPostUrl", () => {
  it("canonicalizes www, query, and trailing slash", () => {
    expect(
      canonicalPostUrl("https://instagram.com/reels/DcxhtUfOJj4/?utm=share"),
    ).toEqual({
      ok: true,
      postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      shortcode: "DcxhtUfOJj4",
    });
  });

  it("accepts an already canonical reels URL", () => {
    expect(
      canonicalPostUrl("https://www.instagram.com/reels/DcxhtUfOJj4/"),
    ).toMatchObject({ ok: true, shortcode: "DcxhtUfOJj4" });
  });

  it("rejects /reel/, /p/, and other paths", () => {
    expect(
      canonicalPostUrl("https://www.instagram.com/reel/DcxhtUfOJj4/").ok,
    ).toBe(false);
    expect(
      canonicalPostUrl("https://www.instagram.com/p/DcxhtUfOJj4/").ok,
    ).toBe(false);
    expect(canonicalPostUrl("https://www.instagram.com/").ok).toBe(false);
  });

  it("rejects an empty or invalid href", () => {
    expect(canonicalPostUrl("").ok).toBe(false);
    expect(canonicalPostUrl("not a url").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/canonicalPostUrl.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
const SHORTCODE = /^[A-Za-z0-9_-]+$/;

export function canonicalPostUrl(href) {
  try {
    const url = new URL(href);
    if (!/^(www\.)?instagram\.com$/i.test(url.hostname)) return { ok: false };
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || parts[0] !== "reels") return { ok: false };
    const shortcode = parts[1];
    if (!SHORTCODE.test(shortcode)) return { ok: false };
    return {
      ok: true,
      postUrl: `https://www.instagram.com/reels/${shortcode}/`,
      shortcode,
    };
  } catch {
    return { ok: false };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/canonicalPostUrl.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/canonicalPostUrl.test.js src/lib/canonicalPostUrl.js
git commit -m "feat: canonicalize Instagram reels URLs"
```

---

### Task 4: errors and CSV helpers

**Files:**

- Create: `tests/toCsv.test.js`
- Create: `src/lib/errors.js`
- Create: `src/lib/toCsv.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { csvFilename, toCsv } from "../src/lib/toCsv.js";
import { ERRORS } from "../src/lib/errors.js";

describe("toCsv", () => {
  it("writes BOM, header, and empty reply_to for comments", () => {
    const csv = toCsv([
      {
        profileName: "ana",
        commentText: "amei",
        type: "comment",
        replyTo: "",
        postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      },
      {
        profileName: "bruno",
        commentText: 'eu, "também"',
        type: "reply",
        replyTo: "ana",
        postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
      },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const body = csv.slice(1);
    expect(body).toContain("profile_name,comment_text,type,reply_to,post_url");
    expect(body).toContain(
      "ana,amei,comment,,https://www.instagram.com/reels/DcxhtUfOJj4/",
    );
    expect(body).toContain('"eu, ""também"""');
  });

  it("escapes newlines inside comment text", () => {
    const csv = toCsv([
      {
        profileName: "ana",
        commentText: "linha1\nlinha2",
        type: "comment",
        replyTo: "",
        postUrl: "https://www.instagram.com/reels/x/",
      },
    ]);
    expect(csv).toContain('"linha1\nlinha2"');
  });
});

describe("csvFilename", () => {
  it("uses shortcode and local date", () => {
    const date = new Date(2026, 8, 18);
    expect(csvFilename("DcxhtUfOJj4", date)).toBe(
      "instagram-comments-DcxhtUfOJj4-2026-09-18.csv",
    );
  });
});

describe("ERRORS", () => {
  it("exposes the Portuguese catalog", () => {
    expect(ERRORS.UNSUPPORTED_URL).toBe(
      "Abra um Reel do Instagram para extrair comentários.",
    );
    expect(ERRORS.PANEL_NOT_FOUND).toBe(
      "Abra os comentários deste Reel e tente de novo.",
    );
    expect(ERRORS.NO_COMMENTS_FOUND).toBe(
      "Não encontrei comentários neste layout. O Instagram pode ter mudado a página.",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/toCsv.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

`src/lib/errors.js`:

```js
export const ERRORS = {
  UNSUPPORTED_URL: "Abra um Reel do Instagram para extrair comentários.",
  PANEL_NOT_FOUND: "Abra os comentários deste Reel e tente de novo.",
  NO_COMMENTS_FOUND:
    "Não encontrei comentários neste layout. O Instagram pode ter mudado a página.",
};
```

`src/lib/toCsv.js`:

```js
const HEADER = ["profile_name", "comment_text", "type", "reply_to", "post_url"];

function escapeField(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(rows) {
  const lines = [HEADER.join(",")];
  for (const row of rows) {
    lines.push(
      [row.profileName, row.commentText, row.type, row.replyTo, row.postUrl]
        .map(escapeField)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function csvFilename(shortcode, date = new Date()) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `instagram-comments-${shortcode}-${y}-${m}-${d}.csv`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/toCsv.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/toCsv.test.js src/lib/toCsv.js src/lib/errors.js
git commit -m "feat: serialize comments CSV with BOM"
```

---

### Task 5: dedupe

**Files:**

- Create: `tests/dedupe.test.js`
- Create: `src/lib/dedupe.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { dedupe } from "../src/lib/dedupe.js";

const a = { id: "ig:1", profileName: "ana", commentText: "a" };
const b = { id: "ig:2", profileName: "bruno", commentText: "b" };
const a2 = { id: "ig:1", profileName: "ana", commentText: "changed" };

describe("dedupe", () => {
  it("appends new ids and keeps existing order", () => {
    const { rows, added } = dedupe([a], [a2, b]);
    expect(rows).toEqual([a, b]);
    expect(added).toEqual([b]);
  });

  it("returns empty added when everything is duplicate", () => {
    const { rows, added } = dedupe([a, b], [a, b]);
    expect(rows).toEqual([a, b]);
    expect(added).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/dedupe.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
export function dedupe(existingRows, incomingRows) {
  const seen = new Set(existingRows.map((r) => r.id));
  const rows = existingRows.slice();
  const added = [];
  for (const row of incomingRows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
    added.push(row);
  }
  return { rows, added };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/dedupe.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/dedupe.test.js src/lib/dedupe.js
git commit -m "feat: dedupe comment rows by id"
```

---

### Task 6: parseComment (top-level and replies)

**Files:**

- Create: `tests/fixtures/one-comment.html`
- Create: `tests/fixtures/comment-and-replies.html`
- Create: `tests/fixtures/nested-replies.html`
- Create: `tests/fixtures/caption-and-comments.html`
- Create: `tests/parseComment.test.js`
- Create: `src/lib/parseComment.js`

- [ ] **Step 1: Write fixtures and the failing test**

`tests/fixtures/one-comment.html`:

```html
<div data-comments-panel>
  <article data-comment data-comment-id="c1">
    <a href="/ana.silva/">ana.silva</a>
    <span data-comment-text>amei esse reel</span>
  </article>
</div>
```

`tests/fixtures/comment-and-replies.html`:

```html
<div data-comments-panel>
  <article data-comment data-comment-id="c1">
    <a href="/ana/">ana</a>
    <span data-comment-text>amei</span>
    <div data-replies>
      <article data-comment data-reply data-comment-id="r1">
        <a href="/bruno/">bruno</a>
        <span data-comment-text>eu também</span>
      </article>
    </div>
  </article>
</div>
```

`tests/fixtures/nested-replies.html`:

```html
<div data-comments-panel>
  <article data-comment data-comment-id="c1">
    <a href="/ana/">ana</a>
    <span data-comment-text>top</span>
    <div data-replies>
      <article data-comment data-reply data-comment-id="r1">
        <a href="/bruno/">bruno</a>
        <span data-comment-text>mid</span>
        <div data-replies>
          <article data-comment data-reply data-comment-id="r2">
            <a href="/carla/">carla</a>
            <span data-comment-text>nested</span>
          </article>
        </div>
      </article>
    </div>
  </article>
</div>
```

`tests/fixtures/caption-and-comments.html`:

```html
<div data-comments-panel>
  <div data-caption>
    <a href="/creator/">creator</a>
    <span data-comment-text>minha caption</span>
  </div>
  <article data-comment data-comment-id="c1">
    <a href="/ana/">ana</a>
    <span data-comment-text>real comment</span>
  </article>
  <button type="button">Like</button>
  <form><textarea placeholder="Add a comment"></textarea></form>
</div>
```

`tests/parseComment.test.js`:

```js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseComment, parseCommentList } from "../src/lib/parseComment.js";

const dir = dirname(fileURLToPath(import.meta.url));
const POST = "https://www.instagram.com/reels/DcxhtUfOJj4/";

function load(name) {
  const html = readFileSync(join(dir, "fixtures", name), "utf8");
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

describe("parseComment", () => {
  it("reads username without @, text, comment type, empty replyTo", () => {
    const panel = load("one-comment.html");
    const node = panel.querySelector("[data-comment]");
    expect(parseComment(node, { postUrl: POST })).toMatchObject({
      id: "ig:c1",
      profileName: "ana.silva",
      commentText: "amei esse reel",
      type: "comment",
      replyTo: "",
      postUrl: POST,
    });
  });

  it("sets reply type and immediate parent username", () => {
    const panel = load("comment-and-replies.html");
    const reply = panel.querySelector("[data-reply]");
    expect(
      parseComment(reply, { postUrl: POST, parentUsername: "ana" }),
    ).toMatchObject({
      id: "ig:r1",
      profileName: "bruno",
      commentText: "eu também",
      type: "reply",
      replyTo: "ana",
    });
  });
});

describe("parseCommentList", () => {
  it("walks comments and nested replies with immediate parents", () => {
    const panel = load("nested-replies.html");
    expect(parseCommentList(panel, POST)).toEqual([
      expect.objectContaining({
        profileName: "ana",
        type: "comment",
        replyTo: "",
        commentText: "top",
      }),
      expect.objectContaining({
        profileName: "bruno",
        type: "reply",
        replyTo: "ana",
        commentText: "mid",
      }),
      expect.objectContaining({
        profileName: "carla",
        type: "reply",
        replyTo: "bruno",
        commentText: "nested",
      }),
    ]);
  });

  it("skips caption, like buttons, composer, and empty nodes", () => {
    const panel = load("caption-and-comments.html");
    const rows = parseCommentList(panel, POST);
    expect(rows).toHaveLength(1);
    expect(rows[0].commentText).toBe("real comment");
    expect(rows[0].profileName).toBe("ana");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/parseComment.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
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

function isCaption(node) {
  return (
    node.matches("[data-caption]") || Boolean(node.closest("[data-caption]"))
  );
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
    if (nested)
      walk(nested, row ? row.profileName : parentUsername, postUrl, rows);
  }
}

export function parseCommentList(root, postUrl) {
  const rows = [];
  const panel = root.matches("[data-comments-panel]")
    ? root
    : (root.querySelector("[data-comments-panel]") ?? root);
  walk(panel, "", postUrl, rows);
  return rows;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/parseComment.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/parseComment.test.js tests/fixtures src/lib/parseComment.js
git commit -m "feat: parse comments and nested replies from panel DOM"
```

---

### Task 7: findComments (panel and reply buttons)

**Files:**

- Create: `tests/fixtures/panel-open.html`
- Create: `tests/fixtures/panel-closed.html`
- Create: `tests/fixtures/reply-buttons-en.html`
- Create: `tests/fixtures/reply-buttons-pt.html`
- Create: `tests/findComments.test.js`
- Create: `src/lib/findComments.js`

- [ ] **Step 1: Write fixtures and the failing test**

`tests/fixtures/panel-open.html`:

```html
<div>
  <button type="button" aria-label="Comment">Comment</button>
  <div role="dialog" data-comments-panel>
    <article data-comment>
      <a href="/ana/">ana</a>
      <span data-comment-text>oi</span>
    </article>
  </div>
</div>
```

`tests/fixtures/panel-closed.html`:

```html
<div>
  <button type="button" aria-label="Comentar">Comentar</button>
  <article>reel video</article>
</div>
```

`tests/fixtures/reply-buttons-en.html`:

```html
<div data-comments-panel>
  <button type="button">View replies</button>
  <button type="button">View 3 replies</button>
  <button type="button">View more replies</button>
  <button type="button">Hide replies</button>
  <button type="button">Like</button>
</div>
```

`tests/fixtures/reply-buttons-pt.html`:

```html
<div data-comments-panel>
  <button type="button">Ver respostas</button>
  <button type="button">Ver 3 respostas</button>
  <button type="button">Ver mais respostas</button>
  <button type="button">Ocultar respostas</button>
</div>
```

`tests/findComments.test.js`:

```js
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findCommentsButton,
  findCommentsPanel,
  findReplyButtons,
  isCommentsPanelOpen,
} from "../src/lib/findComments.js";

const dir = dirname(fileURLToPath(import.meta.url));

function load(name) {
  const html = readFileSync(join(dir, "fixtures", name), "utf8");
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

describe("findCommentsPanel", () => {
  it("returns the panel node when open", () => {
    const root = load("panel-open.html");
    const panel = findCommentsPanel(root);
    expect(panel).not.toBeNull();
    expect(isCommentsPanelOpen(root)).toBe(true);
  });

  it("returns null when the panel is closed", () => {
    const root = load("panel-closed.html");
    expect(findCommentsPanel(root)).toBeNull();
    expect(isCommentsPanelOpen(root)).toBe(false);
    expect(findCommentsButton(root)).not.toBeNull();
  });
});

describe("findReplyButtons", () => {
  it("matches English reply labels and ignores Hide/Like", () => {
    const labels = findReplyButtons(load("reply-buttons-en.html")).map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual([
      "View replies",
      "View 3 replies",
      "View more replies",
    ]);
  });

  it("matches Portuguese reply labels", () => {
    const labels = findReplyButtons(load("reply-buttons-pt.html")).map((b) =>
      b.textContent.trim(),
    );
    expect(labels).toEqual([
      "Ver respostas",
      "Ver 3 respostas",
      "Ver mais respostas",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/findComments.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
const REPLY_RE =
  /^\s*(view(\s+all)?(\s+\d+)?\s+repl(?:y|ies)|ver(\s+todas)?(\s+as)?(\s+\d+)?\s+respostas?|view more replies|ver mais respostas)\s*$/i;

const COMMENT_BTN_RE = /comment|coment[aá]rio|comentar/i;

export function findCommentsPanel(root) {
  return (
    root.querySelector("[data-comments-panel]") ||
    root.querySelector('[role="dialog"]') ||
    (root.matches?.("[data-comments-panel]") ? root : null)
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/findComments.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/findComments.test.js tests/fixtures src/lib/findComments.js
git commit -m "feat: find comments panel and reply expanders"
```

---

### Task 8: extractionMachine

**Files:**

- Create: `tests/extractionMachine.test.js`
- Create: `src/lib/extractionMachine.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import {
  createMachine,
  ingest,
  pause,
  start,
} from "../src/lib/extractionMachine.js";

describe("extractionMachine", () => {
  it("starts in idle and start moves to running", () => {
    const idle = createMachine();
    expect(idle.status).toBe("idle");
    expect(start(idle).status).toBe("running");
  });

  it("pause sets paused", () => {
    expect(pause(start(createMachine())).status).toBe("paused");
  });

  it("completes after 3 empty cycles with no reply buttons", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    expect(m.status).toBe("running");
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    expect(m.status).toBe("complete");
  });

  it("stays running when empty but reply buttons remain", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: true });
    expect(m.status).toBe("running");
    expect(m.emptyStreak).toBe(0);
  });

  it("resets empty streak when new ids arrive", () => {
    let m = start(createMachine());
    m = ingest(m, { newCount: 0, hasMoreReplyButtons: false });
    m = ingest(m, { newCount: 2, hasMoreReplyButtons: false });
    expect(m.emptyStreak).toBe(0);
    expect(m.status).toBe("running");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/extractionMachine.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
export function createMachine() {
  return { status: "idle", emptyStreak: 0 };
}

export function start(machine) {
  return { status: "running", emptyStreak: 0 };
}

export function pause(machine) {
  return { ...machine, status: "paused" };
}

export function ingest(machine, { newCount, hasMoreReplyButtons }) {
  if (machine.status !== "running") return machine;
  if (hasMoreReplyButtons) {
    return { status: "running", emptyStreak: 0 };
  }
  const emptyStreak = newCount === 0 ? machine.emptyStreak + 1 : 0;
  if (emptyStreak >= 3) return { status: "complete", emptyStreak };
  return { status: "running", emptyStreak };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/extractionMachine.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/extractionMachine.test.js src/lib/extractionMachine.js
git commit -m "feat: extraction state machine with reply-aware exhaustion"
```

---

### Task 9: scrollPanel

**Files:**

- Create: `tests/scrollPanel.test.js`
- Create: `src/lib/scrollPanel.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { scrollPanel } from "../src/lib/scrollPanel.js";

describe("scrollPanel", () => {
  it("moves scrollTop on the container, not window", () => {
    const windowTop = window.scrollY;
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 500, configurable: true },
      scrollTop: { value: 0, writable: true },
    });
    const moved = scrollPanel(container);
    expect(moved).toBe(true);
    expect(container.scrollTop).toBe(100);
    expect(window.scrollY).toBe(windowTop);
  });

  it("returns false when already at the bottom", () => {
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientHeight: { value: 100 },
      scrollHeight: { value: 100 },
      scrollTop: { value: 0, writable: true },
    });
    expect(scrollPanel(container)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/scrollPanel.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
export function scrollPanel(container) {
  const before = container.scrollTop;
  const next = Math.min(
    container.scrollTop + container.clientHeight,
    container.scrollHeight - container.clientHeight,
  );
  container.scrollTop = Math.max(0, next);
  return container.scrollTop !== before;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/scrollPanel.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/scrollPanel.test.js src/lib/scrollPanel.js
git commit -m "feat: scroll the comments panel container"
```

---

### Task 10: workerLogic

**Files:**

- Create: `tests/workerLogic.test.js`
- Create: `src/lib/workerLogic.js`

This is the persistence brain. Chrome storage is not used here.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import {
  createStore,
  handleBatch,
  handleDisconnect,
  handleDownload,
  handleFail,
  handleGetState,
  handlePause,
  handleStart,
  handleDone,
} from "../src/lib/workerLogic.js";

const URL = "https://www.instagram.com/reels/DcxhtUfOJj4/";
const NOW = 1_000;

function row(id, type = "comment") {
  return {
    id,
    profileName: id,
    commentText: id,
    type,
    replyTo: type === "reply" ? "ana" : "",
    postUrl: URL,
  };
}

describe("workerLogic", () => {
  it("GET_STATE is unsupported off a reels URL", () => {
    const state = handleGetState(
      createStore(),
      "https://www.instagram.com/",
      NOW,
    );
    expect(state.supported).toBe(false);
  });

  it("START creates a running record and asks to RUN", () => {
    const { store, effect } = handleStart(createStore(), URL, NOW);
    expect(effect).toEqual({ type: "RUN", postUrl: URL });
    expect(store.records[URL].status).toBe("running");
    expect(store.records[URL].shortcode).toBe("DcxhtUfOJj4");
  });

  it("START on a bad URL does not RUN", () => {
    const { effect, error } = handleStart(
      createStore(),
      "https://www.instagram.com/p/abc/",
      NOW,
    );
    expect(effect).toBeNull();
    expect(error).toBe("UNSUPPORTED_URL");
  });

  it("BATCH merges new ids only and ACKs counts", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    const first = handleBatch(
      store,
      { postUrl: URL, rows: [row("a"), row("b", "reply")] },
      NOW + 1,
    );
    expect(first.ack.addedCount).toBe(2);
    expect(first.ack.totalComments).toBe(1);
    expect(first.ack.totalReplies).toBe(1);
    const second = handleBatch(
      first.store,
      { postUrl: URL, rows: [row("a"), row("c")] },
      NOW + 2,
    );
    expect(second.ack.addedCount).toBe(1);
    expect(second.store.records[URL].rows.map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores BATCH for a different postUrl", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    const other = handleBatch(
      store,
      { postUrl: "https://www.instagram.com/reels/OTHER/", rows: [row("z")] },
      NOW,
    );
    expect(other.store.records[URL].rows).toEqual([]);
  });

  it("PAUSE and DONE stopped set paused; DONE exhausted sets complete", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handlePause(store, NOW).store;
    expect(store.records[URL].status).toBe("paused");
    store = handleStart(store, URL, NOW).store;
    store = handleDone(store, { postUrl: URL, reason: "exhausted" }, NOW).store;
    expect(store.records[URL].status).toBe("complete");
  });

  it("FAIL sets error message", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handleFail(
      store,
      {
        postUrl: URL,
        code: "PANEL_NOT_FOUND",
        message: "Abra os comentários deste Reel e tente de novo.",
      },
      NOW,
    ).store;
    expect(store.records[URL].status).toBe("error");
    expect(store.records[URL].errorMessage).toContain("Abra os comentários");
  });

  it("DOWNLOAD with 0 rows is a no-op; with rows returns csv and filename", () => {
    let store = createStore();
    expect(
      handleDownload(store, URL, NOW, new Date(2026, 8, 18)).effect,
    ).toBeNull();
    store = handleStart(store, URL, NOW).store;
    store = handleBatch(store, { postUrl: URL, rows: [row("a")] }, NOW).store;
    const { effect } = handleDownload(store, URL, NOW, new Date(2026, 8, 18));
    expect(effect.type).toBe("DOWNLOAD");
    expect(effect.filename).toBe(
      "instagram-comments-DcxhtUfOJj4-2026-09-18.csv",
    );
    expect(effect.csv).toContain("profile_name");
    expect(effect.csv.startsWith("\uFEFF")).toBe(true);
  });

  it("disconnect while running with rows goes paused; with none goes idle", () => {
    let { store } = handleStart(createStore(), URL, NOW);
    store = handleDisconnect(store, NOW).store;
    expect(store.records[URL].status).toBe("idle");
    store = handleStart(store, URL, NOW).store;
    store = handleBatch(store, { postUrl: URL, rows: [row("a")] }, NOW).store;
    store = handleDisconnect(store, NOW).store;
    expect(store.records[URL].status).toBe("paused");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/workerLogic.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
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

export function handleDisconnect(store, now) {
  const postUrl = store.runningPostUrl;
  if (!postUrl || !store.records[postUrl]) return { store };
  const hasRows = store.records[postUrl].rows.length > 0;
  store = patch(store, postUrl, now, { status: hasRows ? "paused" : "idle" });
  return { store: { ...store, runningPostUrl: null } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/workerLogic.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/workerLogic.test.js src/lib/workerLogic.js
git commit -m "feat: reduce worker session, merge batches, and CSV download"
```

---

### Task 11: popupView

**Files:**

- Create: `tests/popupView.test.js`
- Create: `src/lib/popupView.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { popupView } from "../src/lib/popupView.js";
import { ERRORS } from "../src/lib/errors.js";

const base = {
  postUrl: "https://www.instagram.com/reels/DcxhtUfOJj4/",
  shortcode: "DcxhtUfOJj4",
  rows: [],
  status: "idle",
  errorMessage: "",
  updatedAt: 0,
};

describe("popupView", () => {
  it("disables extract on unsupported URL", () => {
    const v = popupView({ supported: false, record: null });
    expect(v.extractEnabled).toBe(false);
    expect(v.pauseEnabled).toBe(false);
    expect(v.downloadEnabled).toBe(false);
    expect(v.statusText).toBe(ERRORS.UNSUPPORTED_URL);
    expect(v.counterText).toBe("0 comentários · 0 respostas");
  });

  it("idle with 0 rows: extract on, download off", () => {
    const v = popupView({ supported: true, record: base });
    expect(v.extractEnabled).toBe(true);
    expect(v.pauseEnabled).toBe(false);
    expect(v.downloadEnabled).toBe(false);
    expect(v.counterText).toBe("0 comentários · 0 respostas");
  });

  it("running: pause on, extract off, live counter", () => {
    const v = popupView({
      supported: true,
      record: {
        ...base,
        status: "running",
        rows: [{ type: "comment" }, { type: "comment" }, { type: "reply" }],
      },
    });
    expect(v.extractEnabled).toBe(false);
    expect(v.pauseEnabled).toBe(true);
    expect(v.downloadEnabled).toBe(true);
    expect(v.statusText).toBe("Extraindo…");
    expect(v.counterText).toBe("2 comentários · 1 respostas");
  });

  it("paused / complete / error flags", () => {
    expect(
      popupView({
        supported: true,
        record: { ...base, status: "paused", rows: [{ type: "comment" }] },
      }),
    ).toMatchObject({
      extractEnabled: true,
      pauseEnabled: false,
      downloadEnabled: true,
      statusText: "Pausado",
    });
    expect(
      popupView({
        supported: true,
        record: { ...base, status: "complete", rows: [{ type: "comment" }] },
      }),
    ).toMatchObject({
      extractEnabled: true,
      downloadEnabled: true,
      statusText: "Concluído",
    });
    expect(
      popupView({
        supported: true,
        record: {
          ...base,
          status: "error",
          errorMessage: ERRORS.PANEL_NOT_FOUND,
        },
      }),
    ).toMatchObject({
      extractEnabled: true,
      statusText: ERRORS.PANEL_NOT_FOUND,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/popupView.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/popupView.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/popupView.test.js src/lib/popupView.js
git commit -m "feat: derive popup labels and button state"
```

---

### Task 12: runLoop

**Files:**

- Create: `tests/runLoop.test.js`
- Create: `src/lib/runLoop.js`

The loop takes injected deps. No Chrome, no live Instagram.

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from "vitest";
import { ERRORS } from "../src/lib/errors.js";
import { runLoop } from "../src/lib/runLoop.js";

const POST = "https://www.instagram.com/reels/DcxhtUfOJj4/";

function comment(id) {
  return {
    id,
    profileName: id,
    commentText: id,
    type: "comment",
    replyTo: "",
    postUrl: POST,
  };
}

function harness(overrides = {}) {
  const clicks = [];
  const batches = [];
  const scrolls = [];
  let stopped = false;
  const deps = {
    postUrl: POST,
    getPanel: () => document.createElement("div"),
    openPanel: () => {},
    parseCommentList: () => [comment("a")],
    findReplyButtons: () => [],
    click: (b) => clicks.push(b),
    scrollPanel: (el) => {
      scrolls.push(el);
      return false;
    },
    delay: async () => {},
    settle: async () => {},
    sendBatch: async (batch) => {
      batches.push(batch);
      return { addedCount: batch.rows.length };
    },
    isStopped: () => stopped,
    now: () => 0,
    noCommentsTimeoutMs: 50,
    randomDelayMs: () => 0,
    ...overrides,
  };
  return {
    clicks,
    batches,
    scrolls,
    stop: () => {
      stopped = true;
    },
    deps,
    setStopped(fn) {
      deps.isStopped = fn;
    },
  };
}

describe("runLoop", () => {
  it("fails when the panel cannot be found", async () => {
    const h = harness({ getPanel: () => null, openPanel: () => {} });
    const result = await runLoop(h.deps);
    expect(result).toEqual({
      fail: { code: "PANEL_NOT_FOUND", message: ERRORS.PANEL_NOT_FOUND },
    });
  });

  it("fails NO_COMMENTS_FOUND when the panel stays empty past the timeout", async () => {
    let t = 0;
    const h = harness({
      parseCommentList: () => [],
      now: () => t,
      delay: async () => {
        t += 100;
      },
      noCommentsTimeoutMs: 50,
    });
    const result = await runLoop(h.deps);
    expect(result.fail.code).toBe("NO_COMMENTS_FOUND");
    expect(result.fail.message).toBe(ERRORS.NO_COMMENTS_FOUND);
  });

  it("clicks remaining reply buttons and does not exhaust while they exist", async () => {
    const btn = { id: "view-replies", textContent: "View replies" };
    let finds = 0;
    let added = 0;
    const h = harness({
      findReplyButtons: () => {
        finds += 1;
        return finds < 3 ? [btn] : [];
      },
      sendBatch: async (batch) => {
        h.batches.push(batch);
        added += 1;
        return { addedCount: added === 1 ? 1 : 0 };
      },
    });
    const result = await runLoop(h.deps);
    expect(h.clicks).toContain(btn);
    expect(result.done.reason).toBe("exhausted");
  });

  it("exhausts after three cycles with zero new ids and no reply buttons", async () => {
    const h = harness({
      sendBatch: async (batch) => {
        h.batches.push(batch);
        return { addedCount: 0 };
      },
    });
    const result = await runLoop(h.deps);
    expect(result.done.reason).toBe("exhausted");
    expect(h.batches).toHaveLength(3);
    expect(h.scrolls.length).toBeGreaterThanOrEqual(2);
  });

  it("stops with reason stopped when isStopped becomes true", async () => {
    let n = 0;
    const h = harness({
      sendBatch: async (batch) => {
        h.batches.push(batch);
        n += 1;
        return { addedCount: 1 };
      },
    });
    h.setStopped(() => n >= 1);
    const result = await runLoop(h.deps);
    expect(result.done.reason).toBe("stopped");
  });
});
```

Note: `harness` copies `overrides` after defaults, so a custom `sendBatch` in overrides **replaces** the collecting default. Tests that need `h.batches` must push into `h.batches` inside their override, as shown.

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk npm test -- tests/runLoop.test.js`

Expected: FAIL missing module.

- [ ] **Step 3: Write minimal implementation**

```js
import { ERRORS } from "./errors.js";
import { createMachine, ingest, start } from "./extractionMachine.js";
import { findReplyButtons as defaultFindReplyButtons } from "./findComments.js";
import { parseCommentList as defaultParse } from "./parseComment.js";
import { scrollPanel as defaultScroll } from "./scrollPanel.js";

export async function runLoop(deps) {
  const {
    postUrl,
    getPanel,
    openPanel,
    parseCommentList = defaultParse,
    findReplyButtons = defaultFindReplyButtons,
    click,
    scrollPanel = defaultScroll,
    delay,
    settle,
    sendBatch,
    isStopped,
    now = () => Date.now(),
    noCommentsTimeoutMs = 8000,
    randomDelayMs = () => 400 + Math.floor(Math.random() * 501),
  } = deps;

  let panel = getPanel();
  if (!panel && openPanel) {
    openPanel();
    await settle();
    panel = getPanel();
  }
  if (!panel) {
    return {
      fail: { code: "PANEL_NOT_FOUND", message: ERRORS.PANEL_NOT_FOUND },
    };
  }

  let machine = start(createMachine());
  const clicked = new Set();
  let sawComment = false;
  const startedAt = now();

  while (machine.status === "running") {
    if (isStopped()) {
      return { done: { reason: "stopped", postUrl } };
    }
    const rows = parseCommentList(panel, postUrl);
    if (rows.length > 0) sawComment = true;
    if (!sawComment && now() - startedAt >= noCommentsTimeoutMs) {
      return {
        fail: { code: "NO_COMMENTS_FOUND", message: ERRORS.NO_COMMENTS_FOUND },
      };
    }
    const buttons = findReplyButtons(panel).filter((b) => {
      const key = b.textContent.trim();
      return key && !clicked.has(key);
    });
    const ack = await sendBatch({
      postUrl,
      rows,
      hasMoreReplyButtons: buttons.length > 0,
    });
    machine = ingest(machine, {
      newCount: ack.addedCount,
      hasMoreReplyButtons: buttons.length > 0,
    });
    for (const button of buttons) {
      click(button);
      clicked.add(button.textContent.trim());
      await settle();
    }
    if (machine.status !== "running") break;
    scrollPanel(panel);
    await delay(randomDelayMs());
  }

  if (machine.status === "complete") {
    return { done: { reason: "exhausted", postUrl } };
  }
  return { done: { reason: "stopped", postUrl } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk npm test -- tests/runLoop.test.js`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/runLoop.test.js src/lib/runLoop.js
git commit -m "feat: extraction loop with reply expansion and exhaustion"
```

---

### Task 13: Live Instagram fallback selectors

Required. Instagram does not ship `data-comment`. Do not poke production to invent selectors. No hashed class names.

**Files:**

- Create: `tests/fixtures/ig-reels-panel.html`
- Modify: `tests/parseComment.test.js`
- Modify: `tests/findComments.test.js`
- Modify: `src/lib/parseComment.js`
- Modify: `src/lib/findComments.js`

- [ ] **Step 1: Write fixture and failing tests**

`tests/fixtures/ig-reels-panel.html`:

```html
<div role="dialog" aria-label="Comments">
  <div>
    <a href="/creator/">creator</a>
    <span>caption do reel</span>
  </div>
  <div>
    <a href="/ana/">ana</a>
    <span>amei</span>
    <button type="button">View 1 reply</button>
    <div>
      <a href="/bruno/">bruno</a>
      <span>eu também</span>
    </div>
  </div>
</div>
```

Append to `tests/parseComment.test.js`:

```js
describe("parseCommentList heuristic (no data-comment)", () => {
  it("skips the first caption block and parses nested replies", () => {
    const panel = load("ig-reels-panel.html");
    expect(parseCommentList(panel, POST)).toEqual([
      expect.objectContaining({
        profileName: "ana",
        commentText: "amei",
        type: "comment",
        replyTo: "",
      }),
      expect.objectContaining({
        profileName: "bruno",
        commentText: "eu também",
        type: "reply",
        replyTo: "ana",
      }),
    ]);
  });
});
```

Append to `tests/findComments.test.js`:

```js
it("treats a role=dialog root as the panel", () => {
  const panel = load("ig-reels-panel.html");
  expect(findCommentsPanel(panel)).toBe(panel);
  expect(findReplyButtons(panel).map((b) => b.textContent.trim())).toEqual([
    "View 1 reply",
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk npm test -- tests/parseComment.test.js tests/findComments.test.js`

Expected: FAIL — 0 rows from `parseCommentList` (no `[data-comment]`), and `findCommentsPanel(dialog)` is `null` because `querySelector('[role=dialog]')` does not match the root itself.

- [ ] **Step 3: Minimal implementation**

In `src/lib/findComments.js`, change `findCommentsPanel` to:

```js
export function findCommentsPanel(root) {
  if (!root) return null;
  if (root.matches?.("[data-comments-panel], [role='dialog']")) return root;
  return (
    root.querySelector("[data-comments-panel]") ||
    root.querySelector('[role="dialog"]') ||
    null
  );
}
```

In `src/lib/parseComment.js`, replace `parseCommentList` with a hooked walk plus heuristic fallback. Add these helpers in the same file:

```js
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
```

Keep existing `parseComment`, `walk`, and `directCommentChildren`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk npm test -- tests/parseComment.test.js tests/findComments.test.js`

Expected: PASS, including previous data-comment fixtures.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/ig-reels-panel.html tests/parseComment.test.js tests/findComments.test.js src/lib/parseComment.js src/lib/findComments.js
git commit -m "feat: parse Instagram reels comments without data-comment hooks"
```

---

### Task 14: Manifest, popup UI, content bootstrap

**Files:**

- Create: `manifest.json`
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.css`
- Create: `src/popup/popup.js`
- Create: `src/background/worker.js`
- Create: `src/content/bootstrap.js`
- Create: `src/content/extractor.js`

Config / glue. Chrome APIs live only here. Keep adapters thin.

- [ ] **Step 1: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Instagram Reels Comment Extractor",
  "version": "1.0.0",
  "description": "Extrai comentários e respostas de um Reel e baixa CSV.",
  "action": {
    "default_popup": "src/popup/popup.html",
    "default_title": "Extrair comentários"
  },
  "background": {
    "service_worker": "src/background/worker.js",
    "type": "module"
  },
  "permissions": ["storage", "downloads", "activeTab"],
  "host_permissions": [
    "https://www.instagram.com/*",
    "https://instagram.com/*"
  ],
  "content_scripts": [
    {
      "matches": [
        "https://www.instagram.com/reels/*",
        "https://instagram.com/reels/*"
      ],
      "js": ["src/content/bootstrap.js"],
      "run_at": "document_idle"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/content/extractor.js", "src/lib/*.js"],
      "matches": ["https://www.instagram.com/*", "https://instagram.com/*"]
    }
  ]
}
```

- [ ] **Step 2: Write popup HTML/CSS**

`src/popup/popup.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Comentários do Reel</title>
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <h1>Comentários do Reel</h1>
    <p id="status"></p>
    <p id="counter">0 comentários · 0 respostas</p>
    <div class="actions">
      <button type="button" id="extract">Extrair</button>
      <button type="button" id="pause" disabled>Pausar</button>
      <button type="button" id="download" disabled>Baixar CSV</button>
    </div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

`src/popup/popup.css`:

```css
body {
  font:
    14px/1.4 system-ui,
    sans-serif;
  width: 280px;
  margin: 0;
  padding: 12px;
  color: #111;
}
h1 {
  font-size: 15px;
  margin: 0 0 8px;
}
#status {
  min-height: 1.4em;
  color: #444;
  margin: 0 0 4px;
}
#counter {
  margin: 0 0 12px;
  font-variant-numeric: tabular-nums;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
button {
  padding: 8px;
  border: 1px solid #ccc;
  background: #fff;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
```

- [ ] **Step 3: Write popup.js**

```js
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
```

- [ ] **Step 4: Write worker.js**

Persist the whole `createStore()` object under `chrome.storage.local` key `extractorStore`.

```js
import {
  createStore,
  handleBatch,
  handleDisconnect,
  handleDownload,
  handleDone,
  handleFail,
  handleGetState,
  handlePause,
  handleStart,
} from "../lib/workerLogic.js";

const KEY = "extractorStore";

async function loadStore() {
  const data = await chrome.storage.local.get(KEY);
  return data[KEY] ?? createStore();
}

async function saveStore(store) {
  await chrome.storage.local.set({ [KEY]: store });
}

function broadcast(state) {
  chrome.runtime.sendMessage({ type: "STATE", state }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    let store = await loadStore();
    const now = Date.now();
    if (msg.type === "GET_STATE") {
      const state = handleGetState(store, msg.tabUrl, now);
      sendResponse(state);
      return;
    }
    if (msg.type === "START") {
      const result = handleStart(store, msg.tabUrl, now);
      await saveStore(result.store);
      if (result.effect?.type === "RUN") {
        chrome.tabs.sendMessage(msg.tabId, {
          type: "RUN",
          postUrl: result.effect.postUrl,
        });
      }
      broadcast(handleGetState(result.store, msg.tabUrl, now));
      sendResponse(result);
      return;
    }
    if (msg.type === "PAUSE") {
      const result = handlePause(store, now);
      await saveStore(result.store);
      if (msg.tabId) {
        chrome.tabs.sendMessage(msg.tabId, { type: "STOP" }).catch(() => {});
      }
      sendResponse(result);
      return;
    }
    if (msg.type === "DOWNLOAD") {
      const result = handleDownload(store, msg.tabUrl, now, new Date());
      if (result.effect?.type === "DOWNLOAD") {
        const blobUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(result.effect.csv)}`;
        await chrome.downloads.download({
          url: blobUrl,
          filename: result.effect.filename,
          saveAs: true,
        });
      }
      sendResponse(result);
      return;
    }
    if (msg.type === "BATCH") {
      const result = handleBatch(store, msg, now);
      await saveStore(result.store);
      sendResponse(result.ack);
      return;
    }
    if (msg.type === "DONE") {
      const result = handleDone(store, msg, now);
      await saveStore(result.store);
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "FAIL") {
      const result = handleFail(store, msg, now);
      await saveStore(result.store);
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "extractor") return;
  port.onDisconnect.addListener(async () => {
    const store = await loadStore();
    const result = handleDisconnect(store, Date.now());
    await saveStore(result.store);
  });
});
```

- [ ] **Step 5: Write content bootstrap + extractor**

`src/content/bootstrap.js` (classic, no `import`):

```js
(function () {
  const src = chrome.runtime.getURL("src/content/extractor.js");
  import(src);
})();
```

`src/content/extractor.js`:

```js
import {
  findCommentsButton,
  findCommentsPanel,
  findReplyButtons,
} from "../lib/findComments.js";
import { parseCommentList } from "../lib/parseComment.js";
import { runLoop } from "../lib/runLoop.js";
import { scrollPanel } from "../lib/scrollPanel.js";

let stopFlag = false;
let port = null;

function connect() {
  port = chrome.runtime.connect({ name: "extractor" });
}

function settle(ms = 300) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, ms);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(done, 1200);
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "STOP") {
    stopFlag = true;
    sendResponse({ ok: true });
    return;
  }
  if (msg.type !== "RUN") return;
  stopFlag = false;
  connect();
  (async () => {
    const result = await runLoop({
      postUrl: msg.postUrl,
      getPanel: () => findCommentsPanel(document),
      openPanel: () => {
        const btn = findCommentsButton(document);
        if (btn) btn.click();
      },
      parseCommentList,
      findReplyButtons,
      click: (el) => el.click(),
      scrollPanel: (panel) => {
        const scroller = panel.querySelector("[data-comments-list]") || panel;
        scrollPanel(scroller);
      },
      delay: (ms) => new Promise((r) => setTimeout(r, ms)),
      settle,
      sendBatch: async (batch) =>
        chrome.runtime.sendMessage({ type: "BATCH", ...batch }),
      isStopped: () => stopFlag,
    });
    if (result.fail) {
      await chrome.runtime.sendMessage({
        type: "FAIL",
        postUrl: msg.postUrl,
        code: result.fail.code,
        message: result.fail.message,
      });
    } else {
      await chrome.runtime.sendMessage({
        type: "DONE",
        postUrl: msg.postUrl,
        reason: result.done.reason,
      });
    }
  })();
  sendResponse({ ok: true });
  return true;
});
```

- [ ] **Step 6: Run the full unit suite**

Run: `rtk npm test`

Expected: all existing tests PASS (adapters are untested here; logic is already covered).

- [ ] **Step 7: Commit**

```bash
git add manifest.json src/popup src/background src/content
git commit -m "feat: wire popup, worker, and content script adapters"
```

---

### Task 15: Load in Chrome (manual check, not a unit test)

- [ ] **Step 1: Load unpacked**

Chrome → `chrome://extensions` → Developer mode → Load unpacked → this repo root (`manifest.json` at root).

- [ ] **Step 2: Open a Reel**

Open `https://www.instagram.com/reels/DcxhtUfOJj4/` while logged in. Open comments. Click the extension → Extrair. Confirm the counter moves, replies expand, and Baixar CSV contains `type=reply` rows with `reply_to` set.

Requires Task 13 (heuristic parser) to already be merged so live markup without `data-comment` is parsed.

---

## Self-review (plan vs spec)

| Spec requirement                                            | Task                 |
| ----------------------------------------------------------- | -------------------- |
| `/reels/{shortcode}/` only, canonical www URL               | Task 3               |
| CSV columns + BOM + escape + filename                       | Task 4               |
| Dedupe by id, ig id preferred                               | Tasks 2, 5           |
| Parse comment + reply + nested `reply_to`                   | Tasks 6, 13          |
| Skip caption                                                | Tasks 6, 13          |
| Find panel / PT+EN reply buttons                            | Task 7               |
| Machine: 3 empty cycles, do not finish while replies remain | Task 8               |
| Scroll panel not window                                     | Task 9               |
| Incremental merge, ignore stale postUrl                     | Task 10              |
| DOWNLOAD no-op on 0 rows                                    | Task 10              |
| Disconnect → paused/idle                                    | Task 10              |
| Popup PT copy, counter split, button flags                  | Task 11              |
| Loop: open panel, batch, expand, 8s NO_COMMENTS             | Task 12              |
| Heuristic parse without data-comment                        | Task 13              |
| MV3, permissions, ESM content bootstrap                     | Task 14              |
| Replies mandatory on live IG                                | Tasks 13, 15         |
| Errors catalog                                              | Task 4 + worker FAIL |

No TBD left. Types: `CommentRow` fields `id, profileName, commentText, type, replyTo, postUrl` are consistent across parse, csv, worker, popup. Message names `GET_STATE START PAUSE DOWNLOAD RUN STOP BATCH DONE FAIL` match the spec.
