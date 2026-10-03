// Hosted MiniNotion regression against the normal built-in build, not dist-plugin overrides.
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..')
const plugin=path.join(root,'PlugIns/mini-notion')
const artifacts=process.env.AGENTS_COMPANY_TEST_ARTIFACTS||path.join(root,'artifacts/mininotion-ui')
fs.mkdirSync(artifacts,{recursive:true})
const results=[]
for(const [name,script] of [['workspace','test-workspace-ui.mjs'],['local','test-local-ui.mjs'],['editing','test-editing-ui.mjs'],['authoring',path.join(root,'test/mininotion-authoring-ui-test.mjs')],['recycle',path.join(root,'test/mininotion-recycle-ui-test.mjs')],['visual',path.join(root,'test/mininotion-visual-ui-test.mjs')],['events',path.join(root,'test/mininotion-event-ui-test.mjs')],['editor-tools',path.join(root,'test/mininotion-editor-tools-ui-test.mjs')]]){
  const log=path.join(artifacts,name+'.log'),output=fs.openSync(log,'w')
  const env={...process.env,AGENTS_COMPANY_PLUGIN_DIRS:'',MINI_NOTION_TEST_PLUGIN:'',AGENTS_COMPANY_BUILTIN_PLUGINS:path.join(root,'build/plugins'),AGENTS_COMPANY_TEST_ARTIFACTS:path.join(artifacts,name)}
  const started=Date.now()
  const child=spawn(process.execPath,[path.isAbsolute(script)?script:path.join(plugin,'scripts',script)],{cwd:plugin,env,stdio:['ignore',output,output]})
  const timer=setTimeout(()=>child.kill('SIGTERM'),180000)
  const status=await new Promise(resolve=>{child.once('error',error=>{fs.writeSync(output,String(error));resolve(-1)});child.once('close',resolve)})
  clearTimeout(timer);fs.closeSync(output)
  results.push({name,status,ms:Date.now()-started,log:path.relative(root,log)})
  console.log(fs.readFileSync(log,'utf8').trimEnd())
  console.log(`${status===0?'PASS':'FAIL'} hosted MiniNotion ${name}`)
}
fs.writeFileSync(path.join(artifacts,'results.json'),JSON.stringify(results,null,2)+'\n')
process.exitCode=results.some(result=>result.status!==0)?1:0
