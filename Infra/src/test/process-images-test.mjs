import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const fixture=path.resolve('Infra/src/test/fixtures/process-adapter.cjs'),f=await fixtureCore({CLINE_BIN:fixture,PI_BIN:fixture})
const rpc=async(cmd,args={})=>{const value=await f.request(null,cmd,args);assert.ok(value.ok,value.error);return value.data}
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='
const idle=card=>f.until(async()=>!(await f.status(card.id)).busy,'image turn')
try{
 await f.cli('group','add','Images')
 for(const engine of ['cline','pi']){
  await rpc('engine.configure',{engine,patch:{apiKey:'fixture-key-not-real'}})
  const card=await f.cli('card','create','--title',engine,'--group','Images','--engine',engine)
  await f.ready(card.id)
  await rpc('workspace.write',{employee:card.id,path:'image.png',contentBase64:png,create:true})
  const {sessionId}=await f.cli('session','open',card.id)
  if(engine==='pi'){
   const rejected=await f.request(null,'session.send',{employee:card.id,text:'image',images:['image.png']});assert.equal(rejected.ok,false);assert.match(rejected.error,/不支持图片/);continue
  }
  const info=await f.cli('session','info','--employee',card.id)
  assert.ok(info.models.find(m=>m.value==='deepseek-flash').inputModalities.includes('image'))
  assert.deepEqual(info.models.find(m=>m.value==='deepseek-v4-pro').inputModalities,['text'])
  await f.cli('config','model',sessionId,'deepseek-v4-pro')
  const rejected=await f.request(null,'session.send',{employee:card.id,text:'image',images:['image.png']});assert.equal(rejected.ok,false);assert.match(rejected.error,/不支持图片/)
  await f.cli('config','model',sessionId,'deepseek-flash')
  await rpc('session.send',{employee:card.id,text:'',images:['image.png']});await idle(card)
  const imageTranscript=await f.cli('session','transcript','--employee',card.id)
  assert.ok(JSON.stringify(imageTranscript).includes('IMAGE_RECEIVED 1'),JSON.stringify({error:(await f.cli('session','snapshot',(await f.status(card.id)).sessionId)).error,text:imageTranscript.text}))
  const current=(await f.cli('session','list')).sessions.find(c=>c.id===card.id),wire=JSON.parse(fs.readFileSync(path.join(current.clineConfigRoot,'fixture-image-request.json')))
  assert.equal(wire.messages[0].content.find(p=>p.type==='image_url').image_url.url,'data:image/png;base64,'+png)
  assert.equal((await f.request(null,'session.send',{employee:card.id,text:'too many',images:Array(17).fill('image.png')})).ok,false)
  assert.equal((await f.request(null,'session.send',{employee:card.id,text:'outside',images:['../outside.png']})).ok,false)
  await rpc('session.send',{employee:card.id,text:'QUEUE_FIXTURE'})
  await rpc('session.enqueue',{employee:card.id,text:'queued image',images:['image.png']})
  await f.until(async()=>JSON.stringify(await f.cli('session','transcript','--employee',card.id)).match(/IMAGE_RECEIVED 1/g)?.length>=2,'queued image delivered');await idle(card)
  assert.equal((await f.cli('session','snapshot',(await f.status(card.id)).sessionId)).error,undefined)
  await f.cli('card','remove',card.id);assert.ok(!fs.existsSync(current.clineConfigRoot),'image snapshots follow existing employee-profile cleanup')
 }
 console.log('PASS Cline Flash image-only and queued input, actual projected bytes, Pro/Pi text-only rejection, attachment scope/count checks and employee-profile cleanup')
}finally{await f.close()}
