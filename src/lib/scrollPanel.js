function isPageScroller(el) {
  const tag = el.tagName;
  return tag === "BODY" || tag === "HTML";
}

export function findScrollable(panel) {
  if (!panel) return null;
  const nodes = [];
  let ancestor = panel;
  for (let i = 0; i < 12 && ancestor; i += 1) {
    if (!isPageScroller(ancestor)) nodes.push(ancestor);
    if (ancestor.getAttribute?.("role") === "dialog") break;
    ancestor = ancestor.parentElement;
  }
  nodes.push(...panel.querySelectorAll("div, ul, ol, section"));

  let best = panel;
  let bestExtra = -1;
  for (const el of nodes) {
    const extra = (el.scrollHeight || 0) - (el.clientHeight || 0);
    if (extra > bestExtra) {
      best = el;
      bestExtra = extra;
    }
  }
  return best;
}

export function scrollPanel(container) {
  if (!container) return false;
  const before = container.scrollTop;
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  container.scrollTop = max;
  return container.scrollTop !== before;
}
