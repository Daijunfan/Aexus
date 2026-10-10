import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root=path.resolve(import.meta.dirname,"../..");
const entry=`
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {useResearchStudio} from "./workspace/useResearchStudio";
function App(){
  const [jobId,setJobId]=useState("one");
  const [visible,setVisible]=useState(true);
  const studio=useResearchStudio(jobId);
  window.fixture={
    setJob:setJobId,
    close(){setVisible(false)},
    reopen(){setVisible(true)},
  };
  return <div>
    <p id="current">{jobId}</p>
    <p id="pins">{studio.board.map(item=>item.id).join(",")}</p>
    <p id="matrix">{studio.customMatrix?.rows[0]?.values[0]??""}</p>
    <button id="pin" onClick={()=>studio.pinItem({type:"finding",id:"finding-"+jobId,note:"important"})}>pin</button>
    <button id="matrix-edit" onClick={()=>studio.updateMatrix({
      id:"custom",title:"我的比较矩阵",columns:["A","B"],rows:[{label:"成本",values:["123","未知"]}]
    })}>matrix</button>
    <button id="job-next" onClick={()=>setJobId(jobId==="one"?"two":"one")}>switch</button>
  </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
`;
const out=await build({
 stdin:{contents:entry,resolveDir:root,sourcefile:"studio-ui.tsx",loader:"tsx"},
 write:false,bundle:true,platform:"browser",format:"iife",jsx:"automatic",
 define:{"process.env.NODE_ENV":'"production"'},
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage();
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
try{
 await page.route("http://127.0.0.1:8765/",route=>route.fulfill({
  status:200,contentType:"text/html",body:"<!doctype html><div id='root'></div>"
 }));
 await page.goto("http://127.0.0.1:8765/");
 await page.addScriptTag({content:out.outputFiles[0].text});
 await page.locator("#pin").click();
 await page.waitForFunction(()=>document.querySelector("#pins")?.textContent==="finding-one");
 await page.locator("#matrix-edit").click();
 assert.equal(await page.locator("#matrix").textContent(),"123");
 await page.locator("#job-next").click();
 await page.waitForFunction(()=>document.querySelector("#current")?.textContent==="two");
 await page.waitForFunction(()=>document.querySelector("#pins")?.textContent==="");
 await page.locator("#pin").click();
 await page.waitForFunction(()=>document.querySelector("#pins")?.textContent==="finding-two");
 await page.locator("#job-next").click();
 await page.waitForFunction(()=>document.querySelector("#pins")?.textContent==="finding-one");
 assert.equal(await page.locator("#matrix").textContent(),"123");
 await page.reload({waitUntil:"domcontentloaded"});
 await page.addScriptTag({content:out.outputFiles[0].text});
 await page.waitForFunction(()=>document.querySelector("#pins")?.textContent==="finding-one");
 assert.equal(await page.locator("#matrix").textContent(),"123");
 assert.deepEqual(errors,[]);
 console.log("Workspace studio: bookmark and editable matrix persist per workflow without leaking across studies.");
}finally{await browser.close();}
