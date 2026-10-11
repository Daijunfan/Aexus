// Keep the original UTF-16 string and DOM intact. The dictionary draws an
// independent overlay so PDF text selection and existing excerpt offsets survive.
const ignored = 'script,style,.reader-dictionary-layer,.study-highlight-layer,.reader-inline-tools';
const excluded = 'a,button,code,pre,.katex,svg';
export function readingText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = []; let node, text = '';
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest(ignored)) continue;
    const skip = Boolean(node.parentElement?.closest(excluded));
    nodes.push({ node, start: text.length, end: text.length + node.length, skip });
    text += skip ? ' '.repeat(node.length) : node.data;
  }
  return { text, nodes };
}
export function readingRange(records, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return null;
  const first = records.find(r => r.end > start), last = records.find(r => r.end >= end);
  if (!first || !last || first.skip || last.skip || !first.node.isConnected || !last.node.isConnected) return null;
  if (records.some(r => r.skip && r.start < end && r.end > start)) return null;
  const range = document.createRange(); range.setStart(first.node, start - first.start); range.setEnd(last.node, end - last.start); return range;
}
