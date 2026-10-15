#!/usr/bin/env node
// Pin the packaged Core and renderer, with a disposable Electron test shell for
// inherited desktop suites. No file inside the candidate is built or written.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict')
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto'),{pathToFileURL}=require('node:url')
const ROOT=path.resolve(__dirname,'..'),SOURCE=path.join(ROOT,'AgentBoard/Aexus')
const APP=path.resolve(process.argv[2]||path.join(ROOT,'artifacts/Aexus.app'))
const BACKEND=path.join(APP,'Contents/Resources/backend'),PACKAGED=path.join(BACKEND,'AgentBoard/Aexus')
const OUT=path.resolve(process.env.QA_BUSINESS_FINAL_OUT||path.join(ROOT,'artifacts/full-acceptance-20261015/final-business'))
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex')
function hashes(directory){
 const result={};const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())walk(file);else if(item.isFile())result[path.relative(directory,file)]=digest(file)}};walk(directory);return result
}
let child,stage
const stop=signal=>{if(child)child.kill(signal)}
process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'))
;(async()=>{
 fs.mkdirSync(OUT,{recursive:true})
 const release=require(path.join(BACKEND,'src/release.cjs')).verify(BACKEND)
 if(process.env.QA_EXPECT_BUILD_ID)assert.equal(release.buildId,process.env.QA_EXPECT_BUILD_ID,'candidate pin changed')
 stage=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'aexus-final-business-')))
 const core=path.join(stage,'core'),runtime=path.join(stage,'runtime'),saved=path.join(stage,'packaged-out')
 fs.cpSync(PACKAGED,core,{recursive:true,filter:file=>!['node_modules','artifacts','test-results','__pycache__'].includes(path.basename(file))})
 fs.cpSync(core,runtime,{recursive:true})
 fs.symlinkSync(path.join(PACKAGED,'node_modules'),path.join(runtime,'node_modules'),'dir')
 fs.cpSync(path.join(PACKAGED,'out'),saved,{recursive:true})
 fs.cpSync(path.join(SOURCE,'test'),path.join(core,'test'),{recursive:true})
 fs.mkdirSync(path.join(OUT,'generated'),{recursive:true});fs.symlinkSync(path.join(OUT,'generated'),path.join(core,'artifacts'),'dir')
 // Frontend fixtures need one React graph. Runtime modules stay separately pinned.
 fs.symlinkSync(path.join(SOURCE,'node_modules'),path.join(core,'node_modules'),'dir')
 const pin={app:APP,backend:BACKEND,...release,core,runtimeCore:runtime,createdAt:new Date().toISOString(),packagedOutput:hashes(saved),candidateSource:hashes(path.join(PACKAGED,'src'))}
 const pinPath=path.join(OUT,'candidate-pin.json')
 fs.writeFileSync(pinPath,JSON.stringify(pin,null,2)+'\n')
 // The unified native app uses the standalone daemon. Its unused Electron
 // index/chunks are not acceptance evidence. Build a test-only IPC shell from
 // the frozen candidate source, then restore every shipped daemon/worker/UI byte.
 const {build}=await import(pathToFileURL(require.resolve('electron-vite',{paths:[SOURCE]})))
 process.chdir(core)
 await build({configFile:path.join(core,'electron.vite.config.ts'),logLevel:'error'})
 fs.rmSync(path.join(core,'out/renderer'),{recursive:true,force:true})
 fs.cpSync(path.join(saved,'renderer'),path.join(core,'out/renderer'),{recursive:true})
 for(const file of ['daemon.js','asset-index-worker.js','asset-preview-worker.js','message-index-worker.js']){
  fs.rmSync(path.join(core,'out/main',file));fs.symlinkSync(path.join(runtime,'out/main',file),path.join(core,'out/main',file))
  assert.equal(digest(path.join(core,'out/main',file)),pin.packagedOutput['main/'+file])
 }
 assert.deepEqual(hashes(path.join(core,'out/renderer')),hashes(path.join(saved,'renderer')))
 pin.electronShellOutput=hashes(path.join(core,'out/main'));pin.testSource=hashes(path.join(core,'test'))
 fs.writeFileSync(pinPath,JSON.stringify(pin,null,2)+'\n')
 process.chdir(ROOT)
 const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',QA_BUSINESS_CORE:core,QA_BUSINESS_OUT:OUT,QA_BUSINESS_PIN:pinPath,AGENTS_COMPANY_PROFILE_APPLICATION:core,AGENTS_COMPANY_TEST_CORE_ENTRY:path.join(runtime,'out/main/daemon.js')}
 delete env.AGENTS_COMPANY_TEST_APP;delete env.ELECTRON_OVERRIDE_DIST_PATH
 const args=[path.join(ROOT,'tests/qa-business-ui-runner.cjs'),'--group','all','--concurrency',process.env.QA_BUSINESS_CONCURRENCY||'2','--timeout','420000']
 if(process.env.QA_BUSINESS_ONLY)args.push('--only',process.env.QA_BUSINESS_ONLY)
 child=spawn(path.join(APP,'Contents/Resources/node'),args,{cwd:ROOT,env,stdio:'inherit'})
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)})
 child=undefined
 assert.equal(require(path.join(BACKEND,'src/release.cjs')).verify(BACKEND).buildId,pin.buildId,'candidate changed during business acceptance')
 fs.writeFileSync(path.join(OUT,'candidate-after.json'),JSON.stringify({app:APP,...release,verified:true,suiteExitCode:code,finishedAt:new Date().toISOString()},null,2)+'\n')
 process.exitCode=code??1
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{
 if(stage){fs.rmSync(stage,{recursive:true,force:true});fs.writeFileSync(path.join(OUT,'cleanup.json'),JSON.stringify({stage,removed:!fs.existsSync(stage)},null,2)+'\n')}
})
