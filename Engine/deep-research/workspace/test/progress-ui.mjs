import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const entry=`
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {ResearchJobHeader} from "./workspace/ResearchJobHeader";
import {ResearchProgressBand} from "./workspace/ResearchProgressBand";
const base={
 id:"j",engineId:"deep-research",engineVersion:"2.0.0",createdAt:1,updatedAt:1790000000000,
 revision:1,files:[],summary:{topic:"进度展示验收",phase:"scouting",progress:{mode:"indeterminate"}}
};
function App(){
 const [status,setStatus]=useState("running");
 const [phase,setPhase]=useState("scouting");
 const [tab,setTab]=useState("graph");
 const [percent,setPercent]=useState(null);
 const [last,setLast]=useState("");
 const job={...base,status,summary:{...base.summary,phase,progress:{
   mode:percent===null?"indeterminate":"determinate",percent,failed:0,
 }}};
 return <>
  <ResearchJobHeader job={job} summary={job.summary} busy={false}
   onHome={()=>setLast("home")} onParent={()=>setLast("parent")}
   onFollowUp={()=>setLast("followup")} onToggleRevision={()=>setLast("revise")}
   onPause={()=>setStatus("paused")} onResume={()=>setStatus("running")}
   onStop={()=>setStatus("cancelled")}/>
  <ResearchProgressBand job={job} summary={job.summary} tab={tab}
   progress={job.summary.progress} percent={percent} revisions={[]}
   completedTasks={percent===null?0:2} totalTasks={4} sourceCount={3}
   readCount={1} verifiedCount={1} domains={1} workers={[]}
   findingCount={2} nodes={[]} runningNodes={[]} activities={[]}
   onNode={id=>setLast("node:"+id)}/>
  <button id="progress-ready" onClick={()=>{setPhase("research");setPercent(50)}}>确定进度</button>
  <button id="complete" onClick={()=>{setStatus("completed");setPhase("complete");setPercent(100)}}>完成</button>
  <button id="report" onClick={()=>setTab("report")}>报告视图</button>
  <p id="current">{status}:{percent}</p>
  <p id="last">{last}</p>
 </>;
}
createRoot(document.getElementById("root")).render(<App/>);
`;
const out=await build({
 stdin:{contents:entry,resolveDir:root,sourcefile:"progress-ui.tsx",loader:"tsx"},
 bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
 define:{"process.env.NODE_ENV":'"production"'},
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
try{
 await page.setContent('<div id="root"></div>');
 await page.addScriptTag({content:out.outputFiles[0].text});
 const bar=page.getByRole("progressbar",{name:"当前计划进度"});
 assert.equal(await bar.getAttribute("aria-valuenow"),null);
 assert.equal(await page.getByText("进度尚未确定").count(),1);
 assert.equal(await page.getByRole("button",{name:"暂停研究"}).count(),1);
 await page.getByRole("button",{name:"暂停研究"}).click();
 await page.getByRole("button",{name:"恢复研究"}).click();
 await page.getByRole("button",{name:"调整研究方向"}).click();
 assert.equal(await page.locator("#last").textContent(),"revise");
 await page.locator("#progress-ready").click();
 assert.equal(await bar.getAttribute("aria-valuenow"),"50");
 assert.equal(await bar.getAttribute("aria-valuetext"),"当前计划完成 2 / 4 项任务");
 await page.locator("#complete").click();
 await page.getByRole("button",{name:"继续研究"}).click();
 assert.equal(await page.locator("#last").textContent(),"followup");
 await page.locator("#report").click();
 assert.equal(await bar.count(),0);
 assert.deepEqual(errors,[]);
 console.log("Workspace chrome: indeterminate/determinate progress, pause/resume/revise, completion actions and report declutter passed.");
}finally{await browser.close();}
