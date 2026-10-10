import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-experience-"));
const code = path.resolve(import.meta.dirname, "..");
await build({
  stdin: {
    contents: "export * from './ResearchInsights.ts'; export * from './ResearchBrief.ts'; export {layoutGraph} from './ui.ts';",
    resolveDir: code, sourcefile: "studio-check.ts", loader: "ts",
  },
  bundle: true, platform: "node", format: "esm",
  outfile: path.join(temp, "experience.mjs"),
});
const { focusAreas, layoutGraph, extractMatrices, extractTopicTimeline, compareFindings, visualBrief } =
  await import(pathToFileURL(path.join(temp, "experience.mjs")).href);

test("branches are based on real plan dependencies, and unresolved tasks are visible", () => {
  const nodes = [
    { id: "root", label: "总体规划", kind: "plan", status: "completed" },
    { id: "a", label: "成本研究", kind: "search", status: "completed", dependencies: ["root"], resultSummary: "总成本受到规模影响" },
    { id: "b", label: "风险调查", kind: "search", status: "running", dependencies: ["root"] },
    { id: "c", label: "价格验证", kind: "verify", status: "pending", dependencies: ["a"] },
    { id: "d", label: "历史版本", kind: "verify", status: "superseded", dependencies: ["a"] },
  ];
  const list = focusAreas(nodes);
  assert.equal(list.length, 2);
  const cost = list.find(a => a.id === "a");
  assert.deepEqual(cost.nodeIds, ["a", "c"]);
  assert.equal(cost.total, 2);
  assert.equal(cost.completed, 1);
  assert.equal(cost.pending, 1);
  assert.equal(cost.insight, "总成本受到规模影响");
});

test("large DAG branch accounting and layout remain complete and finite", () => {
  const nodes = Array.from({ length: 650 }, (_, index) => ({
    id: "n" + index, label: "分支 " + index, status: index < 200 ? "completed" : "pending",
    kind: index % 5 === 0 ? "search" : "verify",
    dependencies: index > 0 ? ["n" + (index - 1)] : [],
  }));
  const branches = focusAreas(nodes);
  const graph = layoutGraph(nodes);
  assert.equal(branches[0].total, 650, "coverage must not silently cap at 400 tasks");
  assert.ok(branches.length > 12, "users must be able to reveal all research branches");
  assert.equal(graph.nodes.length, 650);
  assert.equal(graph.edges.length, 649);
  assert.ok(Number.isFinite(graph.width) && Number.isFinite(graph.height));
  assert.deepEqual(layoutGraph([]), {nodes: [], edges: [], width: 212, height: 212, vertical: false});
});

test("comparison matrices preserve actual markdown cells and do not invent missing data", () => {
  const report = { sections: [
    { id: "comp", heading: "两种工具", content:
      "| 维度 | 方案 A | 方案 B |\n| :-- | ---: | :--- |\n| 成本 | ¥100 | |\n| 风险 | 低 | 高 |\n" },
  ] };
  const tables = extractMatrices(report);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].columns, ["方案 A", "方案 B"]);
  assert.deepEqual(tables[0].rows[0], { label: "成本", values: ["¥100", ""] });
  assert.equal(extractMatrices({sections:[{id:"x",heading:"x",content:"无对比表格"}]}).length, 0);
});

test("topic timeline only uses dated claims and distinguishes them from execution timestamps", () => {
  const report = { sections: [
    {id:"events",heading:"发展", content:"2021年启动首轮试点。随后扩大范围。\n2024-05-02 发布了新规范。"}
  ] };
  const values = extractTopicTimeline(report, [{ id: "f1", claim: "2022 年的另一次研究", sourceIds: [] }]);
  assert.ok(values.some(v => v.date === "2021"));
  assert.ok(values.some(v => v.date === "2024-05-02"));
  assert.ok(values.every(v => !v.text.includes("undefined")));
  assert.equal(extractTopicTimeline({sections:[{id:"x",heading:"x",content:"发生了变化，但没有记录日期"}]}).length, 0);
});

test("research follow-up compares real extracted claims including retained and removed", () => {
  const previous = [
    {id:"f1",claim:"同一结论"},
    {id:"f2",claim:"旧版本内容"},
    {id:"f3",claim:"不再出现的结论"},
  ];
  const next = [
    {id:"new-id",claim:"同一结论"},
    {id:"f2",claim:"新版本内容"},
    {id:"f4",claim:"新增结论"},
  ];
  const output = compareFindings(previous, next);
  assert.equal(output.retained, 1);
  assert.deepEqual(output.changes.map(item => item.kind), ["changed", "added", "removed"]);
  assert.equal(output.changes[0].previous, "旧版本内容");
});

test("standalone brief has visualizations and escapes untrusted user/data content", () => {
  const input = {
    topic: '竞品 <img src=x onerror=alert(1)>',
    report: {
      title: "竞品比较",
      abstract: "洞察关键差异",
      sections: [
        {id:"comp",heading:"价格比较",content:"| 类别 | A | B |\n| --- | --- | --- |\n| 成本 | 低 | 高 |"},
        {id:"dated",heading:"历史事件",content:"2020年出现新方案"}
      ],
    },
    nodes:[{id:"n1",kind:"search",label:"检查数据",status:"completed",resultSummary:"真实发现 <script>alert(1)</script>",sourceIds:["s1"]}],
    findings:[{id:"f1",claim:"具备条件",sourceIds:[]}],
    sources:[{id:"s1",title:"原文",url:"javascript:alert(1)",verified:false}],
    board:[{type:"node",id:"n1",note:"备注 <iframe>evil</iframe>"}],
    customMatrix: null,
  };
  const html = visualBrief(input);
  assert.match(html, /研究范围/);
  assert.match(html, /价格比较/);
  assert.match(html, /时间与演变/);
  assert.match(html, /备注 &lt;iframe&gt;evil&lt;\/iframe&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /@media print/);
});
