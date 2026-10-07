// All offsets are UTF-16 offsets in sanitized article textContent, matching Core.
export function textRange(root, start, end) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node, at = 0, first, last;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('.study-highlight-layer,.reader-inline-tools')) continue;
    const next = at + node.length;
    if (!first && start < next) first = [node, start - at];
    if (end <= next && end > at) { last = [node, end - at]; break; }
    at = next;
  }
  if (!first || !last) return null;
  const range = document.createRange(); range.setStart(...first); range.setEnd(...last); return range;
}
export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
