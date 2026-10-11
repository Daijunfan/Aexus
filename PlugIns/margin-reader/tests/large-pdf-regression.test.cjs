'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setup } = require('./fixtures.cjs');
const { createPlugin } = require('../runtime.cjs');
const { digest, LIMITS } = require('../lib/safety.cjs');

function largePdf(pageCount = 1200) {
  const outline = 4 + pageCount * 2;
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /Outlines ${outline} 0 R >>`,
    `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  const padding = '%' + 'x'.repeat(16384) + '\n';
  for (let i = 0; i < pageCount; i++) {
    const text = padding + `BT /F1 18 Tf 50 700 Td (Reader regression page ${i + 1} performance search) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects.push(`<< /Type /Outlines /First ${outline + 1} 0 R /Last ${outline + 2} 0 R /Count 2 >>`);
  objects.push(`<< /Title (Opening) /Parent ${outline} 0 R /Dest [4 0 R /Fit] /Next ${outline + 2} 0 R >>`);
  objects.push(`<< /Title (Final chapter) /Parent ${outline} 0 R /Dest [${4 + (pageCount - 1) * 2} 0 R /Fit] /Prev ${outline + 1} 0 R >>`);
  const parts = ['%PDF-1.4\n'], offsets = [0]; let size = Buffer.byteLength(parts[0]);
  objects.forEach((object, i) => { offsets.push(size); const part = `${i + 1} 0 obj\n${object}\nendobj\n`; parts.push(part); size += Buffer.byteLength(part); });
  parts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join(''));
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`);
  return Buffer.from(parts.join(''));
}

test('multi-chunk 1200-page PDF imports, searches, jumps and reopens without losing bytes', { timeout: 240000 }, async t => {
  const { api, workspace } = await setup(t);
  const bytes = largePdf(); assert(bytes.length > LIMITS.chunk * 4);
  const upload = await api('import.begin', { path: 'large-regression.pdf', totalBytes: bytes.length });
  for (let offset = 0; offset < bytes.length; offset += upload.chunkSize) {
    const part = bytes.subarray(offset, offset + upload.chunkSize);
    const status = await api('import.chunk', { uploadId: upload.uploadId, offset, contentBase64: part.toString('base64') });
    assert.equal(status.received, offset + part.length);
  }
  const doc = await api('import.finish', { uploadId: upload.uploadId, sha256: digest(bytes) });
  assert.equal(doc.pageCount, 1200); assert.equal(doc.toc.at(-1).locator.page, 1200);
  assert.equal(digest(await fs.readFile(path.join(workspace, doc.path))), digest(bytes));
  for (const page of [1, 600, 1200]) assert.match((await api('document.content', { id: doc.id, page })).text, new RegExp(`page ${page} performance`));
  assert((await api('document.search', { id: doc.id, query: 'performance' })).matches.length > 0);
  await api('reader.position.set', { id: doc.id, locator: doc.toc.at(-1).locator });
  const other = await createPlugin({ workspace }); t.after(() => other.close());
  const reopened = await other.request({ jsonrpc: '2.0', id: 1, method: 'document.open', params: { path: doc.path } });
  assert(!reopened.error, JSON.stringify(reopened.error)); assert.equal(reopened.result.id, doc.id); assert.equal(reopened.result.position.page, 1200);
});
