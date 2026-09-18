export function scrollPanel(container) {
  const before = container.scrollTop;
  const next = Math.min(
    container.scrollTop + container.clientHeight,
    container.scrollHeight - container.clientHeight,
  );
  container.scrollTop = Math.max(0, next);
  return container.scrollTop !== before;
}
