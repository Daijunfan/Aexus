'use strict';
// MOBI 0.4.6 resolves byte-position links but does not emit their target anchors.
// Materialize those anchors in decoded chapter text before the normal sanitizer.
function materializeMobiTargets(book) {
  const positions = new Set();
  function collect(nodes) { for (const node of nodes || []) { const match = /^filepos:(\d+)$/.exec(node.href || ''); if (match) positions.add(Number(match[1])); collect(node.children); } }
  collect(book.getToc());
  for (const chapter of book.chapters) for (const match of chapter.text.matchAll(/\bfilepos\s*=\s*["']?(\d+)/gi)) positions.add(Number(match[1]));
  const parts = [];
  for (let i = 0; i < book.mobiFile.palmdocHeader.numTextRecords; i++) parts.push(Buffer.from(book.mobiFile.loadTextBuffer(i)));
  const raw = Buffer.concat(parts), valid = new Set();
  const decode = bytes => book.mobiFile.decode(new Uint8Array(bytes).buffer);
  for (const chapter of book.chapters) {
    const end = chapter.end ?? raw.length;
    const original = decode(raw.subarray(chapter.start, end));
    let prefix = original.indexOf(chapter.text);
    if (prefix < 0) prefix = original.indexOf(chapter.text.slice(0, 80));
    if (prefix < 0) continue;
    const inserts = [];
    for (const position of positions) {
      if (position < chapter.start || position >= end) continue;
      let offset = decode(raw.subarray(chapter.start, position)).length - prefix;
      offset = Math.min(chapter.text.length, Math.max(0, offset));
      // A filepos can point at a tag or an attribute; insert before the whole tag.
      const before = chapter.text.slice(0, offset);
      if (before.lastIndexOf('<') > before.lastIndexOf('>')) offset = before.lastIndexOf('<');
      inserts.push({ offset, position }); valid.add(position);
    }
    for (const insert of inserts.sort((a, b) => b.offset - a.offset || b.position - a.position)) {
      const anchor = `<span id="filepos:${insert.position}"></span>`;
      chapter.text = chapter.text.slice(0, insert.offset) + anchor + chapter.text.slice(insert.offset);
    }
  }
  book.resolveHref = href => {
    const match = /^filepos:(\d+)$/.exec(href || ''); if (!match) return undefined;
    const position = Number(match[1]); if (!valid.has(position)) return undefined;
    const chapter = book.chapters.find(ch => position >= ch.start && position < (ch.end ?? raw.length));
    return chapter ? { id: chapter.id, selector: `[id="filepos:${position}"]` } : undefined;
  };
}
module.exports = { materializeMobiTargets };
