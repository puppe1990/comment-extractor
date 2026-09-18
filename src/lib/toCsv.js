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
