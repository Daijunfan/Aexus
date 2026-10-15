const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')

const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(require.resolve('../ui/desktop-capabilities.js')).toString('base64'))

test('macOS and Windows expose their desktop setup pages',async()=>{
 const {supportsDesktop}=await modulePromise
 assert.equal(supportsDesktop({id:'mac',os:'macos'}),true)
 assert.equal(supportsDesktop({id:'pc',os:'windows'}),true)
 assert.equal(supportsDesktop({id:'linux',os:'linux'}),false)
 assert.equal(supportsDesktop({id:'linux',os:'linux',desktop:{protocol:'vnc'}}),true)
 assert.equal(supportsDesktop(null),false)
})

test('existing macOS host defaults to VNC over its own SSH tunnel',async()=>{
 const {desktopDefaults}=await modulePromise
 assert.deepEqual(desktopDefaults({id:'mac-host',os:'macos'}),{
   protocol:'vnc',address:'127.0.0.1',port:5900,viaHostId:'mac-host'
 })
 assert.deepEqual(desktopDefaults({os:'macos'}),{
   protocol:'',address:'127.0.0.1',port:5900,viaHostId:''
 })
})

test('explicit desktop settings are never replaced by macOS defaults',async()=>{
 const {desktopDefaults}=await modulePromise
 assert.deepEqual(desktopDefaults({id:'mac',os:'macos',desktop:{protocol:'vnc',address:'10.0.0.2',port:5901,viaHostId:'jump'}}),{
   protocol:'vnc',address:'10.0.0.2',port:5901,viaHostId:'jump'
 })
 assert.deepEqual(desktopDefaults({id:'win',os:'windows',desktop:{protocol:'rdp',address:'127.0.0.1',port:3390}}),{
   protocol:'rdp',address:'127.0.0.1',port:3390,viaHostId:''
 })
})

test('macOS VNC self-tunnel can be stored and retrieved without network access',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-mac-host-'))
 const registryPath=require.resolve('../src/registry.cjs')
 const previous=process.env.CLOUD_HOSTS_HOME
 try{
  process.env.CLOUD_HOSTS_HOME=home
  delete require.cache[registryPath]
  const registry=require('../src/registry.cjs')
  const h=registry.create({name:'fixture-mac',host:'mac.example.invalid',os:'macos',defaultDirectory:'/Users/example'})
  const profile={protocol:'vnc',address:'127.0.0.1',port:5900,viaHostId:h.id}
  registry.update(h.id,{desktop:profile})
  assert.deepEqual(registry.get(h.id).desktop,profile)
  assert.equal(registry.target(h.id).os,'macos')
 }finally{
  if(previous===undefined)delete process.env.CLOUD_HOSTS_HOME
  else process.env.CLOUD_HOSTS_HOME=previous
  delete require.cache[registryPath]
  fs.rmSync(home,{recursive:true,force:true})
 }
})
