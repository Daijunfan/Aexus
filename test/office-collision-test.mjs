import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-collision-')),file=path.join(temp,'geometry.cjs'),require=createRequire(import.meta.url)
await build({stdin:{contents:"export * from './src/shared/office-layout'; export * from './src/shared/canvas'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'})
const {separateRooms,roomsOverlap,reconcileOfficeLayout,planOffice}=require(file)
let checks=0
const noOverlap=rooms=>{for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){assert.ok(!roomsOverlap(rooms[i].bounds,rooms[j].bounds));checks++}}
try{
  let seed=143
  const random=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296
  const crowded=Array.from({length:150},(_,i)=>({name:'T'+i,employees:[],bounds:{x:Math.round(random()*1600-800),y:Math.round(random()*1200-600),width:360+Math.round(random()*700),height:520+Math.round(random()*800),pinned:true,shape:'rounded',arrangement:'free'}}))
  const start=performance.now(),packed=separateRooms(crowded,['T0']),elapsed=performance.now()-start
  noOverlap(packed);assert.deepEqual(packed[0].bounds,crowded[0].bounds)
  assert.deepEqual(separateRooms(crowded,['T0']),packed)
  assert.deepEqual(separateRooms(packed),packed,'idempotent separation')
  const base={groups:['A','B'],sessions:[],rooms:{A:{col:0,row:0,w:1,h:1,bounds:{x:0,y:0,width:760,height:520,shape:'rounded',arrangement:'free',pinned:true}},B:{col:1,row:0,w:1,h:1,bounds:{x:0,y:590,width:760,height:520,shape:'rounded',arrangement:'free',pinned:true}}},viewport:{x:12,y:34,zoom:.7}}
  let store=structuredClone(base)
  for(let n=1;n<=24;n++){
    const previous=structuredClone(store)
    store.sessions.push({id:'s'+n,title:'Employee '+n,engine:'codex',group:'A',cwd:'/fixture/'+n,createdAt:n})
    reconcileOfficeLayout(store,previous);noOverlap(planOffice(store))
  }
  const large=store.rooms.A.bounds.width*store.rooms.A.bounds.height,previous=structuredClone(store)
  store.sessions=store.sessions.slice(0,2);reconcileOfficeLayout(store,previous)
  assert.ok(store.rooms.A.bounds.width*store.rooms.A.bounds.height<large);noOverlap(planOffice(store))
  const before=structuredClone(store)
  store.sessions[0].lastReply={id:'reply',itemId:'item',text:'Done',createdAt:1}
  const expected=structuredClone(store);reconcileOfficeLayout(store,before)
  assert.deepEqual(store,expected);assert.deepEqual(store.viewport,base.viewport)
  fs.writeFileSync(path.join(root,'artifacts/office-collision.json'),JSON.stringify({passed:true,checks,rooms:150,elapsedMs:Math.round(elapsed*100)/100},null,2))
  console.log(`PASS ${checks} non-overlap checks across 150 crowded rooms and roster changes; deterministic/idempotent separation; ${elapsed.toFixed(2)} ms; read receipts and camera stable`)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
