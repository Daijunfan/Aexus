// Deterministic rendering invariants; no live app, engine, model or user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {SPRITE_REST_FRAMES,SELECTABLE_AVATARS,FATE_AVATARS} from '../src/shared/office.ts'
const root=process.cwd(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-render-check-')),require=createRequire(import.meta.url)
try{
 const outfile=path.join(temp,'cache.cjs')
 await build({entryPoints:[path.join(root,'src/renderer/src/office/routing-cache.ts')],outfile,bundle:true,platform:'node',format:'cjs'})
 const {cachedConnectionPlan}=require(outfile);let calls=0
 const compute=()=>({connections:[],crossTeamConnections:[],roomConnections:new Map(),sequence:++calls})
 const first=cachedConnectionPlan('geometry-a',compute)
 assert.equal(cachedConnectionPlan('geometry-a',compute),first);assert.equal(calls,1)
 assert.notEqual(cachedConnectionPlan('geometry-b',compute),first)
 for(let i=0;i<8;i++)cachedConnectionPlan('changed-'+i,compute)
 assert.notEqual(cachedConnectionPlan('geometry-a',compute),first,'old geometry is evicted instead of retaining unbounded scenes')
 assert.equal(SELECTABLE_AVATARS.length,15+FATE_AVATARS.length);assert.ok(FATE_AVATARS.every(id=>SELECTABLE_AVATARS.includes(id)));assert.ok(!SELECTABLE_AVATARS.includes('clawd'))
 let before=0,after=0,frames=0
 for(const [name,[row,column]] of Object.entries(SPRITE_REST_FRAMES)){
  const directory=path.join(root,'src/renderer/src/assets/pets'),source=path.join(directory,name+'.webp'),preview=path.join(directory,'previews',name+'.webp')
  const a=await sharp(source).metadata(),b=await sharp(preview).metadata()
  before+=a.width*a.height*4;after+=b.width*b.height*4;assert.equal(b.width,1152);assert.equal(b.height,208)
  for(const [index,[r,c]] of [[row,column],...[0,1,2,3,4].map(c=>[4,c])].entries()){
   const original=await sharp(source).extract({left:c*192,top:r*208,width:192,height:208}).ensureAlpha().raw().toBuffer()
   const reduced=await sharp(preview).extract({left:index*192,top:0,width:192,height:208}).ensureAlpha().raw().toBuffer()
   // Lossless encoders may discard RGB under fully transparent pixels.
   for(let i=0;i<original.length;i+=4){assert.equal(reduced[i+3],original[i+3],name+' alpha');if(original[i+3])for(let k=0;k<3;k++)assert.equal(reduced[i+k],original[i+k],name+' pixels')}
   frames++
  }
 }
 assert.ok(after<before*.1)
 console.log('PASS bounded exact-geometry cache, '+SELECTABLE_AVATARS.length+' preserved choices, '+frames+' pixel-identical animation frames; decoded atlas bytes '+before+' -> '+after)
}finally{fs.rmSync(temp,{recursive:true,force:true})}
