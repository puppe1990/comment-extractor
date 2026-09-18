# Instagram Reels Comment Extractor — Design

Date: 2026-09-18
Status: approved for spec review
Product: Chrome extension (Manifest V3)
Scope: extract comments and replies from an open Instagram Reel, save incrementally, download CSV

## Goal

On `https://www.instagram.com/reels/{shortcode}/`, the user opens the extension popup and clicks Extract. The content script opens the comments panel if needed, scrolls that panel to the end, expands every replies control, and incrementally stores each comment and reply. The user can download a CSV at any time with profile name, comment text, type, parent username, and canonical post URL.

The user must already be logged into Instagram. There is no backend and no official API.

## Non-goals (v1)

- Posts (`/p/...`), single-reel path (`/reel/...`), feed, stories, DMs
- Likes, timestamps, avatars, profile URLs
- Parallel extraction of multiple Reels
- Automatic Instagram login
- Network/GraphQL interception
- Official Graph API
- Preview table of comments in the popup
- Settings, themes, i18n toggle (UI is Portuguese only)

## Surfaces

| URL | Supported |
|-----|-----------|
| `https://www.instagram.com/reels/{shortcode}/` | Yes |
| Same URL with query string or trailing extras | Yes — canonicalize before storing `post_url` |
| `instagram.com/reel/{shortcode}/`, `/p/...`, feed, other hosts | No — popup explains the user must open a Reel at `/reels/...` |

Canonical post URL is always `https://www.instagram.com/reels/{shortcode}/` (www, https, trailing slash, no query).  
Example input `https://instagram.com/reels/DcxhtUfOJj4/?utm=share` → `https://www.instagram.com/reels/DcxhtUfOJj4/`.

Shortcode: path segment after `/reels/`, stripped of trailing slash and query. Only `[A-Za-z0-9_-]+`. If the path is not `/reels/{shortcode}`, extraction refuses to start.

## Architecture

Four pieces. Chrome wiring is thin. Parsing, CSV, dedupe, and the extraction state machine are pure modules with no `chrome.*` or live Instagram DOM.

```
popup  --messages-->  service worker  --messages-->  content script
                         |                              |
                         v                              v
                 chrome.storage.local            Instagram Reel DOM
                         |
                         v
                    CSV download
```

| Unit | Does | Does not |
|------|------|----------|
| `popup` | Start, pause, download, show counts and status | Parse DOM, write CSV bytes except triggering download |
| `service worker` | Own extraction session, merge batches into storage, build CSV on demand | Touch Instagram DOM |
| `content script` | Find panel, scroll, click reply controls, collect raw nodes, send batches | Persist storage, format CSV |
| `parseComment` / `parseCommentList` | Map a comment/reply node (or fixture HTML) to a row | Scroll or click |
| `dedupe` | Keep first row per `id` | Know about Chrome |
| `toCsv` | Serialize rows with header, escaping, UTF-8 BOM | Know about Instagram |
| `canonicalPostUrl` | Normalize location href to canonical Reel URL | |
| `extractionMachine` | start / pause / ingest batch / decide continue vs done | Touch DOM |
| `findCommentsPanel` / `findReplyButtons` / `isCommentsPanelOpen` | Selector isolation over a root node | Network |

Selectors live only in the find/parse modules. If Instagram changes markup, those modules and their fixtures change; the machine, CSV, storage, and popup stay.

## Data

### Stored row

```ts
type CommentType = "comment" | "reply";

type CommentRow = {
  id: string;
  profileName: string; // visible username, no leading @
  commentText: string;
  type: CommentType;
  replyTo: string; // parent username; empty string when type === "comment"
  postUrl: string; // canonical Reel URL
};
```

`id` is for dedupe only. It does not appear in the CSV.

- If the comment node exposes a stable Instagram comment id (attribute, href containing a comment id, or similar), use `ig:{thatId}`.
- Otherwise `hash:{fnv1a64(profileName + "\n" + type + "\n" + replyTo + "\n" + commentText)}`.
- `hashId` is synchronous (FNV-1a 64-bit hex). No `crypto.subtle`.

