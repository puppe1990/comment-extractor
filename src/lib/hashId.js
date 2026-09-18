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
