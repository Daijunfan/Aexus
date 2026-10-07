import {build} from 'esbuild'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-boundaries-'))
try{
 await build({entryPoints:['Infra/src/shared/canvas.ts'],outfile:path.join(temp,'canvas.cjs'),bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const {constrainEmployee,employeeFits,planRoom}=createRequire(import.meta.url)(path.join(temp,'canvas.cjs'))
 for(const shape of ['rounded','ellipse','hexagon','custom']){
  const b={x:0,y:0,width:760,height:700,shape,arrangement:'free'}
  let p=constrainEmployee(b,{x:285,y:225})
  for(let i=0;i<100;i++){p=constrainEmployee(b,{x:Math.cos(i)*1800,y:Math.sin(i)*1500},p);assert.ok(employeeFits(b,p),shape+' drag left footprint outside')}
  for(const width of [700,520,360]){const small={...b,width,height:380},r=planRoom('Team',[{id:'a',position:p}],small);assert.ok(employeeFits(r.bounds,r.employees[0].position),'resize '+shape)}
 }
 const notch={x:0,y:0,width:760,height:700,shape:'custom',arrangement:'free',points:[{x:0,y:0},{x:.48,y:0},{x:.48,y:.6},{x:.52,y:.6},{x:.52,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]}
 assert.equal(employeeFits(notch,{x:300,y:180}),false,'four inside corners cannot bridge a concave notch')
 assert.ok(employeeFits(notch,constrainEmployee(notch,{x:300,y:180})))
 console.log('PASS full footprint confinement across four shapes, drag extremes, shrinking and concave notches')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
