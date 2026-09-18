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
