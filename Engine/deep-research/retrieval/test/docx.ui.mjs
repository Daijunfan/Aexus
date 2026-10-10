import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {build} from "vite";
import {chromium} from "playwright";
import {makeDocx, wrapWord} from "./docx-fixture.mjs";

const project = path.resolve(import.meta.dirname, "../../../..");
const output = path.resolve(project, ".aexus/out/retrieval-docx-smoke");
await build({
  root: project, configFile: false, logLevel: "error",
  build: {outDir: output, emptyOutDir: true, target: "es2022",
    lib: {entry: path.resolve(import.meta.dirname, "../materials.ts"),
      formats: ["es"], fileName: "materials"}},
});
const server = http.createServer(async (request, response) => {
  const name = new URL(request.url, "http://localhost").pathname.slice(1);
  if (!name) {response.writeHead(200, {"content-type": "text/html"}); response.end("<!doctype html><title>DOCX fixture</title>"); return;}
  if (name === "favicon.ico") {response.writeHead(204); response.end(); return;}
  if (name.includes("..") || name.includes("/")) {response.writeHead(404); response.end(); return;}
  try {
    const body = await fs.readFile(path.join(output, name));
    response.writeHead(200, {"content-type": "text/javascript"});
    response.end(body);
  } catch {
    response.writeHead(404); response.end("Not found");
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:" + server.address().port;
const paragraph = text => '<w:p><w:r><w:t>' + text + '</w:t></w:r></w:p>';
const normal = wrapWord(
  '<w:p><w:r><w:t xml:space="preserve">Energy </w:t></w:r>' +
  '<w:hyperlink><w:r><w:t>研究 A&amp;B</w:t></w:r></w:hyperlink></w:p>' +
  '<w:tbl><w:tr><w:tc>' + paragraph("成本") + '</w:tc><w:tc>' + paragraph("效率") + '</w:tc></w:tr></w:tbl>' +
  '<w:p><w:r><w:t>Today</w:t><w:tab/><w:t>Tomorrow</w:t></w:r></w:p>' +
  '<w:p><w:del><w:r><w:t>deleted content</w:t></w:r></w:del><w:r><w:instrText>PRIVATE FIELD</w:instrText></w:r><w:r><w:t>可见内容</w:t></w:r></w:p>'
);
const realDocxPath = process.env.RETRIEVAL_REAL_DOCX;
const cases = [
  {name: "read.docx", base64: makeDocx(normal).toString("base64")},
  {name: "stored.DOCX", base64: makeDocx(normal, {stored: true}).toString("base64")},
  {name: "descriptor.docx", base64: makeDocx(normal, {descriptor: true}).toString("base64")},
  {name: "utf16.docx", base64: makeDocx(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(normal, "utf16le")])).toString("base64")},
  {name: "invalid-xml.docx", base64: makeDocx("<bad-root/>").toString("base64")},
  {name: "unsafe-xml.docx", base64: makeDocx(wrapWord('<!DOCTYPE x [<!ENTITY bomb "unsafe">]>' + paragraph("text"))).toString("base64")},
  {name: "image-only.docx", base64: makeDocx(wrapWord('<w:p><w:r><w:drawing/></w:r></w:p>')).toString("base64")},
  {name: "oversize-text.docx", base64: makeDocx(wrapWord(paragraph("x".repeat(200_001)))).toString("base64")},
  {name: "bad-crc.docx", base64: makeDocx(normal, {badCrc: true}).toString("base64")},
];
if (realDocxPath) cases.push({name: "real-app-generated.docx", base64: (await fs.readFile(realDocxPath)).toString("base64")});
let browser;
try {
  browser = await chromium.launch({channel: process.env.AGENTS_BROWSER_CHANNEL || "chrome", headless: true});
  const page = await browser.newPage();
  const unexpected = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    unexpected.push(route.request().url()); return route.abort();
  });
  await page.goto(origin);
  const start = performance.now();
  const results = await page.evaluate(async values => {
    const {parseResearchMaterial} = await import("/materials.mjs");
    const output = [];
    for (const item of values) {
      const bytes = Uint8Array.from(atob(item.base64), char => char.charCodeAt(0));
      try {
        output.push({name: item.name, material: await parseResearchMaterial(new File([bytes], item.name))});
      } catch (error) {
        output.push({name: item.name, error: String(error)});
      }
    }
    return output;
  }, cases);
  for (const actual of results.slice(0, 4)) {
    assert.equal(actual.material.name, actual.name);
    assert.match(actual.material.content, /Energy 研究 A&B/);
    assert.match(actual.material.content, /成本\t效率/);
    assert.match(actual.material.content, /Today\s+Tomorrow/);
    assert.match(actual.material.content, /可见内容/);
    assert.doesNotMatch(actual.material.content, /deleted content|PRIVATE FIELD/);
    assert.deepEqual(Object.keys(actual.material), ["name", "content"]);
  }
  assert.match(results[4].error, /DOCX/);
  assert.match(results[5].error, /XML 声明/);
  assert.match(results[6].error, /OCR/);
  assert.match(results[7].error, /200,000/);
  assert.match(results[8].error, /校验失败/);
  if (realDocxPath) {
    assert.match(results.at(-1).material.content, /Energy research notes/);
    assert.match(results.at(-1).material.content, /日本語と中文の検証/);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({
    passed: true, browser: "headless Chrome", cases: cases.length,
    elapsedMs: Math.round(performance.now() - start),
    note: "Browser-native deflate-raw + DOMParser; no model/network/employee operation",
  }));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
