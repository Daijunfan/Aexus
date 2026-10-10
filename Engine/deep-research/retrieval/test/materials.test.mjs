import test from "node:test";
import assert from "node:assert/strict";
import {parseResearchMaterial} from "../materials.ts";
import {makeDocx, wrapWord} from "./docx-fixture.mjs";

const fixture = (name, contents) => new File([contents], name);
const pdf = (name = "source.pdf") => fixture(name, "%PDF-1.7\nmock pages");

test("text background materials preserve original content and existing workflow shape", async () => {
  for (const name of ["notes.txt", "notes.MD", "results.csv", "case.json"]) {
    const content = "跨语言检索\nA, B & C";
    assert.deepEqual(await parseResearchMaterial(fixture(name, content)), {name, content});
  }
});

test("text input keeps the original 200KB limit and rejects unsupported formats", async () => {
  await assert.rejects(parseResearchMaterial(fixture("document.doc", "unhandled")), /支持/);
  await assert.rejects(parseResearchMaterial(fixture("scan.png", "binary")), /支持/);
  await assert.rejects(parseResearchMaterial(fixture("huge.txt", "A".repeat(200_001))), /200KB/);
  assert.equal((await parseResearchMaterial(fixture("boundary.txt", "a".repeat(200_000)))).content.length, 200_000);
});

test("text import preserves multilingual UTF-8 and UTF-16 BOM without silently corrupting bytes", async () => {
  const text = "研究结果：費用と安全性 – study";
  assert.deepEqual(await parseResearchMaterial(fixture("unicode.csv", text)), {name: "unicode.csv", content: text});
  const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
  const utf16be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, "utf16le").swap16()]);
  assert.equal((await parseResearchMaterial(fixture("unicode-le.txt", utf16le))).content, text);
  assert.equal((await parseResearchMaterial(fixture("unicode-be.txt", utf16be))).content, text);
  await assert.rejects(parseResearchMaterial(fixture("bad.csv", Uint8Array.of(0xc3, 0x28))), /编码/);
  await assert.rejects(parseResearchMaterial(fixture("binary.md", Uint8Array.of(65, 0, 66))), /二进制/);
  await assert.rejects(parseResearchMaterial({
    name: "misreported.txt", size: 1, text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(200_001),
  }), /200KB/);
});

test("PDF import labels its actual pages and never marks them as verified sources", async () => {
  let call = 0;
  const material = await parseResearchMaterial(pdf("阅读.pdf"), {readPdf: async (data) => {
    assert.equal(new TextDecoder().decode(data.subarray(0, 5)), "%PDF-");
    call++;
    return ["The first finding.", "第二页\n完整段落"];
  }});
  assert.equal(call, 1);
  assert.deepEqual(material, {
    name: "阅读.pdf",
    content: "【PDF 第 1 页】\nThe first finding.\n\n【PDF 第 2 页】\n第二页\n完整段落",
  });
  assert.deepEqual(Object.keys(material), ["name", "content"]);
});

test("PDF size, signature, pages, text layer and character limits fail closed", async () => {
  const mock = async () => ["real content"];
  await assert.rejects(parseResearchMaterial(fixture("fake.pdf", "HTML data"), {readPdf: mock}), /文件头/);
  await assert.rejects(parseResearchMaterial({name: "large.pdf", size: 8 * 1024 * 1024 + 1, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0)}, {readPdf: mock}), /8 MiB/);
  await assert.rejects(parseResearchMaterial({name: "misreported.pdf", size: 15, text: async () => "", arrayBuffer: async () => new ArrayBuffer(8 * 1024 * 1024 + 1)}, {readPdf: mock}), /8 MiB/);
  await assert.rejects(parseResearchMaterial(pdf(), {readPdf: async () => Array(81).fill("word")}), /80 页/);
  await assert.rejects(parseResearchMaterial(pdf(), {readPdf: async () => ["", "  "]}), /OCR/);
  await assert.rejects(parseResearchMaterial(pdf(), {readPdf: async () => ["word".repeat(50_000)]}), /200,000/);
});

test("cancelled background imports never accept a late read result", async () => {
  const controller = new AbortController();
  controller.abort(Error("user cancelled"));
  await assert.rejects(parseResearchMaterial(pdf(), {signal: controller.signal, readPdf: async () => ["should not run"]}), /user cancelled/);
  const reading = new AbortController();
  await assert.rejects(parseResearchMaterial(pdf(), {signal: reading.signal, readPdf: async () => {
    reading.abort(Error("PDF cancelled"));
    return ["would have succeeded"];
  }}), /PDF cancelled/);
  const text = new AbortController();
  const fakeText = {name: "a.txt", size: 1, text: async () => {
    return "unused";
  }, arrayBuffer: async () => {
    text.abort(Error("text cancelled"));
    return new TextEncoder().encode("late").buffer;
  }};
  await assert.rejects(parseResearchMaterial(fakeText, {signal: text.signal}), /text cancelled/);
});

test("injected PDF parse errors keep an explicit failure", async () => {
  await assert.rejects(parseResearchMaterial(pdf(), {readPdf: async () => {throw Error("PDF worker unavailable");}}), /worker unavailable/);
});

test("DOCX upload rejects malformed, encrypted, duplicate and unsupported Office archives", async () => {
  const xml = wrapWord('<w:p><w:r><w:t>Visible paragraph</w:t></w:r></w:p>');
  await assert.rejects(parseResearchMaterial(fixture("invalid.docx", "not a ZIP")), /DOCX/);
  await assert.rejects(parseResearchMaterial(fixture("missing.DOCX", makeDocx(xml, {noManifest: true}))), /缺少/);
  await assert.rejects(parseResearchMaterial(fixture("double.docx", makeDocx(xml, {duplicateDocument: true}))), /重复/);
  await assert.rejects(parseResearchMaterial(fixture("protected.docx", makeDocx(xml, {encrypted: true}))), /加密/);
  await assert.rejects(parseResearchMaterial(fixture("method.docx", makeDocx(xml, {method: 9}))), /压缩格式/);
  await assert.rejects(parseResearchMaterial(fixture("broken.docx", makeDocx(xml, {badCrc: true}))), /校验失败/);
});

test("DOCX extraction guards compressed bombs and dishonest File byte lengths", async () => {
  const bomb = makeDocx(wrapWord('<w:p><w:r><w:t>' + 'a'.repeat(4 * 1024 * 1024) + '</w:t></w:r></w:p>'));
  await assert.rejects(parseResearchMaterial(fixture("bomb.docx", bomb)), /4 MiB/);
  const disguised = makeDocx(wrapWord('<w:p><w:r><w:t>' + 'a'.repeat(4 * 1024 * 1024) + '</w:t></w:r></w:p>'), {fakeExtractedSize: 20});
  await assert.rejects(parseResearchMaterial(fixture("disguised.docx", disguised)), /4 MiB/);
  await assert.rejects(parseResearchMaterial({
    name: "misreported.docx", size: 3, text: async () => "",
    arrayBuffer: async () => new ArrayBuffer(8 * 1024 * 1024 + 1),
  }), /8 MiB/);
});

test("DOCX extraction checks owner cancellation before accepting an archive", async () => {
  const controller = new AbortController();
  controller.abort(Error("DOCX cancelled"));
  await assert.rejects(parseResearchMaterial(fixture("cancelled.docx", makeDocx(wrapWord("<w:body/>"))), {signal: controller.signal}), /DOCX cancelled/);
});
