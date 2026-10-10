import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-comparison-export-"));
const file = path.join(temp, "render.cjs");
test.after(async () => { await fs.rm(temp, { recursive: true, force: true }); });
await build({
  entryPoints: [path.join(import.meta.dirname, "comparison-export.ts")],
  bundle: true, platform: "node", format: "cjs", outfile: file,
});
const { renderComparisonChartsHtml, COMPARISON_EXPORT_FILENAME, renderComparisonMatricesCsv, COMPARISON_CSV_FILENAME } =
  await import(pathToFileURL(file).href);

const matrices = [{
  id: "report-1", title: "电池储能",
  columns: ["方案 A", "方案 B", "方案 C"],
  rows: [
    { label: "单位成本", values: ["¥1,200", "¥800", "未知"] },
    { label: "效率", values: ["99%", "86%", "不适用"] },
    { label: "零设备", values: ["0台", "0台", "—"] },
    { label: "成本估算", values: ["大约900", "不详", "低于100"] },
    { label: "备注", values: ["需要核查", "仅作参考", "尚未发布"] },
  ],
}];

test("long-form CSV covers every raw cell including text-only matrices, blanks and zeros", () => {
  const input = [{
    id: "m1", title: "规划方案", columns: ["A", "B"],
    rows: [
      {label: "成本", values: ["100元", ""]},
      {label: "说明", values: ["明确", "待审阅"]},
      {label: "数量", values: ["0", "2"]},
    ],
  }];
  const csv = renderComparisonMatricesCsv(input);
  assert.equal(COMPARISON_CSV_FILENAME, "aexus-comparison-matrices.csv");
  assert.equal(csv[0], "\uFEFF", "BOM improves local spreadsheet import of Chinese headers");
  assert.equal(csv.match(/\r\n/g)?.length, 7);
  assert.ok(csv.startsWith("\uFEFF\"矩阵ID\",\"矩阵名称\",\"比较维度\",\"比较对象\",\"原始值\"\r\n"));
  assert.match(csv, /"m1","规划方案","成本","A","100元"/);
  assert.match(csv, /"m1","规划方案","成本","B",""/);
  assert.match(csv, /"m1","规划方案","说明","B","待审阅"/);
  assert.match(csv, /"m1","规划方案","数量","A","0"/);
  assert.equal(renderComparisonMatricesCsv(input), csv);
  assert.throws(() => renderComparisonMatricesCsv([]), /没有可导出的比较矩阵数据/);
});

test("CSV quoting and spreadsheet formula injection are handled for all cells", () => {
  const input = [{
    id: '=id("x")', title: '@sheet',
    columns: ['+candidate', '  =cmd'],
    rows: [
      { label: '-dimension', values: ['=HYPERLINK("http://example.invalid","click")', '  =SUM(1,2)'] },
      { label: '含逗号，和"引号"', values: ['multi\nline', '+INJECT'] },
    ],
  }];
  const csv = renderComparisonMatricesCsv(input);
  assert.match(csv, /"'=id\(""x""\)"/);
  assert.match(csv, /"'@sheet"/);
  assert.match(csv, /"'-dimension"/);
  assert.match(csv, /"'\+candidate"/);
  assert.match(csv, /"'  =cmd"/);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/example\.invalid"",""click""\)"/);
  assert.match(csv, /"'  =SUM\(1,2\)"/);
  assert.match(csv, /"含逗号，和""引号"""/);
  assert.match(csv, /"multi\nline"/);
  assert.match(csv, /"'\+INJECT"/);
});

test("portable comparison export is deterministic, self-contained and preserves the original matrix", () => {
  const output = renderComparisonChartsHtml(matrices);
  assert.equal(output, renderComparisonChartsHtml(matrices));
  assert.equal(COMPARISON_EXPORT_FILENAME, "aexus-comparison-charts.html");
  assert.match(output, /^<!doctype html><html lang="zh-CN">/);
  assert.match(output, /<meta name="viewport"/);
  assert.match(output, /@media print/);
  assert.match(output, /<h1>研究比较图表<\/h1>/);
  assert.equal((output.match(/<figure class="comparison-card">/g) ?? []).length, 3);
  assert.equal((output.match(/<section class="matrix-section">/g) ?? []).length, 1);
  assert.match(output, /¥1,200/);
  assert.match(output, /未绘制：方案 C（缺失或不可比）/);
  assert.match(output, /99%/);
  assert.match(output, /备注/);
  assert.match(output, /仅作参考/);
  assert.match(output, /大约900/);
  assert.match(output, /负数、日期编号、范围、估算及单位不一致的行没有绘制/);
  assert.match(output, /尚未逐单元格独立核验/);
  assert.doesNotMatch(output, /<script|<iframe|<link|<img|fetch\(|@import|url\(/);
});

test("zero is retained as original zero, while unknown never turns into zero", () => {
  const output = renderComparisonChartsHtml(matrices);
  assert.match(output, /零设备/);
  assert.match(output, /0台/);
  assert.match(output, /width:0%/);
  assert.match(output, /<td>未知<\/td>/);
  assert.doesNotMatch(output, /<b class="raw-value">未知<\/b>/);
});

test("user-controlled strings are escaped in names, values, notes and accessibility labels", () => {
  const hostile = [{
    id: "custom",
    title: '<img src=x onerror="alert(1)">',
    columns: ["<script>bad()</script>", "方案乙"],
    rows: [
      { label: '成本"><svg/onload=alert(1)>', values: ["100元", "250元"] },
      { label: "</style><script>bad()</script>", values: ["javascript:alert(1)", "<iframe>unsafe</iframe>"] },
    ],
  }];
  const output = renderComparisonChartsHtml(hostile);
  assert.match(output, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(output, /&lt;svg\/onload=alert\(1\)&gt;/);
  assert.match(output, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(output, /&lt;iframe&gt;unsafe&lt;\/iframe&gt;/);
  assert.doesNotMatch(output, /<img|<svg|<script|<iframe/);
  assert.match(output, /<div class="table-scroll" tabindex="0" role="region"/);
});

test("only matrices with comparable charts appear; row data is preserved within them", () => {
  const nothing = { id: "empty", title: "未形成数据", columns: ["A", "B"],
    rows: [{ label: "可信度", values: ["中等", "较高"] }] };
  const result = renderComparisonChartsHtml([...matrices, nothing]);
  assert.doesNotMatch(result, /未形成数据/);
  assert.equal((result.match(/<section class="matrix-section">/g) ?? []).length, 1);
  assert.throws(() => renderComparisonChartsHtml([nothing]), /没有可绘制的同单位数值/);
});

test("all charts appear in portable output even when the on-screen view initially shows only four", () => {
  const larger = [{
    id: "many", title: "多维度", columns: ["A", "B"],
    rows: Array.from({length: 17}, (_, index) =>
      ({label: "维度 " + (index + 1), values: [String(index + 1), String(index + 2)]})),
  }];
  const out = renderComparisonChartsHtml(larger);
  assert.equal((out.match(/<figure class="comparison-card">/g) ?? []).length, 17);
  assert.equal((out.match(/<tbody><tr>/g) ?? []).length, 1);
});
