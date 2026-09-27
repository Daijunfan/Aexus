import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..'),suite=process.argv[2]??'core'
const suites={
  core:['release-foundation','engine-probe','creation-contract','employee-pristine','governor','governor-migration','management-state','management-provenance','management-activity','management','task-view','reply-receipts','team-views','connector-routing','connector-segments-api','connector-segments','cross-team-routing','room-resize','performance-core','web-server','web-desktop-relay'],
  ui:['creation-form-ui','governor-ui','management-ui','cross-team-ui','canvas-stability','chat-scroll-ui','connector-segments-ui','team-views-ui','performance-ui','web-ui','remote-desktop','web-vnc-ui'],
  engines:['manager-bootstrap-engine:codex:build','manager-bootstrap-engine:codex:work','manager-bootstrap-engine:claude:build','manager-bootstrap-engine:claude:work','employee-initialization-engine:codex:build','employee-initialization-engine:codex:work','employee-initialization-engine:claude:build','employee-initialization-engine:claude:work']
}
if(!suites[suite])throw Error('Choose core, ui or engines')
// Hosted Ubuntu runners need Chromium's official setuid helper configured before UI tests.
// Never change helper permissions on a contributor's machine or disable renderer sandboxing.
if(suite==='ui'&&process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'){
  const helper=path.join(root,'node_modules/electron/dist/chrome-sandbox')
  for(const args of [['-n','chown','root:root',helper],['-n','chmod','4755',helper]]){
    const child=spawn('sudo',args,{stdio:'inherit'}),status=await new Promise(resolve=>child.once('close',resolve).once('error',()=>resolve(-1)))
    if(status!==0)throw Error('Could not configure the hosted runner Electron sandbox helper')
  }
}
const directory=path.join(root,'artifacts','release-tests',suite);fs.mkdirSync(directory,{recursive:true})
const results=[]
for(const entry of suites[suite]){
  const [name,...args]=entry.split(':'),file=path.join(root,'test',name+'-test.mjs')
  const started=Date.now(),log=path.join(directory,entry.replaceAll(':','-')+'.log'),output=fs.openSync(log,'w')
  const child=spawn(process.execPath,[file,...args],{cwd:root,env:{...process.env,...(suite==='ui'&&process.platform==='linux'?{DEBUG:'pw:browser'}:{}),...(suite==='ui'&&process.platform==='win32'?{AGENTS_COMPANY_OFFSCREEN:'1'}:{})},stdio:['ignore',output,output]})
  const timer=setTimeout(()=>child.kill('SIGTERM'),180000)
  const status=await new Promise(resolve=>{child.once('error',error=>{fs.writeSync(output,error.stack);resolve(-1)});child.once('close',resolve)})
  clearTimeout(timer);fs.closeSync(output)
  const result={test:entry,status,ms:Date.now()-started,log:path.relative(root,log)};results.push(result)
  console.log(`${status===0?'PASS':'FAIL'} ${entry} ${result.ms}ms`)
  if(status!==0)console.log(fs.readFileSync(log,'utf8').split('\n').slice(-80).join('\n'))
}
fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2)+'\n')
console.log(`${suite}: ${results.filter(r=>r.status===0).length}/${results.length} passed`)
process.exitCode=results.some(result=>result.status!==0)?1:0
