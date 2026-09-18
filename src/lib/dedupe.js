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
