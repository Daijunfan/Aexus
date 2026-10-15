import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-cross-routes-')),file=path.join(temp,'test.cjs');
await build({stdin:{contents:"export * from './src/shared/cross-team-routing';export * from './src/shared/room-geometry';export * from './src/shared/management';export * from './src/shared/management-layout';export * from './src/shared/management-routing';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});
const {crossTeamRoutes,roomSections,roomContainsSegment,creationRelations,managementRoutes,pathsConflict}=createRequire(import.meta.url)(file);
const card=(id,group,role='employee',creator)=>({id,title:id,group,engine:'codex',managementRole:role,createdBy:creator?{kind:'agent',employeeId:creator}:{kind:'operator'},createdAt:1,cwd:'/fixture',kind:'worker'});
const room=(name,x,y,shape='rounded',cards=[])=>({name,bounds:{x,y,width:900,height:1050,shape,arrangement:'free',pinned:true},employees:cards.map((card,i)=>({card,position:{x:i===0?330:60,y:i===0?250:650}}))});
const a=card('governor','A','governor'),b=card('manager','B','manager','governor'),ordinary=card('other','B','employee');
let count=0;
const crossing=(a,b,box)=>Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.width&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.height;
function check(route,rooms){
 assert.equal(route.status,'routed',JSON.stringify(route));
 for(const [team,leg,target] of [[route.sourceTeam,route.source,false],[route.targetTeam,route.target,true]]){
  const r=rooms.find(r=>r.name===team),p=leg.port,sections=roomSections(r.bounds,'x',p.y);
  const onSide=sections.some(([lo,hi])=>Math.min(Math.abs(p.x-lo),Math.abs(p.x-hi))<1e-5),onBottom=roomSections(r.bounds,'y',p.x).some(([,hi])=>Math.abs(hi-p.y)<1e-5);
  assert.ok(onSide||onBottom,'port sits on actual contour');assert.ok(p.y>=182,'never a header port');
  for(let i=1;i<leg.points.length;i++){
   const x=leg.points[i-1],y=leg.points[i];assert.ok(x.y>=172&&y.y>=172);assert.ok(roomContainsSegment(r.bounds,x,y),'internal segment leaves contour');
   for(const e of r.employees)assert.ok(!crossing(x,y,{...e.position,width:190,height:250}),'crosses employee body');count++;
  }
  if(target){const e=r.employees.find(e=>e.card.id===route.employeeId),last=leg.points.at(-1),prev=leg.points.at(-2);assert.equal(last.y,Math.max(180,e.position.y));assert.equal(last.x,e.position.x+95);assert.equal(last.x,prev.x);assert.ok(last.y>prev.y,'arrow enters head from above')}
 }
 assert.deepEqual(route.external.points[0],{x:rooms[0].bounds.x+route.source.port.x,y:rooms[0].bounds.y+route.source.port.y});
 for(let i=1;i<route.external.points.length;i++){
  const p=route.external.points[i-1],q=route.external.points[i];assert.ok(p.x===q.x||p.y===q.y);
  for(let step=1,n=Math.max(2,Math.ceil((Math.abs(q.x-p.x)+Math.abs(q.y-p.y))/4));step<n;step++){
   const at={x:p.x+(q.x-p.x)*step/n,y:p.y+(q.y-p.y)*step/n};
   for(const r of rooms){const x=at.x-r.bounds.x,y=at.y-r.bounds.y;assert.ok(!roomSections(r.bounds,'x',y).some(([lo,hi])=>x>lo+1e-5&&x<hi-1e-5),'external segment enters a Team')}
  }count++;
 }
}
try{
 const relations=creationRelations([a,b,ordinary]);assert.equal(relations.length,1,'global creator retains cross-Team provenance');assert.equal(creationRelations([{...a,managementRole:'manager'},b]).length,0);
 const before=performance.now();for(const shape of ['rounded','ellipse','hexagon','custom'])for(const [x,y] of [[1300,0],[-1400,80],[0,1450],[80,-1500]]){
  const rooms=[room('A',-400,-100,shape,[a]),room('B',x-400,y-100,shape,[b])],snapshot=JSON.stringify(rooms),routes=crossTeamRoutes(rooms,relations);check(routes[0],rooms);assert.equal(JSON.stringify(rooms),snapshot,'routing never changes geometry');
 }
 const rooms=[room('A',0,0,'rounded',[a]),room('B',2400,0,'rounded',[b,ordinary]),room('Obstacle',1200,-150,'hexagon',[])];check(crossTeamRoutes(rooms,relations)[0],rooms);
 const activity=[{managerId:a.id,employeeId:ordinary.id,command:'session.info',requestId:'r',startedAt:1}];const active=crossTeamRoutes(rooms,relations,activity);assert.equal(active.length,2);assert.equal(active[0].active,false);assert.equal(active[1].temporary,true);assert.equal(active[1].active,true);check(active[1],rooms);
 assert.equal(crossTeamRoutes(rooms,relations,[],new Set(['A']))[0].status,'hidden');assert.equal(crossTeamRoutes(rooms,relations,[],new Set(['Obstacle'])).length,0);
 const concave=[room('A',0,0,'custom',[a]),room('B',1300,0,'custom',[b])];for(const r of concave)r.bounds.points=[{x:0,y:0},{x:1,y:0},{x:1,y:.42},{x:.65,y:.42},{x:.65,y:.62},{x:1,y:.62},{x:1,y:1},{x:0,y:1}];check(crossTeamRoutes(concave,relations)[0],concave);
 const tree={name:'Tree',bounds:{x:0,y:0,width:1400,height:1400,shape:'rounded',arrangement:'free'},employees:[{card:card('root','Tree','manager'),position:{x:605,y:190}},...[[190,500],[1020,500],[190,800],[1020,800],[190,1100]].map(([x,y],i)=>({card:card('leaf'+i,'Tree','employee','root'),position:{x,y}}))]};
 const branches=managementRoutes(tree,creationRelations(tree.employees.map(e=>e.card)));assert.equal(branches.length,5);const occupied=[];for(const branch of branches){assert.equal(branch.status,'routed');assert.equal(branch.layout,'individual-lanes');assert.ok(!pathsConflict(branch.points,occupied),'each branch has a separate noncrossing lane');occupied.push(branch.points);const target=tree.employees.find(e=>e.card.id===branch.employeeId);assert.deepEqual(branch.points.at(-1),{x:target.position.x+95,y:target.position.y})}

 const blocked=[room('A',0,0,'rounded',[a]),room('B',0,0,'rounded',[b])];assert.equal(crossTeamRoutes(blocked,relations)[0].status,'blocked','overlap yields a hint, never unsafe fallback');
 const moved=structuredClone(rooms);moved[1].bounds.y+=250;moved[1].employees[0].position.x+=50;const changed=crossTeamRoutes(moved,relations)[0];check(changed,moved);assert.notDeepEqual(changed,crossTeamRoutes(rooms,relations)[0]);
 console.log(`PASS ${count} path segments: 4 contours / 4 directions, exact contour docking, no headers or employee crossings, world obstacles, off-view hints, blocked overlaps, active temporary lines, drag previews; ${Math.round(performance.now()-before)} ms`);
}finally{fs.rmSync(temp,{recursive:true,force:true})}