Same logical comment seen again during scroll is dropped.

### Storage shape (`chrome.storage.local`)

Keyed by canonical `postUrl`:

```ts
type ExtractionRecord = {
  postUrl: string;
  shortcode: string;
  rows: CommentRow[]; // insertion order, already unique by id
  status: "idle" | "running" | "paused" | "complete" | "error";
  errorMessage: string; // empty unless status === "error"
  updatedAt: number; // epoch ms
};
```

Only the record for the active tab’s canonical URL is the “current” extraction. Switching Reels does not delete the previous record. Download exports the record matching the current tab’s canonical URL.

### CSV

Column order is fixed:

```
profile_name,comment_text,type,reply_to,post_url
```

Rules:

- UTF-8 with BOM (`\uFEFF`) so Excel keeps Portuguese characters.
- RFC 4180 quoting: fields with comma, quote, or newline are wrapped in double quotes; quotes doubled.
- `type` is exactly `comment` or `reply`.
- `reply_to` is empty for `comment`.
- `reply_to` for `reply` is the immediate parent’s username (reply-to-reply uses that reply’s author, not the top-level comment author).
- Filename: `instagram-comments-{shortcode}-{YYYY-MM-DD}.csv` using local date of the download click.
- Download is allowed whenever `rows.length >= 1`, including while `running` or `paused`.

Example:

```
profile_name,comment_text,type,reply_to,post_url
ana,amei,comment,,https://www.instagram.com/reels/DcxhtUfOJj4/
bruno,eu também,reply,ana,https://www.instagram.com/reels/DcxhtUfOJj4/
```

## Messages

Popup ↔ worker ↔ content script. No other channels.

| Message | From → to | Payload | Result |
|---------|-----------|---------|--------|
| `GET_STATE` | popup → worker | `{ tabId }` | Current `ExtractionRecord` plus parsed location, or `unsupported` |
| `START` | popup → worker | `{ tabId }` | Worker validates URL, sets `running`, tells content script `RUN` |
| `PAUSE` | popup → worker | `{ tabId }` | Sets `paused`, tells content script `STOP` |
| `DOWNLOAD` | popup → worker | `{ tabId }` | Worker builds CSV from stored rows and uses `chrome.downloads` |
| `RUN` | worker → content | `{ postUrl }` | Content starts or resumes the loop |
| `STOP` | worker → content | `{}` | Content leaves the loop after the current cycle |
| `BATCH` | content → worker | `{ postUrl, rows, hasMoreReplyButtons }` | Worker dedupes/merges, replies `ACK` with `{ totalComments, totalReplies }` derived from stored rows |
| `DONE` | content → worker | `{ postUrl, reason: "exhausted" \| "stopped" }` | Worker sets `complete` or `paused` |
| `FAIL` | content → worker | `{ postUrl, code, message }` | Worker sets `error` |

If `BATCH.postUrl` does not match the running record, the worker ignores the batch (stale tab / navigated away).

## Extraction loop

Content script owns the DOM. Worker owns persistence. The state machine decides whether to continue.

### Preconditions

1. Active tab URL canonicalizes to a Reel. Otherwise popup does not enable Extract.
2. User is logged in (assumed; we do not detect login as a special case beyond “no comments found”).
3. Comments panel is open, or the content script can click the Reel’s comments control and then find the panel.

If the panel is not found within 5 seconds of START: `FAIL` with code `PANEL_NOT_FOUND` and message `Abra os comentários deste Reel e tente de novo.`

### One cycle

