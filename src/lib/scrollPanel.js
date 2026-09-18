export function findScrollable(panel) {
  if (!panel) return null;
  const nodes = [panel, ...panel.querySelectorAll("div, ul, ol, section")];
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
  const step = Math.max(container.clientHeight || 0, 240);
  let next = Math.min(max, before + step);
  if (next === before && before < max) next = max;
  container.scrollTop = Math.max(0, next);
  return container.scrollTop !== before;
}
