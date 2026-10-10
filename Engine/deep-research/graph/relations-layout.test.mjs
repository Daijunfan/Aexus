import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-knowledge-layout-"));
await build({entryPoints:[path.resolve(import.meta.dirname,"relations-layout.ts")],
  bundle:true,format:"esm",platform:"node",outfile:path.join(temp,"layout.mjs")});
const {layoutKnowledgeRelations, relationshipPath} =
  await import(pathToFileURL(path.join(temp,"layout.mjs")).href);
const entity = (id) => ({
  id, name:id, type:"Concept", description:"", evidenceStatus:"unlinked",
  originNodeIds:["synthesis"], findingIds:[],
});
const relation = (id, from, to) => ({
  id, from, to, type:"related-to", evidenceStatus:"unlinked",
  originNodeIds:["synthesis"], findingIds:[],
});

test("cyclic, disconnected and self-linked knowledge graphs remain complete", () => {
  const source = [entity("a"),entity("b"),entity("c"),entity("isolated")];
  const links = [relation("ab","a","b"),relation("bc","b","c"),
    relation("ca","c","a"),relation("aa","a","a")];
  const before = JSON.stringify({source, links});
  const layout = layoutKnowledgeRelations(source,links);
  assert.equal(layout.nodes.length,4);
  assert.equal(layout.edges.length,4);
  assert.equal(layout.groups.length,2);
  assert.ok(layout.groups[1].label.includes("尚无已知关系"));
  const coordinates = new Set(layout.nodes.map(node => node.x+":"+node.y));
  assert.equal(coordinates.size,4);
  assert.ok(layout.edges.every(edge => edge.path.startsWith("M") && !edge.path.includes("NaN")));
  assert.equal(JSON.stringify({source, links}),before,"presentation cannot alter domain relations");
});

test("missing or conflicting endpoints cannot be fabricated on the canvas", () => {
  const layout = layoutKnowledgeRelations(
    [entity("x"), entity("y")], [relation("fake","x","not-here"),relation("real","y","x")]);
  assert.deepEqual(layout.edges.map(edge => edge.id),["real"]);
});

test("self links, opposite links and long distances have stable finite curves", () => {
  const points = [{x:25,y:35},{x:390,y:35},{x:390,y:800}];
  const paths = [
    relationshipPath(points[0],points[0]),
    relationshipPath(points[0],points[1]),
    relationshipPath(points[1],points[0],22),
    relationshipPath(points[0],points[2],-18),
  ];
  assert.ok(paths.every(edge => edge.path.startsWith("M") && !/NaN|Infinity/.test(edge.path)));
  assert.notEqual(paths[1].path,paths[2].path);
});

test("layout remains bounded for 300-entity cyclic clusters", () => {
  const nodes = Array.from({length:300},(_,i)=>entity("e"+i));
  const links = nodes.map((node,i)=>relation("r"+i,node.id,nodes[(i+1)%nodes.length].id));
  const start = performance.now();
  const graph = layoutKnowledgeRelations(nodes,links);
  console.log("300-entity relation layout:",(performance.now()-start).toFixed(2),"ms");
  assert.equal(graph.nodes.length,300);
  assert.equal(graph.edges.length,300);
  assert.ok(graph.width>100 && graph.height>100 && graph.height<15000);
});