1. Query comment and reply nodes inside the panel (not the caption, not like-counts, not the composer).
2. `parseCommentList` → `CommentRow[]`. Invalid nodes (empty username or empty text) are skipped, not failed.
3. Send `BATCH` with parsed rows and whether any unclicked reply control remains.
4. Click every visible replies control not yet clicked in this session (`View replies`, `Ver respostas`, `View N replies`, `Ver N respostas`, `View more replies`, `Ver mais respostas`, and equivalent remaining-count labels). After each click, wait for DOM settle (mutation quiet for 300 ms or 1.2 s timeout).
5. Scroll the **comments panel container** (not `window`) by its client height. Delay 400–900 ms (random per cycle).
6. Ask the machine: if 3 consecutive cycles added 0 new ids **and** no reply control remains, emit `DONE` / `exhausted`. If `STOP` was received, emit `DONE` / `stopped`.

Replies are mandatory. The loop must not finish while a replies control is still visible and unclicked.

Nested replies: after expanding, newly revealed controls are clicked in later cycles. `replyTo` is always the immediate parent username.

### Pause and resume

Pause sends `STOP`. Already stored rows remain. Extract again on the same Reel resumes: content script starts a new loop; worker dedupes against existing ids, so previously saved rows are not duplicated.

### Navigation and tab close

- Content script keeps a long-lived `chrome.runtime.connect` port named `extractor` while `running`. Port disconnect while status is `running` → worker sets `paused` if that record has rows, otherwise `idle`. Data for that `postUrl` stays in storage. No `tabs.onRemoved` (no `tabs` permission).
- Opening a different Reel: popup/worker bind to that Reel’s record (create empty if missing). Download exports the current Reel only.

### End of comments

Instagram does not expose a reliable total. Exhaustion is: three consecutive cycles with zero new ids and zero remaining reply buttons. That is “done”, not an error. Partial CSV is still valid.

## Popup (Portuguese)

Shown when the user clicks the extension icon.

| State | UI |
|-------|----|
| Unsupported URL | `Abra um Reel do Instagram para extrair comentários.` Extract disabled. Download enabled only if storage already has rows for some previous session **and** we are on that same Reel; otherwise download disabled. |
| Supported, idle, 0 rows | Extract enabled. Download disabled. Counter `0 comentários · 0 respostas`. |
| Running | Pause enabled. Extract disabled. Counter live. Status `Extraindo…` |
| Paused | Extract (continua) enabled. Download if rows ≥ 1. Status `Pausado`. |
| Complete | Extract enabled (re-run / catch stragglers). Download enabled. Status `Concluído`. |
| Error | Extract enabled. Status shows `errorMessage`. Download if rows ≥ 1. |

Counter: `{n} comentários · {m} respostas` where `n` is rows with `type === "comment"` and `m` with `type === "reply"`.

No comment text list in the popup.

## Error catalog

| Code | When | User message |
|------|------|--------------|
| `UNSUPPORTED_URL` | Path is not `/reels/{shortcode}` | `Abra um Reel do Instagram para extrair comentários.` |
| `PANEL_NOT_FOUND` | Comments panel missing after trying to open it | `Abra os comentários deste Reel e tente de novo.` |
| `NO_COMMENTS_FOUND` | Panel exists but 0 comment nodes after first timeout (~8 s) | `Não encontrei comentários neste layout. O Instagram pode ter mudado a página.` |
| `TAB_GONE` | Content script port disconnects while running | Worker flips to `paused` if rows exist, else `idle`. Popup shows that status. No extra toast. |

No retry storm. User clicks Extract again.

## Instagram DOM strategy

Instagram class names are hashed and unstable. Do not key selectors on generated class hashes.

Prefer, in order:

1. Accessible name / aria-label of the comments button and replies controls (Portuguese and English).
2. Structural roles: dialog/section that contains the comments list after the comments button is pressed.
3. User-facing text patterns for reply buttons (regex on visible text).
4. Relative structure: username is a link into `/{username}/` inside the comment node; comment text is the adjacent text block, excluding like counts and timestamps.

Exact selectors are implementation details covered by fixtures. If a fixture representing a real 2026 Reels comments panel fails parse, that is a product bug.

