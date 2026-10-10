import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React from "react";
import {createRoot} from "react-dom/client";
import Page from "./Page";

const proofText = "Primary materials directly support the defined relation within specified boundaries.";
const source={
  id:"s1",title:"原始技术材料",url:"https://example.org/primary",type:"web",verified:true,
  acquisition:{status:"read",method:"independent-http",excerpts:[{
    excerpt:proofText,locator:"Line 42",sha256:"a".repeat(64),
    finalUrl:"https://example.org/primary",accessedAt:1790000000000,
  }]}
};
const finding={
  id:"f1",claim:"现有原文明确记录方案与适用边界。",sourceIds:["s1"],
  evidence:[{sourceId:"s1",excerpt:"Primary materials directly support",locator:"Line 42"}],
};
const report={
  title:"知识关系接入验收研究",sections:[{
    id:"section-a",heading:"可定位论断",
    content:finding.claim+" [1](#s1)",citations:["s1"],
    evidence:[{...finding.evidence[0],claim:finding.claim}],
  }],
};
const graphNodes=[
  {id:"search-1",kind:"search",label:"获取原始资料",status:"completed",active:true,
    dependencies:[],sourceIds:["s1"]},
  {id:"synth-1",kind:"synthesize",label:"综合研究关系",status:"completed",active:true,
    dependencies:["search-1"],result:{
      entities:[
        {id:"solar",name:"Solar",type:"concept",description:"可追溯的方案",findingIds:["f1"]},
        {id:"battery",name:"Battery",type:"concept",description:"关联的结果",findingIds:["f1"]},
        {id:"unlinked",name:"未核对的推断",type:"concept",description:"不可宣称已证实"}
      ],
      relationships:[{from:"solar",to:"battery",type:"supports",findingIds:["f1"]}],
    }}
];
const summary={
 topic:"验证研究工作台的知识关系与出处导航",phase:"complete",scope:"comprehensive",
 graph:{version:1,nodes:graphNodes,edges:[{from:"search-1",to:"synth-1"}]},
 sources:[source],findingsDetails:[finding],contradictions:[],
 workers:[],tasks:[],timeline:[],planRevisions:[],dimensions:[],
 deliverable:report,progress:{mode:"determinate",percent:100,completedTasks:2,totalTasks:2,
 sources:{collected:1,max:80,verified:1,read:1,domains:1}}
};
const job={
 id:"wf_00000000-0000-0000-0000-000000000028",
 engineId:"deep-research",engineVersion:"2.0.0",revision:12,status:"completed",
 createdAt:1790000000000,updatedAt:1790000000000,summary,files:[],
};
window.knowledgePageCalls=[];
const client={
 invoke:async(command,args={})=>{
  window.knowledgePageCalls.push(command);
  if(command==="workflow.list") return {jobs:[job],hasMore:false};
  if(command==="workflow.get") return job;
  if(command==="engine.list") return [{engine:"pi",label:"Pi",configuration:{sharedPiConfig:true,hasApiKey:true}}];
  throw Error("Unexpected command "+command);
 },
 describe:async()=>({}), info:async()=>({}),
};
createRoot(document.getElementById("root")).render(<Page client={client}/>);
`;
const result=await build({
 stdin:{contents:entry,resolveDir:root,sourcefile:"knowledge-page-ui.tsx",loader:"tsx"},
 write:false,outdir:"/tmp/aexus-knowledge-page-ui",
 bundle:true,platform:"browser",format:"iife",jsx:"automatic",
 loader:{".ttf":"dataurl"},
 define:{"process.env.NODE_ENV":'"production"'},
 logLevel:"warning",
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on("pageerror",error=>errors.push(error.message));
try{
 await page.setContent('<div id="root"></div>');
 const css=result.outputFiles.find(item=>item.path.endsWith(".css"));
 if(css) await page.addStyleTag({content:css.text});
 await page.addScriptTag({content:result.outputFiles.find(item=>item.path.endsWith(".js")).text});
 await page.getByRole("region",{name:"研究记录"}).getByRole("button").first().click();
 await page.getByRole("tab",{name:"研究地图"}).click();
 const knowledgeButton=page.getByRole("button",{name:"显示或隐藏知识关系图"});
 await knowledgeButton.waitFor();
 await knowledgeButton.click();
 const map=page.getByRole("region",{name:"知识关系地图"});
 await map.waitFor();
 assert.equal(await map.locator(".dr-knowledge-entity").count(),3);
 await map.locator(".dr-knowledge-entity").filter({hasText:"Solar"}).click();
 const detail=map.getByLabel("知识关系详情");
 await detail.getByRole("button",{name:"查看发现"}).click();
 await page.getByRole("region",{name:"研究发现"}).waitFor();
 assert.equal(await page.locator("#dr-finding-f1.dr-highlight-finding").count(),1);
 await page.getByRole("tab",{name:"研究地图"}).click();
 await page.getByRole("button",{name:"显示或隐藏知识关系图"}).click();
 await page.getByRole("region",{name:"知识关系地图"}).locator(".dr-knowledge-entity").filter({hasText:"Solar"}).click();
 await page.getByLabel("知识关系详情").getByRole("button",{name:"原文 s1"}).click();
 await page.getByRole("region",{name:"研究来源"}).waitFor();
 await page.getByRole("complementary",{name:"来源详情"}).getByRole("heading",{name:"原始技术材料"}).waitFor();
 await page.getByRole("tab",{name:"研究地图"}).click();
 await page.getByRole("button",{name:"显示或隐藏知识关系图"}).click();
 await page.getByRole("region",{name:"知识关系地图"}).locator(".dr-knowledge-entity").filter({hasText:"未核对的推断"}).click();
 await page.getByText("目前没有与该项直接对应的已核验原文片段，请谨慎使用。").waitFor();
 assert.deepEqual(errors,[]);
 console.log("Real Page integration: Knowledge projection → relation graph → cited finding/source navigation, unlinked warning passed.");
}finally{await browser.close();}
