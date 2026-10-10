import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "../..");
const entry = `
import React, {useState} from "react";
import {createRoot} from "react-dom/client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {SourcePanel} from "./retrieval/SourcePanel";
import {citationLocator} from "./workspace/citationLocator";

const excerptA="Research approach follows a predefined review process for source claims.";
const excerptB="Research results include a final evidence review of primary materials.";
const source={id:"s",title:"Study file",url:"https://example.org/source",verified:true,
 acquisition:{status:"read",method:"independent-http",excerpts:[
  {excerpt:excerptA,locator:"Line 17",sha256:"a".repeat(64),accessedAt:1790000000000,finalUrl:"https://example.org/source"},
  {excerpt:excerptB,locator:"Line 47",sha256:"a".repeat(64),accessedAt:1790000000000,finalUrl:"https://example.org/source"},
 ]}};
const findings=[
 {id:"a",claim:"Research method uses a review process across multiple sources.",sourceIds:["s"],
  evidence:[{sourceId:"s",excerpt:excerptA,locator:"Line 17"}]},
 {id:"b",claim:"Research results are reviewed against original primary materials.",sourceIds:["s"],
  evidence:[{sourceId:"s",excerpt:excerptB,locator:"Line 47"}]},
];
const content=findings.map((f,i)=>f.claim+"\\n\\nThe report still needs real-world validation. ["+(i+1)+"](#s)").join("\\n\\n");
function App(){
 const [selection,setSelection]=useState(null);
 const [clicked,setClicked]=useState("");
 return <div className="dr-app">
  <div className="dr-markdown">
   <Markdown remarkPlugins={[remarkGfm]} components={{a:({href,children,node})=>(
    <button onClick={()=>{
      const offset=node?.position?.start?.offset;
      const loc=citationLocator(content,offset,"s",findings);
      setClicked(String(children)+":"+(loc??"unlocated"));
      setSelection({id:"s",locator:loc});
    }}>{children}</button>
   )}}>{content}</Markdown>
  </div>
  <p id="clicked">{clicked}</p>
  <SourcePanel sources={[source]} findings={findings}
    selection={selection} onSelect={setSelection} onReturn={()=>{}}
    renderEvidence={items=><div>{items.map(item=><span key={item.locator}>{item.locator}</span>)}</div>}
  />
 </div>;
}
createRoot(document.getElementById("root")).render(<App/>);
`;
const out = await build({
 stdin:{contents:entry,resolveDir:root,sourcefile:"citation-browser.tsx",loader:"tsx"},
 bundle:true,write:false,outdir:"/tmp/aexus-workspace-citation-test",platform:"browser",format:"iife",jsx:"automatic",
 define:{"process.env.NODE_ENV":'"production"'},
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const page=await browser.newPage({viewport:{width:1400,height:900}});
const errors=[];
page.on("pageerror",e=>errors.push(e.message));
try {
 await page.setContent('<div id="root"></div>');
 await page.addScriptTag({content:out.outputFiles.find(f=>f.path.endsWith(".js")).text});
 await page.locator(".dr-markdown button").last().click();
 await page.waitForFunction(() => document.querySelector("#clicked")?.textContent === "2:Line 47");
 assert.equal(await page.locator(".dr-linked-claim").count(),1);
 assert.match(await page.locator(".dr-linked-claim").textContent(),/Line 47/);
 assert.ok(await page.locator(".dr-acquisition-metadata").evaluate(el=>!el.open));
 assert.equal(await page.locator(".dr-source-detail").getByText("Line 47",{exact:true}).count()>=2,true);
 assert.deepEqual(errors,[]);
 console.log("Workspace citation browser: linked report number locates exact independent source claim, keeps metadata collapsed.");
} finally {
 await browser.close();
}
