import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-overview-"));
await build({
  entryPoints: [path.resolve(import.meta.dirname, "overview.ts")],
  outfile: path.join(temp, "overview.mjs"),
  bundle: true, platform: "node", format: "esm",
});
const { projectGraphOverview, projectTopicGuides } = await import(pathToFileURL(path.join(temp, "overview.mjs")).href);

test("spatial overview partitions a deep DAG without inventing tasks or links", () => {
  const nodes = Array.from({ length: 48 }, (_, i) => ({
    id: "n" + i, label: "Actual task " + i,
    x: 20, y: 188 * i, status: i % 13 === 0 ? "running" : "completed", kind: "search",
  }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }));
  const before = JSON.stringify({ nodes, edges });
  const regions = projectGraphOverview(nodes, edges, true);
  assert.equal(regions.length, 5);
  assert.equal(regions.reduce((sum, item) => sum + item.total, 0), 48);
  assert.equal(regions.reduce((sum, item) => sum + item.incoming, 0), 4);
  assert.equal(regions.reduce((sum, item) => sum + item.outgoing, 0), 4);
  assert.equal(regions[2].startIndex, 21);
  assert.equal(regions[2].endIndex, 30);
  assert.ok(nodes.slice(20, 30).some(node => node.id === regions[2].focusId));
  assert.equal(JSON.stringify({ nodes, edges }), before);
});

test("failed and running real tasks take priority as region navigation targets", () => {
  const nodes = Array.from({ length: 30 }, (_, i) => ({
    id: "n" + i, label: "Task " + i, x: i * 246, y: 12,
    status: i === 5 ? "failed" : i === 17 ? "running" : i === 22 ? "pending" : "completed",
    kind: "verify",
  }));
  const areas = projectGraphOverview(nodes, [], false);
  assert.equal(areas.length, 3);
  assert.equal(areas[0].focusId, "n5");
  assert.equal(areas[0].failed, 1);
  assert.equal(areas[1].focusId, "n17");
  assert.equal(areas[1].running, 1);
  assert.equal(areas[2].focusId, "n22");
  assert.equal(areas[2].pending, 1);
});

test("cross-branch links appear in both origin and destination counters, including backward cycles", () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({
    id: "n" + i, label: "Task " + i, x: 12, y: i * 188, status: "pending", kind: "search",
  }));
  const edges = [
    { from: "n0", to: "n23" },
    { from: "n23", to: "n0" },
    { from: "n2", to: "n3" }, // intra-region edge remains internal
  ];
  const areas = projectGraphOverview(nodes, edges, true);
  assert.equal(areas.length, 3);
  assert.deepEqual(areas.map(area => [area.incoming, area.outgoing]), [[1, 1], [0, 0], [1, 1]]);
});

test("paused and cancelled nodes are counted without disguising them as completed or failed", () => {
  const nodes = Array.from({ length: 24 }, (_, i) => ({
    id: "s" + i, label: "Task " + i, x: 0, y: i * 188,
    status: i === 0 ? "paused" : i === 9 ? "cancelled" : i === 15 ? "stopping" : "completed",
    kind: "search",
  }));
  const areas = projectGraphOverview(nodes, [], true);
  assert.equal(areas.reduce((sum, area) => sum + area.other, 0), 3);
  assert.equal(areas.reduce((sum, area) => sum + area.failed, 0), 0);
  assert.equal(areas.reduce((sum, area) => sum + area.completed, 0), 21);
});

test("topic navigation uses only Knowledge-owned topics and current graph task identities", () => {
  const nodes = [
    {id:"a",label:"检索",x:0,y:0,status:"completed",kind:"search"},
    {id:"b",label:"证据",x:0,y:188,status:"running",kind:"verify"},
    {id:"c",label:"总结",x:0,y:376,status:"pending",kind:"write"},
  ];
  const make = (id, taskIds) => ({
    id, title:"研究方向 " + id, nodeIds:taskIds,
    status:"linked-findings", candidateSourceIds:["s1"],readSourceIds:["s1"],
    verifiedSourceIds:["s1"],findingIds:["f1","f2"],
  });
  const input = [make("solar",["a","b"]), make("stale",["removed-task"]),
    make("solar",["c"]), {...make("battery",["c"]), status:"unassessed",findingIds:[]}];
  const before = JSON.stringify({nodes,input});
  const guides = projectTopicGuides(input, nodes);
  assert.deepEqual(guides.map(guide => guide.id), ["solar","battery"]);
  assert.equal(guides[0].focusId,"b");
  assert.equal(guides[0].findings,2);
  assert.equal(guides[0].verifiedSources,1);
  assert.equal(guides[1].focusId,"c");
  assert.equal(guides[1].status,"unassessed");
  assert.equal(JSON.stringify({nodes,input}),before);
});

test("650 tasks remain represented with a bounded number of legible navigation regions", () => {
  const nodes = Array.from({ length: 650 }, (_, i) => ({
    id: "n" + i, label: "Task " + i, x: i % 3 * 240, y: Math.floor(i / 3) * 188,
    status: "completed", kind: "verify",
  }));
  const start = performance.now();
  const areas = projectGraphOverview(nodes, [], true);
  const elapsed = performance.now() - start;
  assert.ok(areas.length <= 12);
  assert.equal(areas.reduce((sum, area) => sum + area.total, 0), 650);
  assert.ok(areas.every(area => area.firstLabel && area.lastLabel && area.focusId));
  console.log("650-node overview projection", elapsed.toFixed(2), "ms");
});
