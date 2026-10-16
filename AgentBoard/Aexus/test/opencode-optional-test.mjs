// Isolated HOME/config fixture: unconfigured OpenCode returns list/detect metadata
// without disturbing the other four engines, while a real start still fails clearly.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-opencode-optional-')),require=createRequire(import.meta.url)
const save=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value))}
const home=path.join(temp,'home'),clineDir=path.join(temp,'cline'),piDir=path.join(temp,'pi')
// The other native engines stay configured; OpenCode has no credential store at all.
save(path.join(clineDir,'data/settings/providers.json'),{version:1,lastUsedProvider:'deepseek',providers:{deepseek:{settings:{provider:'deepseek',model:'deepseek-flash',apiKey:'fixture-cline-key'}}}})
save(path.join(piDir,'settings.json'),{defaultProvider:'deepseek',defaultModel:'deepseek-flash'})
save(path.join(piDir,'models.json'),{providers:{}})
save(path.join(piDir,'auth.json'),{deepseek:{key:'fixture-pi-key'}})
const previous={}
for(const [name,value] of Object.entries({HOME:home,AGENTS_COMPANY_HOME:path.join(temp,'state'),AGENTS_COMPANY_EMBEDDED:'1',AGENTS_COMPANY_PACKAGE_ROOT:root,CLINE_DIR:clineDir,CLINE_DATA_DIR:path.join(clineDir,'data'),PI_CODING_AGENT_DIR:piDir})){previous[name]=process.env[name];process.env[name]=value}
fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
try{
  const entry=path.join(temp,'helpers.cjs')
  await build({stdin:{contents:"export {engineList} from './src/main/engines/registry';export {engineNativeProfile,publicEngineConfiguration,engineEnvironment} from './src/main/engines/configuration';export {engineInstallPlan} from './src/main/engines/installer';export {openOpenCode} from './src/main/engines/opencode-runtime'",resolveDir:root},outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'})
  const api=require(entry)
  // engine.list maps every engine; unconfigured OpenCode must yield metadata, not an error.
  const list=api.engineList()
  assert.deepEqual(list.map(item=>item.engine).sort(),['claude','cline','codex','opencode','pi'])
  const opencode=list.find(item=>item.engine==='opencode').configuration
  assert.equal(opencode.hasApiKey,false);assert.equal(opencode.baseUrl,undefined);assert.equal(opencode.model,undefined)
  // The other four engines keep their own native configuration untouched.
  const cline=list.find(item=>item.engine==='cline').configuration
  assert.equal(cline.hasApiKey,true);assert.equal(cline.model,'deepseek-flash')
  const pi=list.find(item=>item.engine==='pi').configuration
  assert.equal(pi.hasApiKey,true);assert.equal(pi.model,'deepseek-flash')
  assert.equal(list.find(item=>item.engine==='codex').configuration.hasApiKey,false)
  assert.equal(list.find(item=>item.engine==='claude').configuration.hasApiKey,false)
  // A real start still fails clearly: engineEnvironment surfaces no key, and the
  // unchanged runtime check in opencode-runtime throws the same auth error.
  assert.equal(api.engineEnvironment('opencode').DEEPSEEK_API_KEY,undefined)
  await assert.rejects(()=>api.openOpenCode({}),/Configure native OpenCode first \(opencode auth login\)/)
  // A genuinely corrupted native file is still surfaced, not swallowed as unconfigured.
  const authPath=path.join(home,'.local','share','opencode','auth.json')
  fs.mkdirSync(path.dirname(authPath),{recursive:true});fs.writeFileSync(authPath,'{not-json')
  assert.throws(()=>api.engineNativeProfile('opencode'),error=>error.code==='STATE_CORRUPT')
  fs.rmSync(path.dirname(authPath),{recursive:true,force:true})
  // Current platform (darwin/arm64) resolves the verified official recipe.
  const current=api.engineInstallPlan('opencode')
  assert.equal(current.package,'opencode-darwin-arm64');assert.equal(current.version,'1.19.0');assert.equal(current.executable,'bin/opencode')
  assert.equal(current.integrity,'sha512-Tu13SSLE29V0sM2nKxJXA/IZzTxBf+ctEBrtyDCkhbpAyJIq75YduSbDhfQxUPOMnFEZjU1QxDt8gFieLRnSEg==')
  assert.equal(current.nativeDownload,true);assert.deepEqual(current.requires,[]);assert.equal(current.changesGlobalPath,false);assert.equal(current.runsPackageScripts,false);assert.equal(current.target,'Core host')
  // Windows/Linux recipes resolve on their official platform/arch pairs. OpenCode also
  // publishes musl variants, but the installer's musl auto-select is claude-only, so a
  // Linux OpenCode install resolves the glibc entry (pre-existing, documented limitation).
  const expected={
    'darwin/x64':['opencode-darwin-x64','bin/opencode'],
    'linux/x64':['opencode-linux-x64','bin/opencode'],
    'linux/arm64':['opencode-linux-arm64','bin/opencode'],
    'win32/x64':['opencode-windows-x64','bin/opencode.exe'],
    'win32/arm64':['opencode-windows-arm64','bin/opencode.exe']
  }
  const originalPlatform=process.platform,originalArch=process.arch
  try{
    for(const [pair,[pkg,exe]] of Object.entries(expected)){
      const [platform,arch]=pair.split('/')
      Object.defineProperty(process,'platform',{value:platform,configurable:true})
      Object.defineProperty(process,'arch',{value:arch,configurable:true})
      const plan=api.engineInstallPlan('opencode')
      assert.equal(plan.package,pkg,pair+' package');assert.equal(plan.executable,exe,pair+' executable');assert.match(plan.integrity,/^sha512-[A-Za-z0-9+/]+=*$/)
    }
  }finally{
    Object.defineProperty(process,'platform',{value:originalPlatform,configurable:true})
    Object.defineProperty(process,'arch',{value:originalArch,configurable:true})
  }
  console.log('PASS unconfigured OpenCode lists all engines, other config untouched, start still fails, official recipes resolve for darwin/linux/win32')
}finally{
  for(const [name,value] of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value
  fs.rmSync(temp,{recursive:true,force:true})
}
