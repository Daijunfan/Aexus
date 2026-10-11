export function pageLink(pageId: string, blockId?: string) {
  return `mininotion://page/${encodeURIComponent(pageId)}${blockId ? '#' + encodeURIComponent(blockId) : ''}`;
}
export function pageReference(value: string) {
  const path = value.replace(/^mininotion:\/\/page\//, '');
  const [pageId, blockId] = path.split('#', 2);
  return { pageId: decodeURIComponent(pageId), ...(blockId ? { blockId: decodeURIComponent(blockId) } : {}) };
}
