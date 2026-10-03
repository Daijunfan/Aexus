"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
test('decorated employee map exports SVG, PNG and vector PDF through the same Core',async t=>{
 const f=await setup(t);await f.api('fs.mkdir',{path:'Exports'});
 const api=async(method,params)=>{
  if(method==='study.mindmap.export'&&params.format==='pdf'){
   const svg=await fs.readFile(path.join(f.workspace,'Exports/employee-map.svg'),'utf8'),ids=new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
   assert(!/\b(?:stroke|fill)="#[0-9a-f]{8}"/i.test(svg),'SVG 1.1 exports must use a separate alpha channel');
   const refs=[...svg.matchAll(/url\(#([^)]*)\)/g)].map(m=>m[1]);
   assert.deepEqual(refs.filter(id=>!ids.has(id)),[],'An exported visual references a missing SVG definition');
  }
  return f.api(method,params);
 };
 await require('./agent-mindmap-surface.cjs').exercise({api,deny:f.error});
});
