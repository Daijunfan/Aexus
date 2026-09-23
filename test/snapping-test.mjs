import {build} from 'esbuild'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-snap-'))
try{
 await build({entryPoints:['src/shared/canvas.ts'],outfile:path.join(temp,'canvas.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const {snapEmployee,resizeEdge,resizeRoom}=createRequire(import.meta.url)(path.join(temp,'canvas.cjs'))
 const room={name:'Team',bounds:{x:0,y:0,width:760,height:700,shape:'rounded',arrangement:'grid'},employees:[{card:{id:'a'},position:{x:48,y:62}},{card:{id:'b'},position:{x:48,y:347}}]}
 const snap=(point,zoom=1,guide={})=>snapEmployee(room,'b',point,zoom,guide)
 assert.deepEqual(snap({x:280,y:69}).position,{x:273,y:62})
 assert.deepEqual(snap({x:285,y:91}).position,{x:273,y:91})
 assert.deepEqual(snap({x:370,y:190}).position,{x:370,y:190})
 assert.deepEqual(snap({x:292,y:80},1,{x:273,y:62}).position,{x:273,y:62})
 assert.deepEqual(snap({x:302,y:92},1,{x:273,y:62}).position,{x:302,y:92})
 assert.deepEqual(snap({x:292,y:80},.5).position,{x:273,y:62})
 assert.deepEqual(snap({x:280,y:69},3).position,{x:280,y:69})
 assert.deepEqual(snap({x:52,y:66}).position,{x:52,y:66})
 assert.deepEqual(room.employees[0].position,{x:48,y:62})
 const b=room.bounds
 assert.equal(resizeEdge(.01,.5),'w');assert.equal(resizeEdge(.9,.1),'ne')
 assert.deepEqual(resizeRoom(b,'nw',{x:500,y:500}),{...b,x:400,y:320,width:360,height:380})
 assert.deepEqual(resizeRoom(b,'se',{x:100,y:80}),{...b,width:860,height:780})
 console.log('PASS=13 FAIL=0 — grid attraction, axis alignment, free movement, hysteresis, zoom and occupied-seat rejection, edge direction and anchored minimum sizes')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
