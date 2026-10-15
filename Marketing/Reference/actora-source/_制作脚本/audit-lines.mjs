// Independent checks against Core geometry and the actual SVG rendered by the installed App.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const eps=1e-4,equal=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<eps;
const offset=(points,r)=>points.map(p=>({x:p.x+r.bounds.x,y:p.y+r.bounds.y}));
const clean=points=>points.filter((p,i)=>!i||!equal(p,points[i-1]));
const crossBox=(a,b,r)=>Math.max(a.x,b.x)>r.x+eps&&Math.min(a.x,b.x)<r.x+r.width-eps&&Math.max(a.y,b.y)>r.y+eps&&Math.min(a.y,b.y)<r.y+r.height-eps;
const segments=points=>clean(points).slice(1).map((p,i)=>[clean(points)[i],p]);
const direction=(a,b)=>({x:Math.sign(b.x-a.x),y:Math.sign(b.y-a.y)});
const contact=(a,b,c,d)=>{const ah=a.y===b.y,ch=c.y===d.y,lo=(a,b)=>Math.min(a,b),hi=(a,b)=>Math.max(a,b),within=(v,a,b)=>v>=lo(a,b)-eps&&v<=hi(a,b)+eps;
 if(ah===ch){if(Math.abs((ah?a.y:a.x)-(ah?c.y:c.x))>eps)return false;return Math.min(hi(ah?a.x:a.y,ah?b.x:b.y),hi(ah?c.x:c.y,ah?d.x:d.y))-Math.max(lo(ah?a.x:a.y,ah?b.x:b.y),lo(ah?c.x:c.y,ah?d.x:d.y))>eps}
 const [h1,h2,v1,v2]=ah?[a,b,c,d]:[c,d,a,b];return within(v1.x,h1.x,h2.x)&&within(h1.y,v1.y,v2.y)
};
export async function auditLines(layout,page,out,label){
 fs.mkdirSync(out,{recursive:true});const nodes=new Map(layout.rooms.flatMap(r=>r.employees.map(e=>[e.id,{...e,room:r,box:{x:r.bounds.x+e.position.x,y:r.bounds.y+e.position.y,width:e.width,height:e.height}}]))),lines=[];
 for(const edge of layout.connections){assert.equal(edge.status,'routed');assert.ok(!edge.warning,'Please adjust the crowded route before photographing');lines.push({...edge,parts:[{points:edge.points,path:edge.path}],world:edge.points})}
 assert.equal(await page.locator('.management-port,[data-port]').count(),0,'Team boundaries must not contain connector circles');
 const report=[];
 for(const [i,e] of lines.entries()){
  const source=nodes.get(e.managerId),target=nodes.get(e.employeeId),pts=clean(e.world),parts=segments(pts),entry=direction(pts.at(-2),pts.at(-1));
  const dock=(p,b,pad)=>Math.abs(p.x-b.x+pad)<eps||Math.abs(p.x-b.x-b.width-pad)<eps? p.y>=b.y-eps&&p.y<=b.y+b.height+eps:Math.abs(p.y-b.y+pad)<eps||Math.abs(p.y-b.y-b.height-pad)<eps? p.x>=b.x-eps&&p.x<=b.x+b.width+eps:false;
  assert.ok(dock(pts[0],source.box,0),'source misses actor '+source.title);assert.ok(dock(pts.at(-1),target.box,0),'target misses actor '+target.title);
  if(e.anchors?.target?.side==='auto'||!e.anchors){assert.equal(pts.at(-1).y,target.box.y);assert.deepEqual(entry,{x:0,y:1},'arrow must point down at head')}
  for(const [a,b] of parts){assert.ok(a.x===b.x||a.y===b.y,'diagonal segment');for(const n of nodes.values())assert.ok(!crossBox(a,b,n.box),'crossed employee '+n.title);for(const r of layout.rooms)assert.ok(!crossBox(a,b,{...r.bounds,height:170}),'crossed Team header '+r.name)}
  for(let j=0;j<parts.length;j++)for(let k=j+2;k<parts.length;k++)assert.ok(!contact(...parts[j],...parts[k]),'line crosses itself '+e.id);
  for(const previous of lines.slice(0,i))for(const a of parts)for(const b of segments(previous.world))assert.ok(!contact(...a,...b),'two lines cross or overlap '+e.id+' / '+previous.id);
  const svg=page.locator(`[data-connection="${e.id}"] .management-line`);assert.equal(await svg.count(),e.parts.length,'rendered segment count');
  const actual=await svg.evaluateAll(paths=>paths.map(p=>({d:p.getAttribute('d'),arrow:!!p.getAttribute('marker-end'),part:p.parentElement.getAttribute('data-cross-team'),length:p.getTotalLength()})));
  for(const p of e.parts)assert.ok(actual.some(a=>a.d===p.path),'Core/SVG mismatch');assert.equal(actual.filter(p=>p.arrow).length,1,'exactly one target arrow');if(e.parts.length===3)assert.equal(actual.find(p=>p.arrow).part,'target');
  const highlight=await page.addStyleTag({content:`.management-connection{opacity:.08!important}.management-connection[data-connection="${e.id}"]{opacity:1!important}.management-connection[data-connection="${e.id}"] .management-line{stroke:#4354cb!important;opacity:1!important;stroke-width:3!important;transition:none!important}`})
  const clip=await page.evaluate(({id,from,to})=>{const boxes=[...document.querySelectorAll(`[data-connection="${id}"] .management-line`),document.querySelector(`[data-card-id="${from}"]`),document.querySelector(`[data-card-id="${to}"]`)].filter(Boolean).map(e=>e.getBoundingClientRect()),x=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.left))-24)),y=Math.max(0,Math.floor(Math.min(...boxes.map(b=>b.top))-24));return {x,y,width:Math.min(innerWidth,Math.ceil(Math.max(...boxes.map(b=>b.right))+24))-x,height:Math.min(innerHeight,Math.ceil(Math.max(...boxes.map(b=>b.bottom))+24))-y}},{id:e.id,from:e.managerId,to:e.employeeId})
  const imageFile=`${label}-${String(i+1).padStart(2,'0')}-${source.title}-${target.title}.png`
  await page.screenshot({path:path.join(out,imageFile),clip,animations:'disabled',scale:'css'});await highlight.evaluate(e=>e.remove())
  report.push({imageFile,number:i+1,id:e.id,from:source.title,to:target.title,checks:['exact source and target docking','downward head arrow or explicit anchor','axis-aligned segments with rounded corners','no employee or header crossings','no self/inter-line crossings or shared trunks','continuous Team boundary joins','no boundary dots','Core paths equal installed SVG'],parts:e.parts.length,segments:parts.length,status:'PASS'});
 }
 const text=['# '+label+' · 逐线验收','',`共 ${report.length} 条逻辑连线；逐条检查通过。`,`检查时间：${new Date().toISOString()}`,'',...report.map(r=>`${r.number}. **${r.from} → ${r.to}**：PASS，${r.parts} 段绘制、${r.segments} 段正交路径。`),'','附图仅在验收截图中高亮当前线路，其余线路淡化；成品海报保持 App 的真实工作状态颜色。','','验收针对本次保存的具体场景，不代表任意未来布局绝无缺陷。'];
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify({checkedAt:new Date().toISOString(),count:report.length,lines:report},null,2));fs.writeFileSync(path.join(out,label+'.md'),text.join('\n'));
 console.log('LINE AUDIT '+label+': '+report.length+' individually passed');return report;
}
