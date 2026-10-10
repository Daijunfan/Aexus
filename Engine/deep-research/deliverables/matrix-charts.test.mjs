import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const directory = import.meta.dirname;
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-comparison-charts-"));
await build({
  stdin: {
    contents: `
      import React from "react";
      import { renderToStaticMarkup } from "react-dom/server";
      export { parseComparableValue, projectComparisonCharts, comparisonBarPercent } from "./matrix-charts.ts";
      export { extractMatrices } from "../ResearchInsights.ts";
      import { ComparisonCharts } from "./ComparisonCharts.tsx";
      export const renderCharts = (matrices) =>
        renderToStaticMarkup(React.createElement(ComparisonCharts, {
          matrices, onSelectMatrix: () => {}
        }));
    `,
    resolveDir: directory,
    sourcefile: "chart-verify.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  loader: { ".css": "empty" },
  outfile: path.join(tmp, "charts.cjs"),
});
const { parseComparableValue, projectComparisonCharts, comparisonBarPercent, extractMatrices, renderCharts } =
  await import(pathToFileURL(path.join(tmp, "charts.cjs")).href);
test.after(async () => { await fs.rm(tmp, { recursive: true, force: true }); });

const example = [{
  id: "report-0",
  title: "成本与性能",
  columns: ["方案 A", "方案 B", "方案 C"],
  rows: [
    { label: "月成本", values: ["¥1,200.50", "¥840", "—"] },
    { label: "转化率", values: ["25%", "40％", "暂无数据"] },
    { label: "能耗", values: ["1.2 kWh", "1.5 kWh", "2.1 kWh"] },
    { label: "混合币种", values: ["$30", "¥40", ""] },
    { label: "预测区间", values: ["约30", "40", ""] },
    { label: "版本号", values: ["2.0", "3.0", ""] },
    { label: "免费项目", values: ["免费", "0", ""] },
    { label: "零值", values: ["0", "0", "未知"] },
  ],
}];

test("numeric parser keeps raw scales and rejects unknown semantics", () => {
  assert.deepEqual(parseComparableValue("￥1,200.50"), { value: 1200.5, unit: "¥" });
  assert.deepEqual(parseComparableValue("35 %"), { value: 35, unit: "%" });
  assert.deepEqual(parseComparableValue("0"), { value: 0, unit: "" });
  assert.deepEqual(parseComparableValue("1.2 kWh"), { value: 1.2, unit: "kWh" });
  for (const invalid of [
    "约25", "≥8", "8-10", "2025-01-12", "1,23", "20元-30元",
    "免费", "30亿人民币", "-3", "Infinity", "1e8", "¥3美元", "<script>7</script>",
    "9".repeat(200), "01", "00004", "9007199254740992",
  ]) assert.equal(parseComparableValue(invalid), null, invalid);
});

test("bar scale is bounded and does not make zero into missing data", () => {
  assert.equal(comparisonBarPercent(0, 0), 0);
  assert.equal(comparisonBarPercent(0, 100), 0);
  assert.equal(comparisonBarPercent(50, 100), 50);
  assert.equal(comparisonBarPercent(200, 100), 100);
  assert.equal(comparisonBarPercent(-1, 100), 0);
  assert.equal(comparisonBarPercent(Number.POSITIVE_INFINITY, 100), 0);
});

test("charts only use comparable metrics; unknown and zero are never conflated", () => {
  const before = JSON.stringify(example);
  const charts = projectComparisonCharts(example);
  assert.deepEqual(charts.map(chart => chart.metric), ["月成本", "转化率", "能耗", "零值"]);
  assert.deepEqual(charts[0].values, [
    { label: "方案 A", raw: "¥1,200.50", value: 1200.5 },
    { label: "方案 B", raw: "¥840", value: 840 },
  ]);
  assert.deepEqual(charts[0].omitted, ["方案 C"]);
  assert.equal(charts[0].maxLabel, "¥1,200.50");
  assert.equal(charts[1].unit, "%");
  assert.equal(charts[3].maxValue, 0);
  assert.equal(charts[3].values.length, 2);
  assert.equal(JSON.stringify(example), before, "projection must not change stored research values");
});

test("malformed, duplicate or textual matrices do not become charts", () => {
  assert.deepEqual(projectComparisonCharts([]), []);
  assert.deepEqual(projectComparisonCharts([{ id: "d", title: "重复", columns: ["A", "A"], rows: [{ label: "成本", values: ["1", "2"] }] }]), []);
  assert.deepEqual(projectComparisonCharts([{ id: "t", title: "文字", columns: ["A", "B"], rows: [{ label: "策略", values: ["稳定", "先进"] }] }]), []);
  assert.deepEqual(projectComparisonCharts([{ id: "x", title: "多余单元格", columns: ["A", "B"], rows: [{ label: "成本", values: ["1", "2", "3"] }] }]), []);
  assert.deepEqual(projectComparisonCharts([{ id: "invalid", title: "缺字段", columns: [null, "B"], rows: [null] }]), []);
  assert.deepEqual(projectComparisonCharts([{ id: "y", title: "Year", columns: ["A", "B"], rows: [{ label: "Year", values: ["2024", "2025"] }] }]), []);
});

test("partially comparable rows keep only the unique matching-unit subset", () => {
  const mixed = [{
    id: "mixed", title: "跨区域成本", columns: ["甲", "乙", "丙", "丁"],
    rows: [
      { label: "同单位含估算", values: ["100元", "约120元", "90元", "暂无数据"] },
      { label: "两币种", values: ["$100", "¥200", "¥250", "¥300"] },
      { label: "单位缺失", values: ["20", "30", "50%", "—"] },
      { label: "平局无主单位", values: ["20元", "30元", "40%", "50%"] },
    ],
  }];
  const charts = projectComparisonCharts(mixed);
  assert.deepEqual(charts.map(item => item.metric), ["同单位含估算", "两币种"]);
  assert.deepEqual(charts[0].omitted, ["乙", "丁"]);
  assert.deepEqual(charts[0].values.map(item => item.label), ["甲", "丙"]);
  assert.equal(charts[0].unit, "元");
  assert.deepEqual(charts[1].omitted, ["甲"]);
  assert.deepEqual(charts[1].values.map(item => item.label), ["乙", "丙", "丁"]);
  assert.equal(charts[1].unit, "¥");
});

test("existing Markdown comparison tables can feed charts without a new research store", () => {
  const tables = extractMatrices({ sections: [{ id: "compare", heading: "市场指标", content:
    "| 指标 | A | B | C |\n| --- | --- | --- | --- |\n| 费用 | 300元 | 400元 |  |\n| 增幅 | 10% | 12% | n/a |\n| 描述 | 稳定 | 迅速 | 较慢 |" }] });
  assert.deepEqual(projectComparisonCharts(tables).map(v => v.metric), ["费用", "增幅"]);
});

test("rendering is accessible, output-safe and honest about omitted values", () => {
  const markup = renderCharts(example);
  assert.match(markup, /aria-label="矩阵数值比较图"/);
  assert.match(markup, /月成本/);
  assert.match(markup, /¥1,200.50/);
  assert.match(markup, /未绘制：方案 C（缺失或不可比）/);
  assert.match(markup, /查看矩阵/);
  assert.doesNotMatch(markup, /混合币种|预测区间|版本号|免费项目/);
  const hostile = [{id:"h",title:"<script>alert(1)</script>",columns:["<img src=x>","B"],rows:[{label:"数量",values:["1","2"]}]}];
  const escaped = renderCharts(hostile);
  assert.match(escaped, /&lt;script&gt;/);
  assert.match(escaped, /&lt;img src=x&gt;/);
  assert.doesNotMatch(escaped, /<script>|<img src=x>/);
});

test("large matrix collections are projected without fixed visual-series truncation", () => {
  const many = Array.from({ length: 75 }, (_, index) => ({
    id: "matrix-" + index,
    title: "矩阵 " + index,
    columns: ["A", "B"],
    rows: Array.from({ length: 12 }, (_, i) => ({
      label: "指标 " + i, values: [String(index + i), String(index + i + 1)],
    })),
  }));
  assert.equal(projectComparisonCharts(many).length, 900);
});
