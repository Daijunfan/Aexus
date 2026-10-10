import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test("knowledge relationships show cycles, source links and guarded evidence without displacing the DAG", async () => {
  const root = path.resolve(import.meta.dirname);
  const artifacts = path.resolve(root, "../../../.aexus/artifacts/deep-research-graph");
  await fs.mkdir(artifacts, { recursive: true });
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aexus-relations-ui-"));
  await build({
    stdin: {
      contents: `
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { ResearchGraph } from './ResearchGraph';
        import { projectPublicKnowledge } from '../knowledge/index.mjs';
        import '../style.css';
        const summary = {
          sources: [{
            id:'s1',verified:true, acquisition:{
              status:'read',method:'independent-http',
              excerpts:[{excerpt:'Primary research finds storage improves flexibility.',
                sha256:'a'.repeat(64), finalUrl:'https://example.org/primary',
                locator:'Page 3', accessedAt:1790000000000}]
            }
          }],
          findingsDetails:[{
            id:'f1', claim:'储能可以改善电力系统灵活性',
            sourceIds:['s1'], evidence:[{sourceId:'s1', excerpt:'storage improves flexibility'}]
          }],
          graph:{ nodes:[{
            id:'task1',kind:'synthesize',status:'completed',
            result:{
              entities:[
                {id:'a',name:'Solar',type:'technology',findingIds:['f1'],description:'PV supply'},
                {id:'b',name:'Battery',type:'technology',findingIds:['f1'],description:'Storage capacity'},
                {id:'c',name:'Grid',type:'system',description:'Electric grid'},
                {id:'d',name:'Unrelated',type:'concept',description:'No asserted relations'}
              ],
              relationships:[
                {from:'a',to:'b',type:'supports',findingIds:['f1']},
                {from:'b',to:'c',type:'connects-to'},
                {from:'c',to:'a',type:'requires'}
              ]
            }
          }]}
        };
        const knowledge=projectPublicKnowledge(summary);
        function App() {
          const [selected,setSelected]=useState('task1');
          window.opened=[];
          return <div className="dr-app" style={{display:'flex',height:'650px',width:'100%',minHeight:0}}>
            <section className="dr-map-section" style={{flex:1,minWidth:0}}>
              <ResearchGraph nodes={summary.graph.nodes.map(node=>({...node,label:'综合任务'}))}
                selectedId={selected} onSelect={setSelected} workers={[]} workflow={{status:'completed'}}
                direction="horizontal" onDirection={()=>{}} inspectorOpen={false}
                onToggleInspector={()=>{}} discovery={null} knowledge={knowledge}
                onOpenFinding={id=>window.opened.push('finding:'+id)}
                onOpenSource={id=>window.opened.push('source:'+id)}
                onOpenNode={id=>window.opened.push('node:'+id)} />
            </section>
          </div>;
        }
        createRoot(document.getElementById('root')).render(<App/>);
      `,
      resolveDir: root, sourcefile: "relations-ui.tsx", loader: "tsx",
    },
    bundle:true,platform:"browser",format:"iife",jsx:"automatic",
    define: {"process.env.NODE_ENV": '"production"' },
    outfile:path.join(temp,"app.js"),
  });

  const browser = await chromium.launch({channel:"chrome",headless:true});
  const page = await browser.newPage({viewport:{width:1200,height:760}});
  const errors=[];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setContent('<!doctype html><html><meta charset="utf-8"><div id="root"></div></html>');
    await page.addStyleTag({path:path.join(temp,"app.css")});
    await page.addScriptTag({path:path.join(temp,"app.js")});
    await page.locator('[data-node-id="task1"]').waitFor();
    const oldCamera = await page.locator(".dr-graph-viewport").evaluate(el=>({x:el.scrollLeft,y:el.scrollTop}));
    await page.getByRole("button",{name:"显示或隐藏知识关系图"}).click();
    const panel=page.getByRole("region",{name:"知识关系地图"});
    await panel.waitFor();
    assert.equal(await panel.locator(".dr-knowledge-entity").count(),4);
    assert.equal(await panel.locator(".dr-knowledge-link").count(),3,"cyclic links stay complete");
    assert.ok((await panel.locator(".dr-knowledge-toolbar").innerText()).includes("1 条关系有出处链接"));

    await panel.locator(".dr-knowledge-entity").filter({hasText:"Solar"}).click();
    const details=panel.getByLabel("知识关系详情");
    await details.getByText("储能可以改善电力系统灵活性").waitFor();
    await page.screenshot({ path: path.join(artifacts, "relations-desktop.png") });
    await details.getByRole("button",{name:"查看发现"}).click();
    assert.equal(await page.evaluate(()=>window.opened.at(-1)),"finding:f1");
    await details.getByRole("button",{name:"原文 s1"}).click();
    assert.equal(await page.evaluate(()=>window.opened.at(-1)),"source:s1");

    await details.getByRole("button",{name:/Solar → Battery/}).click();
    await details.getByText("supports",{exact:true}).first().waitFor();
    assert.ok((await details.innerText()).includes("储能可以改善电力系统灵活性"),
      "relationship links to explicit source-backed finding");

    await panel.locator(".dr-knowledge-entity").filter({hasText:"Grid"}).click();
    await details.getByText("目前没有与该项直接对应的已核验原文片段，请谨慎使用。").waitFor();
    await panel.getByRole("searchbox",{name:"搜索知识实体"}).fill("Battery");
    const searchResults=panel.getByLabel("知识实体搜索结果");
    await searchResults.getByRole("button",{name:/Battery/}).click();
    await details.getByRole("heading",{name:"Battery"}).waitFor();

    await page.getByRole("button",{name:"返回任务图"}).click();
    await page.locator('[data-node-id="task1"]').waitFor();
    assert.equal(await panel.count(),0);
    assert.deepEqual(await page.locator(".dr-graph-viewport").evaluate(el=>({x:el.scrollLeft,y:el.scrollTop})),oldCamera);

    await page.setViewportSize({width:390,height:844});
    await page.getByRole("button",{name:"显示或隐藏知识关系图"}).click();
    await page.getByRole("region",{name:"知识关系地图"}).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"mobile has no horizontal page overflow");
    await page.getByLabel("知识实体快速导航").getByRole("button",{name:/Battery/}).click();
    await page.getByLabel("知识关系详情").getByRole("heading",{name:"Battery"}).waitFor();
    await page.screenshot({ path: path.join(artifacts, "relations-mobile.png") });
    assert.equal(errors.length,0,JSON.stringify(errors));
  } finally {
    await browser.close();
  }
});
