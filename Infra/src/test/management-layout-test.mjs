import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import assert from 'node:assert/strict'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-layout-')),bundle=path.join(temp,'layout.cjs'),require=createRequire(import.meta.url)
await build({stdin:{contents:"export * from './Infra/src/shared/management-layout'; export * from './Infra/src/shared/canvas'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'})
const {planManagement,managementRoutes,roundedOrthogonalPath,employeeFits,applyManagementLayout,reflowChangedManagement,planOffice}=require(bundle)
const make=(id,role='employee')=>({id,title:id,group:'A',managementRole:role,kind:'worker',engine:'codex',cwd:'/Infra/src/test/'+id,createdAt:Number(id.replace(/\D/g,''))||0})
const edge=(m,e,id=m+'-'+e)=>({id,managerId:m,employeeId:e,state:'active',requestedBy:{kind:'operator'},createdAt:1,updatedAt:1})
const cards=[make('m1','manager'),make('m2','manager'),make('m3','manager'),...Array.from({length:9},(_,i)=>make('e'+i)),make('isolated1'),make('isolated2')]
const relations=[...Array.from({length:6},(_,i)=>edge('m1','e'+i)),edge('m2','e1'),edge('m2','e5'),edge('m3','e6'),edge('m3','e7')]
const base={x:-400,y:170,width:760,height:520,shape:'rounded',arrangement:'grid'}
let assertions=0
try{
 for(const shape of ['rounded','ellipse','hexagon','custom']){
  const before=performance.now(),result=planManagement(cards,{...base,shape},relations),room={...result,name:'A'}
  assert.equal(result.employees.length,cards.length);assert.equal(new Set(result.employees.map(x=>x.card.id)).size,cards.length)
  for(const item of result.employees){assert.ok(employeeFits(result.bounds,item.position),shape+' full footprint '+item.card.id);assertions++}
  for(let i=0;i<room.employees.length;i++)for(let j=i+1;j<room.employees.length;j++){
   const a=room.employees[i].position,b=room.employees[j].position;assert.ok(Math.abs(a.x-b.x)>=190||Math.abs(a.y-b.y)>=250,shape+' overlap');assertions++
  }
  for(const route of managementRoutes(room,relations)){
   if(route.status==='blocked'){assert.equal(route.path,'');assert.deepEqual(route.points,[]);continue}
   assert.ok(!/[CLAST]/.test(route.path));assert.match(route.path,/[HV]-?[\d.]+$/)
   for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];assert.ok(a.x===b.x||a.y===b.y);assertions++}
   const endpoint=route.points.at(-1),target=room.employees.find(x=>x.card.id===relations.find(e=>e.id===route.id).employeeId).position
   assert.ok(endpoint.x===target.x||endpoint.x===target.x+190||endpoint.y===target.y||endpoint.y===target.y+250,'arrow docks on the standard rectangular frame')
   // Every routing point is inside the Team and every segment avoids non-endpoint employee bodies.
   for(let i=1;i<route.points.length;i++){
    const a=route.points[i-1],b=route.points[i]
    for(const employee of room.employees){const p=employee.position,minx=Math.min(a.x,b.x),maxx=Math.max(a.x,b.x),miny=Math.min(a.y,b.y),maxy=Math.max(a.y,b.y);assert.ok(!(maxx>p.x&&minx<p.x+190&&maxy>p.y&&miny<p.y+250),'routing through '+employee.card.id);assertions++}
   }
  }
  assert.deepEqual(planManagement(cards,{...base,shape},relations),result,'deterministic '+shape)
  console.log('PASS layout',shape,result.bounds.width+'x'+result.bounds.height,'ms',Math.round(performance.now()-before))
 }
 assert.throws(()=>roundedOrthogonalPath([{x:0,y:0},{x:2,y:3}]),/Diagonal/)
 assert.equal(roundedOrthogonalPath([{x:0,y:0},{x:0,y:0},{x:4,y:0},{x:8,y:0}]),'M0 0 H8')
 assert.match(roundedOrthogonalPath([{x:0,y:0},{x:2,y:0},{x:2,y:3}]),/Q2 0 2 1/)
 const manual={name:'A',bounds:{...base,x:0,y:0,width:1250,height:1180},employees:Array.from({length:9},(_,i)=>({card:make('manual'+i,i===0?'manager':'employee'),position:{x:40+(i%3)*360,y:205+Math.floor(i/3)*320}}))}
 const routingStarted=performance.now()
 for(const tight of [false,true]){
 if(tight)manual.employees.forEach((item,i)=>{item.position={x:40+(i%3)*208,y:205+Math.floor(i/3)*268}})
 for(let source=0;source<9;source++)for(let target=0;target<9;target++)if(source!==target){
   const [route]=managementRoutes(manual,[edge('manual'+source,'manual'+target)])
   assert.ok(route.points.length>=2,`missing ${tight} ${source} -> ${target}`)
   const last=route.points.at(-1),entry=route.points.at(-2);assert.equal(last.x,manual.employees[target].position.x+95);assert.equal(last.y,manual.employees[target].position.y);assert.equal(last.x,entry.x);assert.ok(last.y>entry.y,'default target enters at head from above');
   for(let i=1;i<route.points.length;i++){
     const a=route.points[i-1],b=route.points[i];assert.ok(a.x===b.x||a.y===b.y,'all user-positioned segments remain orthogonal')
     for(const {position:p} of manual.employees)assert.ok(!(Math.max(a.x,b.x)>p.x&&Math.min(a.x,b.x)<p.x+190&&Math.max(a.y,b.y)>p.y&&Math.min(a.y,b.y)<p.y+250),'arbitrary routing intersects an employee')
     for(const p of [a,b])assert.ok(p.x>=0&&p.y>=170&&p.x<=manual.bounds.width&&p.y<=manual.bounds.height)
     assertions++
   }
 }
 }
 console.log('PASS 144 manual arrangements including tight 18px gaps, head-top docking and obstacle avoidance in',Math.round(performance.now()-routingStarted),'ms')
 const store={groups:['B','A'],sessions:cards,rooms:{},access:{version:1,revision:1,relations,globalManagerIds:[]},teamViews:[{id:'subset',name:'Subset',teams:['A'],viewport:{x:11,y:22,zoom:.4}}],viewport:{x:40,y:20,zoom:.8}}
 const old=planOffice(store),view=JSON.stringify([store.viewport,store.teamViews]);applyManagementLayout(store,'A')
 const next=planOffice(store)
 for(const name of ['A','B']){assert.equal(next.find(r=>r.name===name).bounds.x,old.find(r=>r.name===name).bounds.x);assert.equal(next.find(r=>r.name===name).bounds.y,old.find(r=>r.name===name).bounds.y)}
 assert.equal(JSON.stringify([store.viewport,store.teamViews]),view)
 const snapshot=structuredClone(store);store.sessions[0].position.x+=1;const expected=structuredClone(store);reflowChangedManagement(store,snapshot);assert.deepEqual(store,expected,'manual drag cannot cause a topology reflow')
 const prior=structuredClone(store);store.groups=['B','Renamed'];store.sessions=store.sessions.map(c=>({...c,group:'Renamed'}));store.rooms.Renamed=store.rooms.A;delete store.rooms.A;const renamed=structuredClone(store);reflowChangedManagement(store,prior);assert.deepEqual(store,renamed,'rename preserves geometry')
 console.log('PASS',assertions,'geometry checks: full footprints, no overlap, all connector segments orthogonal and clear, deterministic shared-manager grouping, viewport and other Team positions preserved')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
