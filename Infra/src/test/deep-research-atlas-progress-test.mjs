import assert from 'node:assert/strict'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const require=createRequire(import.meta.url)
const root=path.resolve(import.meta.dirname,'../../..')
const result=await build({
 entryPoints:[path.join(root,'Engine/deep-research/ResearchAtlas.tsx')],
 bundle:true,platform:'node',format:'cjs',write:false,packages:'external',
 loader:{'.css':'empty'},logLevel:'silent'
})
const module={exports:{}}
new Function('require','module','exports',result.outputFiles[0].text)(require,module,module.exports)
const {ResearchAtlas}=module.exports
const route=(workerId,status,completedTasks,totalTasks)=>({
 workerId,label:'研究员 '+workerId,engine:'codex',model:null,status,
 tracks:[],sourceIds:[],findings:0,completedTasks,totalTasks
})
const job={
 status:'running',
 summary:{
  sourceCount:0,workers:[{id:'lead',role:'lead',label:'研究主编',engine:'claude'}],
  insights:{
   routes:[route('running','running',2,4),route('pending','ready',0,0),
    route('approval','approval',1,3),route('overflow','completed',8,2)],
   criteria:[],domains:[],evidenceReady:false,
   citations:{},reviews:{}
  }
 }
}
const html=renderToStaticMarkup(createElement(ResearchAtlas,{job,onInspect:()=>{}}))
const markers=[...html.matchAll(/role="progressbar"[^>]+>/g)].map(match=>match[0])
assert.equal(markers.length,4,'one accessible progress indicator per independent research route')
assert.match(markers[0],/aria-valuenow="50"/)
assert.match(markers[0],/aria-valuetext="2 \/ 4 步完成"/)
assert.match(markers[1],/aria-valuenow="0"/)
assert.match(markers[1],/aria-valuetext="尚未分配步骤"/)
assert.match(markers[2],/aria-valuetext="1 \/ 3 步完成"/)
assert.match(markers[3],/aria-valuenow="100"/)
assert.match(html,/data-status="approval"/)
assert.match(html,/研究员 running 已完成步骤/)
assert.ok(!html.includes('Infinity')&&!html.includes('NaN'),'no invalid progress output')
console.log('PASS per-Agent accessible progress, waiting, approval, and completed-task clamping')
