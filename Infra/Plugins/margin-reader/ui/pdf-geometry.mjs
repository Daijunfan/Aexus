// Pure view geometry; durable preferences and locators use the Core API.
export const PAGE_GAP = 8;
export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
export function pageGeometry(section, width, height, fit = 'width', zoom = 1) {
  const w = section.width || 612, h = section.height || 792;
  const scale = Math.max(0.01, (fit === 'page' ? Math.min(width / w, height / h) : width / w) * zoom);
  return { width: w * scale, height: h * scale, scale };
}
export function layoutPages(sections, width, height, fit, zoom) {
  let top = 0;
  return sections.map(section => {
    const size = pageGeometry(section, width, height, fit, zoom);
    const result = { ...size, top }; top += size.height + PAGE_GAP; return result;
  });
}
export function pageAt(pages, top) {
  let low = 0, high = pages.length - 1;
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (pages[mid].top <= top + 1) low = mid; else high = mid - 1; }
  return low;
}
export function locate(pages, top, pagedIndex = null) {
  if (!pages.length) return { page: 1, pageOffset: 0 };
  const index = pagedIndex ?? pageAt(pages, top), page = pages[index];
  const offset = clamp((top - (pagedIndex === null ? page.top : 0)) / page.height, 0, 1);
  return { page: index + 1, pageOffset: Math.round(offset * 100000) / 100000 };
}
export function positionTop(position, pages, viewportHeight, paged = false) {
  const index = clamp((position.page || 1) - 1, 0, pages.length - 1), page = pages[index];
  const offset = position.pageOffset !== undefined ? position.pageOffset * page.height : (position.offset || 0) * Math.max(0, page.height - viewportHeight);
  return (paged ? 0 : page.top) + offset;
}
