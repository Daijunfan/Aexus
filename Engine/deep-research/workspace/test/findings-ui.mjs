import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { ResearchFindings } from "./workspace/ResearchFindings";
import { projectPublicKnowledge } from "./knowledge/index.mjs";
const original = "Primary research evidence independently states the user-facing criterion and its limits.";
const source = {id:"s1",title:"可核验材料",url:"https://example.org/s1",verified:true,
  acquisition:{status:"read",method:"independent-http",excerpts:[{
    excerpt:original,sha256:"a".repeat(64),finalUrl:"https://example.org/s1",
    accessedAt:1790000000000,locator:"Line 12"
  }]}
};
const findings = [
  {id:"f1",claim:"有独立原文支持的论断",sourceIds:["s1"],
   evidence:[{sourceId:"s1",excerpt:"Primary research evidence independently states",locator:"Line 12"}]},
  {id:"f2",claim:"尚无可核对原文的论断",sourceIds:["missing"],evidence:[]},
];
const summary={sources:[source],findingsDetails:findings,dimensions:[],
 graph:{nodes:[{id:"n1",kind:"search",active:true,status:"completed",label:"研究节点"}]},
 contradictions:[],deliverable:null,
 researchGaps:[{text:"证据时间跨度有多大？",origin:"search",originNodeIds:["n1"]}]};
function App() {
  const [action,setAction]=useState("");
  const [board,setBoard]=useState([]);
  return <>
    <ResearchFindings knowledge={projectPublicKnowledge(summary)} findings={findings} sources={[source]}
      contradictions={[]} selectedFindingId={null} board={board}
      onPin={item => {setBoard(items=>[...items,item]);setAction("pin:"+item.id);}}
      onDrill={q => setAction("drill:"+q)}
      onOpenNode={id => setAction("node:"+id)}
      onOpenSource={id => setAction("source:"+id)}
      renderCitations={ids => <span>{ids.join(",")}</span>}
      renderEvidence={items => <span>{items.map(item=>item.locator).join(",")}</span>}
      renderMarkdown={content => <p>{content}</p>}
    />
    <p id="action">{action}</p>
  </>;
}
createRoot(document.getElementById("root")).render(<App />);
`;
const bundle = await build({
  stdin:{contents:entry,resolveDir:root,sourcefile:"findings-ui.tsx",loader:"tsx"},
  bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  define:{"process.env.NODE_ENV":'"production"'},
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const pageErrors=[];
page.on("pageerror",error=>pageErrors.push(error.message));
try {
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.getByRole("region",{name:"研究发现"}).waitFor();
  assert.match(await page.getByLabel("原文引用可追溯情况").textContent(), /1 \/ 2 条发现/);
  assert.equal(await page.getByText("已关联可定位的原文").count(),1);
  assert.equal(await page.getByText("引用依据有待核对").count(),1);
  const gaps=page.locator(".dr-knowledge-gaps");
  await gaps.locator("summary").click();
  await gaps.getByText(/证据时间跨度有多大/).waitFor();
  await gaps.getByRole("button",{name:"查看对应任务"}).click();
  assert.equal(await page.locator("#action").textContent(),"node:n1");
  await gaps.getByRole("button",{name:"核实此线索"}).click();
  assert.match(await page.locator("#action").textContent(),/^drill:核对研究中曾记录的问题线索/);
  await page.getByRole("button",{name:/收藏到成果板/}).first().click();
  assert.equal(await page.locator("#action").textContent(),"pin:f1");
  assert.equal(await page.locator(".dr-finding-trace").count(),2);
  assert.deepEqual(pageErrors,[]);
  console.log("Workspace findings: precise citation coverage, unverified evidence, reported gaps and task/board navigation passed.");
} finally {
  await browser.close();
}
