import {build} from 'esbuild'
import {createRequire} from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-activity-'))
try{
 await build({entryPoints:['src/shared/activity.ts','src/shared/transcript.ts'],outdir:temp,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const require=createRequire(import.meta.url),{activityPreview}=require(path.join(temp,'activity.js')),{applyStream}=require(path.join(temp,'transcript.js'))
 let session={busy:true,items:[{role:'assistant',id:'old',blocks:[{kind:'text',text:'previous turn'}]},{role:'user',id:'user',text:'current task'}]}
 assert.deepEqual(activityPreview(session),{kind:'tool',tool:'Task',text:'current task',running:true})
 assert.equal(activityPreview({...session,items:[{role:'user',id:'empty',text:'   '}]}),null)
 assert.equal(activityPreview({...session,busy:false}),null)
 const event=e=>{session=applyStream(session,{event:e})}
 event({type:'content_block_start',index:0,content_block:{type:'thinking'}});event({type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'Published reasoning summary'}})
 assert.deepEqual(activityPreview(session),{kind:'thinking',text:'Published reasoning summary'})
 event({type:'content_block_start',index:1,content_block:{type:'text'}});event({type:'content_block_delta',index:1,delta:{type:'text_delta',text:'I will check the source.'}})
 assert.equal(activityPreview(session).kind,'speech')
 event({type:'content_block_start',index:2,content_block:{type:'tool_use',id:'tool',name:'Read'}});event({type:'content_block_delta',index:2,delta:{type:'input_json_delta',partial_json:'{"file_path":"src/main.ts"}'}})
 assert.equal(activityPreview(session).kind,'tool');assert.equal(activityPreview(session).text,'src/main.ts');assert.equal(activityPreview({...session,busy:false}),null)
 console.log('PASS actual submitted-task fallback, Claude published-thinking/text/tool priority, current-turn isolation and idle clearing')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
