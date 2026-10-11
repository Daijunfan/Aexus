'use strict';
exports.register = ({ command, str, num, opt, obj }) => {
  command('appearance.get', 'Read portable appearance and its optimistic-concurrency fingerprint without writing or opening a window.', false);
  const source = {
    path: str('Existing JSON theme path in this workspace; exclusive with content.'),
    content: str('Client-uploaded theme JSON, at most 64 KiB; exclusive with path.')
  };
  command('appearance.theme.inspect', 'Validate a local theme before applying; reject executable CSS, URLs, assets, unknown keys and malformed data.', false, source);
  command('appearance.theme.export', 'Export only presentation fields to a new JSON file; no navigation, documents, credentials or font files.', true, {
    path: str('New workspace-relative .json file; never overwrite an existing file.', true),
    title: str('Portable theme name, 1–80 characters.'),
    settings: obj('Optional preview appearance fields: theme, uiPalette, uiBackdrop, uiMotion, uiCustomAccent, uiCustomGlow, uiBackgroundStrength. Omit for saved appearance.')
  });
  command('appearance.theme.import', 'Apply an inspected theme atomically after checking its bytes and current appearance version. Preserve all nonappearance settings.', true, {
    ...source,
    expectedSha256: str('SHA-256 from appearance.theme.inspect.', true),
    expectedAppearanceVersion: str('Fingerprint from appearance.get. Unrelated navigation does not invalidate it.', true)
  });
};
