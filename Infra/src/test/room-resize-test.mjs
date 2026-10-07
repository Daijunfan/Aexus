import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const core=await fixtureCore(),module=path.join(core.temp,'canvas.cjs')
await build({entryPoints:['Infra/src/shared/canvas.ts'],bundle:true,platform:'node',format:'cjs',outfile:module,logLevel:'silent'})
const {planRoom,resizeRoom,resizeOccupiedRoom,employeeFits,EMPLOYEE_SIZE}=createRequire(import.meta.url)(module)
const world=room=>room.employees.map(e=>({id:e.card.id,x:room.bounds.x+e.position.x,y:room.bounds.y+e.position.y}))
const unchanged=(before,after)=>{const a=world(before),b=world(after);assert.deepEqual(a.map(e=>e.id),b.map(e=>e.id));a.forEach((p,i)=>{assert.ok(Math.abs(p.x-b[i].x)<1e-5);assert.ok(Math.abs(p.y-b[i].y)<1e-5)});assert.ok(after.employees.every(e=>employeeFits(after.bounds,e.position)))}
try{
 for(const shape of ['rounded','ellipse','hexagon','custom']){
  const room=planRoom('Shape',Array.from({length:3},(_,i)=>({id:String(i),createdAt:i})),{x:-120,y:60,width:1400,height:1400,shape,arrangement:'grid'})
  for(const edge of ['n','ne','e','se','s','sw','w','nw']){
   const delta={x:edge.includes('w')?10000:-10000,y:edge.includes('n')?10000:-10000}
   const reduced=resizeOccupiedRoom(room,resizeRoom(room.bounds,edge,delta));unchanged(room,reduced)
   assert.ok(reduced.bounds.width<=room.bounds.width+1e-5);assert.ok(reduced.bounds.height<=room.bounds.height+1e-5)
   unchanged(reduced,resizeOccupiedRoom(reduced,resizeRoom(reduced.bounds,edge,{x:-delta.x,y:-delta.y})))
  }
 }
 const narrow=planRoom('Large',[{id:'a',position:{x:18,y:182}}],{x:0,y:0,width:760,height:520,shape:'rounded',arrangement:'free'})
 const large=resizeOccupiedRoom(narrow,{...narrow.bounds,width:10000,height:10000});unchanged(narrow,large);assert.equal(large.bounds.width,10000)
 const empty={name:'Empty',employees:[],bounds:narrow.bounds};assert.deepEqual(resizeOccupiedRoom(empty,resizeRoom(empty.bounds,'nw',{x:10000,y:10000})).bounds,resizeRoom(empty.bounds,'nw',{x:10000,y:10000}))
 console.log('PASS all eight resize handles and four shapes preserve world positions and contain full employee footprints; large growth and empty rooms')
 await core.cli('group','add','A');const manager=await core.create('Manager','A','manager'),worker=await core.call(await core.token(manager.id),'card','create','--title','Worker','--group','A','--model','gpt-6-luna');await core.ready(worker.id)
 const relation=(await core.cli('management','topology')).edges.find(edge=>edge.employeeId===worker.id)
 const original=await core.cli('room','layout','A')
 for(const edge of ['se','nw','e','w','n','s']){
  const current=await core.cli('room','layout','A'),delta={x:edge.includes('w')?10000:-10000,y:edge.includes('n')?10000:-10000},requested=resizeRoom(current.bounds,edge,delta)
  await core.cli('room','bounds','A','--x',String(requested.x),'--y',String(requested.y),'--width',String(requested.width),'--height',String(requested.height))
  unchanged(original,await core.cli('room','layout','A'))
 }
 let current=await core.cli('room','layout','A')
 await core.cli('room','bounds','A','--width',String(current.bounds.width+900),'--height',String(current.bounds.height+500))
 current=await core.cli('room','layout','A');unchanged(original,current)
 assert.equal((await core.cli('management','topology')).edges[0].id,relation.id)
 await core.stop();await core.start();unchanged(original,await core.cli('room','layout','A'))
 await core.cli('room','bounds','A','--x',String(current.bounds.x+100),'--y',String(current.bounds.y+80))
 const moved=world(await core.cli('room','layout','A'));world(current).forEach((e,i)=>{assert.ok(Math.abs(moved[i].x-e.x-100)<1e-5);assert.ok(Math.abs(moved[i].y-e.y-80)<1e-5)})
 console.log('PASS real CLI clamps shrinking, preserves manager/employee positions and relations across resizing/restart, and still moves employees with a whole-Team drag')
}finally{await core.close()}
