import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-camera-"));
await build({
  entryPoints: [path.resolve(import.meta.dirname, "camera.ts")],
  bundle: true, platform: "node", format: "esm",
  outfile: path.join(temp, "camera.mjs"),
});
const { anchoredScroll, clampZoom, focusZoom, nearestNode, nextDirectionalNode } =
  await import(pathToFileURL(path.join(temp, "camera.mjs")).href);

const card = { width: 184, height: 160 };
const grid = [
  { id: "root", x: 0, y: 0 }, { id: "right", x: 246, y: 0 },
  { id: "down", x: 0, y: 188 }, { id: "diagonal", x: 246, y: 188 },
];
const edges = [{ from: "root", to: "right" }, { from: "root", to: "down" }];

test("zoom boundaries and missing selection remain finite", () => {
  assert.equal(clampZoom(100), 1.5);
  assert.equal(clampZoom(-100), 0.05);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(focusZoom([], [], "gone", { width: 800, height: 500 }, card), 1);
});

test("focus reads the requested node neighborhood, not the previous selection", () => {
  const nodes = [
    { id: "far", x: 0, y: 0 },
    { id: "a", x: 1500, y: 0 }, { id: "b", x: 1746, y: 0 },
  ];
  const links = [{ from: "a", to: "b" }];
  assert.equal(focusZoom(nodes, links, "far", { width: 900, height: 600 }, card), 1);
  assert.equal(focusZoom(nodes, links, "a", { width: 900, height: 600 }, card), 1);
  assert.equal(focusZoom(nodes, links, "b", { width: 300, height: 220 }, card), 0.85);
});

test("direction keys move to the nearest relevant neighbor", () => {
  assert.equal(nextDirectionalNode(grid, "root", "ArrowRight")?.id, "right");
  assert.equal(nextDirectionalNode(grid, "root", "ArrowDown")?.id, "down");
  assert.equal(nextDirectionalNode(grid, "diagonal", "ArrowLeft")?.id, "down");
  assert.equal(nextDirectionalNode(grid, "root", "ArrowUp"), undefined);
  assert.equal(nextDirectionalNode(grid, "missing", "ArrowDown"), undefined);
});

test("camera tracks its nearest visible node and preserves target screen position", () => {
  assert.equal(nearestNode(grid, { x: 341, y: 248 }, card)?.id, "diagonal");
  assert.deepEqual(anchoredScroll(
    { left: 100, top: 40 }, { x: 310, y: 150 }, { x: 150, y: 70 },
  ), { left: 260, top: 120 });
  assert.deepEqual(anchoredScroll(
    { left: 0, top: 0 }, { x: 0, y: 0 }, { x: 30, y: 30 },
  ), { left: 0, top: 0 });
  assert.equal(edges.length, 2);
});

test("camera helpers never mutate backend DAG geometry", () => {
  const before = JSON.stringify(grid);
  focusZoom(grid, edges, "root", { width: 900, height: 600 }, card);
  nearestNode(grid, { x: 123, y: 78 }, card);
  nextDirectionalNode(grid, "root", "ArrowRight");
  assert.equal(JSON.stringify(grid), before);
});