The Reel caption is not a comment. `parseCommentList` skips a node flagged as caption in the fixture/parser (the media caption row above the comments list, including a pinned caption). Tests cover a panel fixture that contains caption + comments and expect only the comment/reply rows.

## Testing (TDD)

Stack: Vitest + jsdom. No live Instagram in unit tests. No production module is written before a failing test for that behavior.

Chrome `storage`, `tabs`, `runtime`, `downloads`, `scripting` are mocked only in popup/worker boundary tests.

### Required behaviors (each is a failing test first)

1. `canonicalPostUrl` strips query/hash; rejects non-`/reels/` paths.
2. `parseComment` reads username without `@`, text, `type=comment`, empty `replyTo`.
3. `parseComment` on a reply node sets `type=reply` and `replyTo` to immediate parent username.
4. `parseCommentList` ignores like buttons, composer, empty nodes.
5. Caption/header in the panel is not parsed as a comment.
6. `dedupe` keeps first row per `id`, appends new ids, preserves order.
7. Hash id is stable for the same four fields; Instagram id preferred when present.
8. `toCsv` writes BOM, header, escaped quotes/newlines/commas, empty `reply_to` for comments.
9. `extractionMachine`: start → running; pause → paused; three empty cycles with `hasMoreReplyButtons=false` → complete; empty cycles with `hasMoreReplyButtons=true` → still running.
10. `findCommentsPanel` returns null on closed fixture, node on open fixture.
11. `findReplyButtons` matches PT and EN labels, including “N replies / N respostas”.
12. Scroll helper moves `scrollTop` on the panel container mock, not `window`.
13. Worker merge: `BATCH` with mixed new/duplicate ids grows storage by new ids only.
14. `DOWNLOAD` with 0 rows does not call downloads; with ≥1 row produces the filename pattern.
15. Popup counter splits comments vs replies.

Fixtures live in `tests/fixtures/` as HTML snippets copied from Reels panel shapes (open panel, closed panel, one comment, comment+replies collapsed, nested replies, PT and EN buttons).

## File layout

```
manifest.json                 # MV3, host instagram.com, popup, worker, content_scripts
src/popup/popup.html
src/popup/popup.js
src/popup/popup.css
src/background/worker.js
src/content/extractor.js      # loop, clicks, scroll; calls pure modules
src/lib/canonicalPostUrl.js
src/lib/parseComment.js
src/lib/dedupe.js
src/lib/toCsv.js
src/lib/extractionMachine.js
src/lib/findComments.js       # panel, reply buttons, comment nodes
src/lib/hashId.js
tests/                        # Vitest specs mirroring src/lib and worker merge
tests/fixtures/
package.json                  # vitest, scripts test
```

Vanilla JS ESM everywhere: `package.json` and `manifest.json` both `"type": "module"`. No bundler. Vitest imports the same `src/lib/*` files the extension loads.

Permissions (exact):

- `permissions`: `storage`, `downloads`, `activeTab`
- `host_permissions`: `https://www.instagram.com/*`, `https://instagram.com/*`
- `content_scripts`: declarative, `matches` `https://www.instagram.com/reels/*` and `https://instagram.com/reels/*`
- No `scripting` permission. No extra `tabs` permission. After the user opens the popup, `chrome.tabs.query({ active: true, currentWindow: true })` is allowed by `activeTab`; the popup messages that tab with `chrome.tabs.sendMessage`.

## Risks

- Instagram markup changes: contained in find/parse + fixtures.
- Rate / bot detection: delays 400–900 ms, only the comments panel is scrolled, no parallel tabs.
- Incomplete thread if Instagram virtualizes the list: exhaustion heuristic may fire early; user can Extract again. No infinite scroll watchdog beyond the 3 empty cycles rule.
- ToS: this is a user-triggered DOM read of a page they have open, not a credential steal or unattended crawler.

## Implementation order

TDD on pure modules first (URL, parse, dedupe, CSV, machine, find helpers with fixtures), then worker merge, then content loop with a fake panel in jsdom, then popup wiring, then manual pass on a real Reel.
