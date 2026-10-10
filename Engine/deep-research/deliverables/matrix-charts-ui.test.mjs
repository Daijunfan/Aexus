import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const moduleDir = import.meta.dirname;

test("comparison charts render responsively with working drillback and progressive disclosure", async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-charts-ui-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { ComparisonCharts } from "./ComparisonCharts.tsx";
        const matrices = [{
          id: "one", title: "财务与效率" + "UnbrokenTitle".repeat(14), columns: ["方案甲", "方案乙", "方案丙"],
          rows: [
            { label: "费用", values: ["100元", "200元", "未提供"] },
            { label: "效率", values: ["20%", "50%", "60%"] },
            { label: "能耗", values: ["1.5 kWh", "2.5 kWh", "3.5 kWh"] },
            { label: "重量", values: ["10kg", "20kg", "30kg"] },
            { label: "容量", values: ["12.00000000000000000000000000000000000000000GB", "25GB", "30GB"] },
            { label: "人数", values: ["1人", "2人", "3人"] },
          ],
        }];
        const root = createRoot(document.getElementById("root"));
        window.__drawMatrices = (items) => root.render(
          React.createElement(ComparisonCharts, {
            matrices: items,
            onSelectMatrix: id => { window.__matrixSelected = id; }
          })
        );
        window.__drawMatrices(matrices);
      `,
      resolveDir: moduleDir,
      sourcefile: "visual-test.tsx",
      loader: "tsx",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    outfile: path.join(temp, "app.js"),
  });
  const [script, css] = await Promise.all([
    fs.readFile(path.join(temp, "app.js"), "utf8"),
    fs.readFile(path.join(temp, "app.css"), "utf8"),
  ]);
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    t.skip("Chrome is unavailable for browser layout verification: " + error.message);
    return;
  }
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="dr-app"><div id="root"></div></body></html>');
  await page.addStyleTag({ content: ".dr-app{font:13px/1.55 system-ui,sans-serif;--dr-text:#222;--dr-muted:#666;--dr-border:#dde3e2;--dr-bg:#fff;--dr-surface:#f4f7f6;--dr-green:#19745c}*{box-sizing:border-box}body{margin:0;padding:24px}" + css });
  await page.addScriptTag({ content: script });

  await page.getByRole("region", { name: "矩阵数值比较图" }).waitFor();
  assert.equal(await page.locator("figure").count(), 4);
  const widths = [1280, 390, 320];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, "unexpected horizontal overflow at " + width + "px: " + overflow);
  }
  await page.getByRole("button", { name: "继续显示 2 张（剩余 2）" }).click();
  assert.equal(await page.locator("figure").count(), 6);
  await page.getByRole("button", { name: "收起图表" }).click();
  assert.equal(await page.locator("figure").count(), 4);
  await page.getByRole("button", { name: "查看矩阵 ↗" }).first().click();
  assert.equal(await page.evaluate(() => window.__matrixSelected), "one");
  assert.match(await page.locator("figure").first().innerText(), /未绘制：方案丙（缺失或不可比）/);

  // Actual user download, not just checking the file generator in isolation.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /导出全部图表与矩阵/ }).click(),
  ]);
  assert.equal(download.suggestedFilename(), "aexus-comparison-charts.html");
  const exported = await fs.readFile(await download.path(), "utf8");
  assert.equal((exported.match(/<figure class="comparison-card">/g) ?? []).length, 6);
  assert.match(exported, /原始比较矩阵/);
  assert.match(exported, /未绘制：方案丙（缺失或不可比）/);
  assert.match(exported, /<td>未提供<\/td>/);
  assert.match(exported, /12\.00000000000000000000000000000000000000000GB/);
  assert.doesNotMatch(exported, /<script|<iframe|<link/);

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /导出矩阵原值（CSV）/ }).click(),
  ]);
  assert.equal(csvDownload.suggestedFilename(), "aexus-comparison-matrices.csv");
  const csvData = await fs.readFile(await csvDownload.path(), "utf8");
  assert.ok(csvData.startsWith("\uFEFF\"矩阵ID\",\"矩阵名称\""));
  assert.match(csvData, /"one","财务与效率UnbrokenTitle/);
  assert.match(csvData, /"费用","方案丙","未提供"/);
  assert.match(csvData, /"容量","方案甲","12\.00000000000000000000000000000000000000000GB"/);

  const standalone = await browser.newPage({ viewport: { width: 320, height: 800 } });
  await standalone.route("**/*", route => route.abort());
  await standalone.setContent(exported);
  assert.equal(await standalone.locator("figure.comparison-card").count(), 6);
  assert.equal(await standalone.locator("table").count(), 1);
  for (const width of [320, 390, 1280]) {
    await standalone.setViewportSize({ width, height: 800 });
    const extra = await standalone.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    assert.ok(extra <= 1, "offline export overflows at " + width + "px by " + extra);
  }
  await standalone.emulateMedia({ media: "print" });
  await standalone.setViewportSize({ width: 794, height: 1123 });
  const printOverflow = await standalone.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(printOverflow <= 1, "print layout overflow: " + printOverflow);
  await standalone.close();

  // A research with many numeric rows must mount visual cards incrementally.
  await page.evaluate(() => {
    const more = Array.from({ length: 80 }, (_, i) => ({
      label: "指标 " + (i + 1), values: [String(i + 1), String(i + 2)],
    }));
    window.__drawMatrices([{ id: "massive", title: "大型研究", columns: ["A", "B"], rows: more }]);
  });
  await page.getByRole("heading", { name: /80 张图表/ }).waitFor();
  assert.equal(await page.locator("figure").count(), 4);
  await page.getByRole("button", { name: "继续显示 12 张（剩余 76）" }).click();
  assert.equal(await page.locator("figure").count(), 16);
  await page.getByRole("button", { name: "继续显示 12 张（剩余 64）" }).click();
  assert.equal(await page.locator("figure").count(), 28);
  await page.getByRole("button", { name: "收起图表" }).click();
  assert.equal(await page.locator("figure").count(), 4);
  const search = page.getByRole("searchbox", { name: "搜索图表" });
  await search.fill("指标 79");
  assert.equal(await page.locator("figure").count(), 1);
  assert.match(await page.getByRole("status").innerText(), /1 \/ 80/);
  const [filteredDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /导出全部图表与矩阵/ }).click(),
  ]);
  const fullExport = await fs.readFile(await filteredDownload.path(), "utf8");
  assert.equal((fullExport.match(/<figure class="comparison-card">/g) ?? []).length, 80);
  await search.fill("不存在的指标");
  assert.equal(await page.locator("figure").count(), 0);
  assert.match(await page.locator(".dr-comparison-charts__empty").innerText(), /没有符合条件/);
  await search.clear();
  assert.equal(await page.locator("figure").count(), 4);

  // A text-only report still exposes CSV export and does not hallucinate charts.
  await page.evaluate(() => {
    window.__drawMatrices([{ id: "text", title: "非数值方案",
      columns: ["方案A", "方案B"],
      rows: [{ label: "特点", values: ["稳定", "灵活"] }] }]);
  });
  await page.getByRole("heading", { name: /^数据对比\s*· 0 张图表$/ }).waitFor();
  assert.equal(await page.locator("figure").count(), 0);
  assert.match(await page.locator(".dr-comparison-charts__empty").innerText(), /仍可导出/);
  assert.equal(await page.getByRole("button", { name: /导出全部图表与矩阵/ }).count(), 0);
  const [textCsvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /导出矩阵原值（CSV）/ }).click(),
  ]);
  const textCsv = await fs.readFile(await textCsvDownload.path(), "utf8");
  assert.match(textCsv, /"非数值方案","特点","方案A","稳定"/);
  assert.match(textCsv, /"非数值方案","特点","方案B","灵活"/);
});
