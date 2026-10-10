import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const entry=`
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {ResearchExecutionControls} from "./workspace/ResearchExecutionControls";
function App(){
 const [status,setStatus]=useState("waiting");
 const [pending,setPending]=useState(false);
 const [revisionOpen,setRevisionOpen]=useState(false);
 const [instructions,setInstructions]=useState("");
 const [action,setAction]=useState("");
 const summary={
   phase:"planning",graph:{version:3},plan:{strategy:"逐步调查真实证据"},
   managerReviews:[{planVersion:3,stage:"plan",managerId:"manager",
     verdict:"revise",summary:"建议核验更多独立资料",
     issues:[{description:"来源不足",suggestion:"核验原文"}]}],
   attention:{employeeId:"employee",message:"需要授权"},
   tasks:[{status:"approval"}],
 };
 const job={
   id:"job",engineId:"deep-research",engineVersion:"2.0.0",revision:1,
   createdAt:1,updatedAt:1,files:[],status,controlPending:pending,summary,
   error:pending?"任务仍在清理":""
 };
 window.fixture={setStatus,setPending};
 return <>
   <ResearchExecutionControls job={job} summary={summary}
     workers={[{id:"manager",label:"证据质量负责人"}]}
     busy={false} revisionOpen={revisionOpen} instructions={instructions}
     approval={status==="waiting"?["确认研究计划","approve-plan","开始执行"]:null}
     onRetryPause={()=>setAction("retry-pause")}
     onRetryStop={()=>setAction("retry-stop")}
     onOpenAttention={()=>setAction("view-conversation")}
     onRevise={()=>setAction("revise:"+instructions)}
     onInstructions={setInstructions}
     onCancelRevision={()=>setRevisionOpen(false)}
     onShowRevision={()=>setRevisionOpen(true)}
     onAnswer={action=>setAction("answer:"+action)}
   />
   <p id="action">{action}</p>
 </>;
}
createRoot(document.getElementById("root")).render(<App/>);
`;
const out=await build({
 stdin:{contents:entry,resolveDir:root,sourcefile:"execution-ui.tsx",loader:"tsx"},
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
 const approval=page.getByRole("region",{name:"确认研究计划"});
 await approval.waitFor();
 assert.equal(await approval.getByText("建议核验更多独立资料").isVisible(),false);
 await approval.locator(".dr-manager-review summary").click();
 await approval.getByText("建议核验更多独立资料").waitFor();
 await approval.getByRole("button",{name:"开始执行"}).click();
 assert.equal(await page.locator("#action").textContent(),"answer:approve-plan");
 await page.getByRole("button",{name:"查看研究会话"}).click();
 assert.equal(await page.locator("#action").textContent(),"view-conversation");
 await approval.getByRole("button",{name:"提出调整"}).click();
 await page.getByLabel("调整研究方向").fill("补查证据并解释时间边界");
 await page.getByRole("button",{name:"重新规划"}).click();
 assert.equal(await page.locator("#action").textContent(),"revise:补查证据并解释时间边界");
 await page.evaluate(()=>{window.fixture.setStatus("paused");window.fixture.setPending(true);});
 await page.getByRole("button",{name:"重试暂停"}).click();
 assert.equal(await page.locator("#action").textContent(),"retry-pause");
 await page.evaluate(()=>window.fixture.setStatus("cancelled"));
 await page.getByRole("button",{name:"重试停止"}).click();
 assert.equal(await page.locator("#action").textContent(),"retry-stop");
 assert.deepEqual(errors,[]);
 console.log("Workspace execution: manager review, plan approval, revision, pending pause/stop retries passed.");
}finally{await browser.close();}
