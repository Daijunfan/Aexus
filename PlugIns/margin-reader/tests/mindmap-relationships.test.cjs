'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('automatic relationship paths avoid unrelated topic boxes and preserve explicit user bends',async()=>{
 const {relationshipRoute}=await import('../ui/mindmap-style.mjs');
 const positions=new Map([['a',{x:0,y:100,width:100,height:50}],['b',{x:500,y:100,width:100,height:50}],['blocked',{x:210,y:45,width:180,height:170}]]);
 for(const line of ['curve','straight','elbow','rounded']){const r=relationshipRoute({from:'a',to:'b',mindmap:{line}},positions);assert(r.autoRouted,line);assert(r.points.length>=4);for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i];for(let j=0;j<=20;j++){const x=a[0]+(b[0]-a[0])*j/20,y=a[1]+(b[1]-a[1])*j/20;assert(!(x>210&&x<390&&y>45&&y<215),line+' intersects blocker');}}}
 const manual=relationshipRoute({from:'a',to:'b',mindmap:{bendX:30,bendY:40}},positions);assert(!manual.autoRouted);assert.deepEqual(manual.mid,[330,165]);assert(!relationshipRoute({from:'a',to:'b',mindmap:{avoidTopics:false}},positions).autoRouted);
});
test('routing uses a complete spatial index for thousands of topics and does not mutate graph geometry',async()=>{
 const {relationshipRoute}=await import('../ui/mindmap-style.mjs');const p=new Map();for(let i=0;i<3000;i++)p.set('t'+i,{x:(i%50)*150,y:Math.floor(i/50)*70,width:90,height:35});const before=JSON.stringify([...p]);
 for(const to of ['t48','t2500','t2999']){const r=relationshipRoute({from:'t0',to},p);assert(r&&Number.isFinite(r.box.width)&&!r.d.includes('NaN'));if(to==='t48')assert(r.autoRouted);}
 assert.equal(JSON.stringify([...p]),before);
});
