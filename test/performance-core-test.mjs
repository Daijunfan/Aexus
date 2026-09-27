// No engines or production state. Verify equivalent geometry and refresh/identity semantics.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const require=createRequire(import.meta.url),Module=require('node:module'),root=path.resolve(import.meta.dirname,'..')
async function load(dir){
 const output=await build({stdin:{contents:"export * from './src/shared/management-routing';export * from './src/shared/management-layout';export * from './src/shared/office-connections';export * from './src/shared/cross-team-routing';",resolveDir:dir,loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'})
 const m=new Module(dir+'/in-memory-performance.cjs');m.paths=Module._nodeModulePaths(dir);m._compile(output.outputFiles[0].text,m.filename=dir+'/in-memory-performance.cjs');return m.exports
}
async function loadSnapshot(){const output=await build({entryPoints:[root+'/src/renderer/src/snapshot.ts'],bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});const m=new Module(root+'/snapshot-test.cjs');m._compile(output.outputFiles[0].text,m.filename=root+'/snapshot-test.cjs');return m.exports}
const current=await load(root),{retainEqual,createRefreshQueue}=await loadSnapshot()
const a={list:[{id:'a',text:'old'},{id:'b',text:'stable'}],config:{theme:'white'}}
assert.equal(retainEqual(a,structuredClone(a)),a)
const next=retainEqual(a,{list:[{id:'a',text:'new'},{id:'b',text:'stable'}],config:{theme:'white'}})
assert.notEqual(next,a);assert.equal(next.list[1],a.list[1]);assert.equal(next.config,a.config);assert.equal(a.list[0].text,'old')
assert.deepEqual(retainEqual({value:1},{}),{});assert.deepEqual(retainEqual([1,2],[1]),[1])
let inflight=0,max=0,release,entered,started=new Promise(r=>entered=r),calls=[]
const refresh=createRefreshQueue(async(config,detail)=>{max=Math.max(max,++inflight);calls.push([config,detail]);if(calls.length===1){entered();await new Promise(r=>release=r)}inflight--})
const first=refresh(false,false);await started
const requests=Array.from({length:40},(_,i)=>refresh(i===0,i===1));release();await Promise.all([first,...requests])
assert.equal(max,1);assert.deepEqual(calls,[[false,false],[true,true]])
let fail=true;const recovery=createRefreshQueue(async()=>{if(fail){fail=false;throw Error('offline')}});await assert.rejects(recovery(),/offline/);await recovery()
assert.deepEqual(current.compactRoutingPath([{x:0,y:0},{x:2,y:0},{x:4,y:0},{x:4,y:3}]),[{x:0,y:0},{x:4,y:0},{x:4,y:3}])
assert.deepEqual(current.compactRoutingPath([{x:0,y:0},{x:4,y:0},{x:2,y:0}]),[{x:0,y:0},{x:4,y:0},{x:2,y:0}])
const forward=[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:1},{x:2,y:2}],boxes=current.lineObstacles([forward]);assert.equal(boxes.length,2)
const card=(id,managementRole='employee')=>({id,title:id,group:'A',managementRole,kind:'worker',engine:'codex',cwd:'/fixture/'+id,createdAt:1})
const cards=[card('manager','manager'),...Array.from({length:9},(_,i)=>card('e'+i))],relations=cards.slice(1).map(c=>({id:'created-'+c.id,managerId:'manager',employeeId:c.id,state:'active',requestedBy:{kind:'agent',employeeId:'manager'},createdAt:1,updatedAt:1}))
const room={name:'A',bounds:{x:0,y:0,width:1020,height:1166,shape:'rounded',arrangement:'free'},employees:cards.map((c,i)=>({card:c,position:i===0?{x:48,y:240}:{x:330+((i-1)%3)*220,y:220+Math.floor((i-1)/3)*300}}))}
const active=[{managerId:'manager',employeeId:'e0',command:'session.send',requestId:'a',startedAt:1}]
assert.equal(current.connectionGeometryKey([room],relations,[],new Set(['A'])),current.connectionGeometryKey([room],relations,active,new Set(['A'])))
const plan=current.officeConnectionPlan([room],relations,active);assert.equal(plan.connections.length,9);assert.equal(plan.crossTeamConnections.length,0);assert.equal(plan.connections.filter(r=>r.active).length,1)
const report={refresh:{maxInflight:max,calls:calls.length},routing:[],outputEquivalent:null}
function bench(fn){const values=[];let result;for(let i=0;i<5;i++){const t=performance.now();result=fn();values.push(performance.now()-t)}return {valuesMs:values.map(n=>+n.toFixed(2)),medianMs:+[...values].sort((a,b)=>a-b)[2].toFixed(2),result}}
const after=bench(()=>current.officeConnectionPlan([room],relations));report.routing.push({name:'single-pass optimized',...after,result:undefined})
if(process.env.AGENTS_PERFORMANCE_BASELINE){
 const original=await load(process.env.AGENTS_PERFORMANCE_BASELINE)
 const before=bench(()=>({crossTeamConnections:original.crossTeamRoutes([room],relations),connections:original.officeConnections([room],relations)}))
 // Paths can choose equivalent shorter grid vertices; compare the rendered SVG and endpoint identities.
 const visible=r=>r.connections.map(({id,path,managerId,employeeId})=>({id,path,managerId,employeeId}))
 report.outputEquivalent=JSON.stringify(visible(before.result))===JSON.stringify(visible(after.result))
 assert.equal(report.outputEquivalent,true,'rendered paths are unchanged in the reference scenario')
 report.routing.unshift({name:'original duplicate passes',...before,result:undefined});report.speedup=+(before.medianMs/after.medianMs).toFixed(2)
}
fs.mkdirSync(root+'/artifacts/performance-0.48.1',{recursive:true});fs.writeFileSync(root+'/artifacts/performance-0.48.1/core.json',JSON.stringify(report,null,2))
console.log('PASS structural sharing, immutable IPC responses, 40 concurrent refresh requests merged, rejection recovery, preserved path reversal, activity-independent routing; '+JSON.stringify(report))
