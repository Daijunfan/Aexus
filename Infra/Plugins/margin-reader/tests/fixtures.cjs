'use strict';
const JSZip = require('jszip');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createPlugin } = require('../runtime.cjs');
const assert = require('node:assert/strict');
async function setup(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'margin-reader-test-'));
  const workspace = path.join(parent, '中文 library'); await fs.mkdir(workspace);
  const runtime = await createPlugin({ workspace });
  t.after(async () => { await runtime.close(); await fs.rm(parent, { recursive: true, force: true }); });
  const raw = (method, params = {}) => runtime.request({ jsonrpc: '2.0', id: 1, method, params });
  const api = async (method, params = {}) => { const reply = await raw(method, params); assert.equal(reply.error, undefined, JSON.stringify(reply.error)); return reply.result; };
  const error = async (method, params, code) => { const reply = await raw(method, params); assert.equal(reply.error?.data?.code, code, JSON.stringify(reply)); return reply.error; };
  return { parent, workspace, runtime, raw, api, error };
}
function pdfFixture() {
  const text1 = 'BT /F1 20 Tf 60 720 Td (Introduction - CLI Reader) Tj ET';
  const text2 = 'BT /F1 20 Tf 60 720 Td (Chapter Two - offline search) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text1.length} >>\nstream\n${text1}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${text2.length} >>\nstream\n${text2}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>',
    '<< /Title (Introduction) /Parent 8 0 R /Dest [3 0 R /Fit] /Next 10 0 R >>',
    '<< /Title (Chapter Two) /Parent 8 0 R /Dest [5 0 R /Fit] /Prev 9 0 R >>'
  ];
  let file = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(file)); file += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(file);
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(file);
}
async function docxFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>中文 Word 标题</w:t></w:r></w:p><w:p><w:r><w:t>Word searchable content and local-first reading.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>第二节</w:t></w:r></w:p><w:p><w:r><w:t>Nested heading body.</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}
async function epubFixture(ncx = false) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file('META-INF/container.xml', '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('EPUB/book.opf', `<package xmlns="http://www.idpf.org/2007/opf" version="${ncx ? '2.0' : '3.0'}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>电子书测试</dc:title></metadata><manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" ${ncx ? '' : 'properties="nav"'}/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="ncx"><itemref idref="one"/><itemref idref="two"/></spine></package>`);
  zip.file('EPUB/one.xhtml', '<html><body><h1 id="intro">Introduction</h1><p>EPUB offline reading.</p><a href="two.xhtml#detail">Next chapter</a></body></html>');
  zip.file('EPUB/two.xhtml', '<html><body><h1>Second chapter</h1><h2 id="detail">Detailed section</h2><p>中文内容 searchable second chapter.</p><script>window.bad=true</script></body></html>');
  zip.file('EPUB/nav.xhtml', '<html><body><nav epub:type="toc"><ol><li><a href="one.xhtml#intro">Book opening</a></li><li><a href="two.xhtml">Second chapter</a><ol><li><a href="two.xhtml#detail">Detailed section</a></li></ol></li></ol></nav></body></html>');
  zip.file('EPUB/toc.ncx', '<ncx><navMap><navPoint id="a"><navLabel><text>NCX opening</text></navLabel><content src="one.xhtml#intro"/></navPoint><navPoint id="b"><navLabel><text>NCX second</text></navLabel><content src="two.xhtml#detail"/></navPoint></navMap></ncx>');
  return zip.generateAsync({ type: 'nodebuffer' });
}
module.exports = { setup, pdfFixture, docxFixture, epubFixture };
