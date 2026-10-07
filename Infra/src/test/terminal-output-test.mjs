import assert from 'node:assert/strict'
import {build} from 'esbuild'
import fs from 'node:fs'
import {performance} from 'node:perf_hooks'
const bundle=await build({entryPoints:['Infra/src/main/terminal-output.ts'],bundle:true,write:false,platform:'node',format:'esm'})
const {TerminalOutput}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
const normalize=s=>{const first=s.charCodeAt(0);return first>=0xdc00&&first<=0xdfff?s.slice(1):s}
for(const limit of [5,128,256000]){
 const output=new TerminalOutput(limit);let all='',cursor=0
 for(let n=0;n<1000;n++){
  const chunk=n%3===0?'汉字🙂 '+n:'line '+n+'\r\n';all+=chunk;output.append(chunk)
  const tail=normalize(all.slice(-limit)),start=all.length-tail.length,r=output.read(cursor)
  assert.equal(r.output,tail.slice(Math.max(0,cursor-start)));assert.equal(r.cursor,all.length);assert.equal(r.reset,cursor<start)
  if(n%17===0)cursor=r.cursor
 }
 assert.equal(output.read().output,normalize(all.slice(-limit)))
 assert.equal(output.read(output.cursor).output,'')
}
const huge=new TerminalOutput(32);huge.append('🙂'.repeat(1000));assert.equal(huge.read().output,'🙂'.repeat(16));assert.equal(huge.read().reset,true)
class PreviousOutput{cursor=0;output='';append(data){this.output=(this.output+data).slice(-256000);this.cursor+=data.length}read(cursor=0){const start=this.cursor-this.output.length;return {output:this.output.slice(Math.max(0,cursor-start)),cursor:this.cursor,reset:cursor<start}}}
function measure(Type,text,steps){const output=new Type(),start=performance.now();let read=0,chars=0;for(let i=0;i<steps;i++){output.append(text);if(i%16===0){const r=output.read(read);chars+=r.output.length;read=r.cursor}}return {ms:performance.now()-start,tail:output.read(),chars}}
const reports=[]
for(const text of ['0123456789abcdef'.repeat(256),'日志🙂中文 utf8 '.repeat(256)]){
 const steps=Math.ceil(32*1024*1024/text.length)
 measure(TerminalOutput,text,100);measure(PreviousOutput,text,100)
 const beforeSamples=[],afterSamples=[]
 for(let sample=0;sample<5;sample++){
  const before=measure(PreviousOutput,text,steps),after=measure(TerminalOutput,text,steps)
  assert.deepEqual(after.tail,before.tail);assert.equal(after.chars,before.chars);beforeSamples.push(before.ms);afterSamples.push(after.ms)
 }
 const beforeMs=beforeSamples.sort((a,b)=>a-b)[2],afterMs=afterSamples.sort((a,b)=>a-b)[2]
 reports.push({codeUnits:steps*text.length,samples:5,beforeMs:Math.round(beforeMs),afterMs:Math.round(afterMs),speedup:+(beforeMs/afterMs).toFixed(1)})
}
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('.aexus/artifacts/cloud-output-performance.json',JSON.stringify(reports,null,2)+'\n')
console.log('PASS bounded output: incremental cursor, eviction, Unicode boundaries, oversized writes and equivalent high-volume reads; '+JSON.stringify(reports))
