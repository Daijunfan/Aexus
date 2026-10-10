import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-view-projection-"));
await build({ entryPoints: [path.resolve(import.meta.dirname, "viewport.ts")],
  bundle: true, platform: "node", format: "esm", outfile: path.join(temp, "viewport.mjs") });
const { visibleGraph, miniProjection, toMini, fromMini, miniDots, miniViewport } =
  await import(pathToFileURL(path.join(temp, "viewport.mjs")).href);
const size = { width: 184, height: 160 };

test("only on-screen nodes, selected node and crossing dependencies require DOM", () => {
  const nodes = [
    { id: "a", x: 0, y: 0 }, { id: "b", x: 1800, y: 0 },
    { id: "c", x: 4500, y: 0 }, { id: "d", x: 1800, y: 1800 },
  ];
  const links = [
    { from: "a", to: "b" }, { from: "a", to: "c" },
    { from: "b", to: "c" }, { from: "b", to: "d" },
  ];
  const view = { width: 600, height: 400, zoom: 1, stageX: 0, stageY: 0 };
  const near = visibleGraph(nodes, links, view, size, undefined, 200);
  assert.deepEqual(near.nodes.map(node => node.id), ["a"]);
  assert.deepEqual(near.edges.map(link => link.from + "→" + link.to), ["a→b", "a→c"]);
  const far = visibleGraph(nodes, links, view, size, "c", 200);
  assert.deepEqual(far.nodes.map(node => node.id), ["a", "c"]);
  assert.equal(nodes.length, 4, "the source DAG is not changed");
  const scrolled = visibleGraph(nodes, links, { ...view, stageX: -1600 }, size, undefined, 200);
  assert.deepEqual(scrolled.nodes.map(node => node.id), ["b"]);
});

test("minimap projection is reversible; viewport framing respects stage margins", () => {
  const projection = miniProjection({ width: 5000, height: 3000 }, { width: 176, height: 102 });
  const point = { x: 2860, y: 1200 };
  const mini = toMini(point, projection), world = fromMini(mini, projection);
  assert.ok(Math.abs(world.x - point.x) < 1e-5 && Math.abs(world.y - point.y) < 1e-5);
  const frame = miniViewport({
    width: 800, height: 450, zoom: 0.8, stageX: -1400, stageY: -300,
  }, projection);
  assert.ok(frame.x >= 0 && frame.y >= 0 && frame.width > 0 && frame.height > 0);
  assert.ok(frame.x + frame.width <= projection.width);
  assert.ok(frame.y + frame.height <= projection.height);
});

test("minimap aggregates dense deep DAG marks and prioritizes urgent state", () => {
  const long = Array.from({ length: 650 }, (_, i) => ({
    id: "n" + i, x: 10, y: i * 188, status: i % 7 === 0 ? "completed" : "pending",
  }));
  long[4].status = "failed";
  const projection = miniProjection({ width: 254, height: 122224 }, { width: 176, height: 102 });
  const dots = miniDots(long, projection, size);
  assert.ok(dots.length < 30, "overlapping 650 marks are aggregated to a readable map");
  assert.equal(dots.reduce((sum, dot) => sum + dot.count, 0), long.length);
  assert.ok(dots.some(dot => dot.status === "failed"), "important errors remain visible");
});

test("large viewport projection stays bounded across many updates", () => {
  const nodes = Array.from({ length: 512 }, (_, i) => ({
    id: "n" + i, x: 24, y: 188 * i, status: i < 200 ? "completed" : "pending",
  }));
  const edges = nodes.slice(1).map((node, i) => ({ from: nodes[i].id, to: node.id }));
  const start = performance.now();
  let included = 0;
  for (let i = 0; i < 500; i++) {
    const drawn = visibleGraph(nodes, edges, {
      width: 1100, height: 620, stageX: 0, stageY: -(i * 9), zoom: 0.65,
    }, size, "n0");
    included += drawn.nodes.length;
    assert.ok(drawn.nodes.length < 35, "only a small neighborhood mounts");
  }
  const elapsed = performance.now() - start;
  assert.ok(Number.isFinite(elapsed) && included > 0);
  console.log("512-node viewport projection: 500 iterations in", elapsed.toFixed(1), "ms");
});
