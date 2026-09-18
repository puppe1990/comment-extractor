export function unpackedToReload(extensions, selfId) {
  return extensions.filter(
    (ext) =>
      ext.installType === "development" && ext.enabled && ext.id !== selfId,
  );
}
