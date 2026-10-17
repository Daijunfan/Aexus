import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root=path.resolve(import.meta.dirname,'..'),out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-svg-coordinates-')),'geometry.cjs')
await build({stdin:{contents:"export * from './src/renderer/src/office/svg-coordinates'",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'cjs',outfile:out,logLevel:'silent'})
const {svgCoordinates}=createRequire(import.meta.url)(out)
const previousWindow=globalThis.window,previousDocument=globalThis.document
try{
 for(const pageScale of [.75,1,1.5])for(const canvasScale of [.2,.35,1,2]){
  globalThis.window={innerWidth:1100}
  globalThis.document={documentElement:{getBoundingClientRect:()=>({width:1100/pageScale})}}
  const svg={viewBox:{baseVal:{x:-600,y:-600,width:3400,height:2600}},width:{baseVal:{value:3400}},height:{baseVal:{value:2600}},getBoundingClientRect:()=>({left:200,top:100,width:3400*canvasScale,height:2600*canvasScale})}
  const a=svgCoordinates(svg,200+300*pageScale,100+260*pageScale),b=svgCoordinates(svg,200+360*pageScale,100+300*pageScale)
  assert.ok(Math.abs((b.x-a.x)-60/canvasScale)<1e-6)
  assert.ok(Math.abs((b.y-a.y)-40/canvasScale)<1e-6)
 }
 console.log('PASS svg coordinates preserve mouse delta across canvas/page zoom')
}finally{globalThis.window=previousWindow;globalThis.document=previousDocument}
