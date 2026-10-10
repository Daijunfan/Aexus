import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'

const binary=process.env.AGENTS_TEST_PI_BIN
if(!binary){console.log('SKIP set AGENTS_TEST_PI_BIN for native Pi shared-profile test');process.exit(0)}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-pi-shared-'))
process.env.AGENTS_COMPANY_HOME=path.join(temp,'state')
process.env.PI_CODING_AGENT_DIR=path.join(temp,'shared-pi')
process.env.PI_BIN=binary
const profile=process.env.PI_CODING_AGENT_DIR,privateDir=path.join(temp,'employee-pi')
fs.mkdirSync(profile,{recursive:true})
const files={
  'settings.json':{defaultProvider:'agents-company',defaultModel:'fixture-model'},
  'models.json':{providers:{'agents-company':{baseUrl:'http://127.0.0.1:1/v1',api:'openai-completions',models:[{id:'fixture-model'}]}}},
  'auth.json':{'agents-company':{type:'api_key',key:'fixture-key-not-real'}}
}
for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(profile,name),JSON.stringify(value),{mode:0o600})
const before=Object.fromEntries(Object.keys(files).map(name=>[name,fs.readFileSync(path.join(profile,name),'utf8')]))
const outfile=path.join(temp,'client.cjs')
await build({stdin:{contents:"export {piClient} from './Infra/src/main/engines/pi-client';export {configureEngine,processProvider,publicEngineConfiguration} from './Infra/src/main/engines/configuration'",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'cjs'})
let client
try{
  const {piClient,configureEngine,processProvider,publicEngineConfiguration}=createRequire(import.meta.url)(outfile)
  configureEngine('pi',{sharedPiConfig:true})
  assert.equal(publicEngineConfiguration('pi').hasApiKey,true)
  assert.deepEqual({provider:processProvider('pi').provider,model:processProvider('pi').model},{provider:'agents-company',model:'fixture-model'})
  client=piClient({cwd:temp,directory:privateDir})
  const catalog=await client.call('get_available_models'),state=await client.call('get_state')
  assert.ok(catalog.models.some(model=>model.provider==='agents-company'&&model.id==='fixture-model'))
  assert.ok(path.resolve(state.sessionFile).startsWith(path.resolve(profile,'sessions')+path.sep))
  assert.equal(fs.existsSync(path.join(privateDir,'models.json')),false)
  for(const [name,text] of Object.entries(before))assert.equal(fs.readFileSync(path.join(profile,name),'utf8'),text)
  console.log('PASS shared native Pi provider/auth/model and session directory')
}finally{await client?.close();fs.rmSync(temp,{recursive:true,force:true})}
