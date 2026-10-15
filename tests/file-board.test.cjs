const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const os=require('node:os')
const path=require('node:path')
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloud-file-board-'))
process.env.CLOUD_HOSTS_HOME=home
const registry=require('../src/registry.cjs')
const hosts=[
 registry.create({name:'Mac workstation',host:'test-mac',os:'macos',defaultDirectory:'/Users/test/project'}),
 registry.create({name:'Windows workstation',host:'test-win',os:'windows',defaultDirectory:'C:\\Users\\test'})
]
test('file board preserves separate host tabs and leaves terminal workgroups untouched',()=>{
 const initial=registry.workspace()
 assert.equal(initial.mode,'single')
 assert.deepEqual(initial.fileBoard.hosts,[])
 registry.workspace({boardPatch:{name:'Terminal group',hosts:[hosts[0].id],initialized:true}})
 const tabs={
  [hosts[0].id]:[{id:'one',path:'/Users/test/project'},{id:'two',path:'/Users/test/docs'}],
  [hosts[1].id]:[{id:'win',path:'C:\\Users\\test'}]
 }
 const active={[hosts[0].id]:'two',[hosts[1].id]:'win'}
 registry.workspace({mode:'file-board',fileBoardPatch:{hosts:hosts.map(h=>h.id),tabs,active,columns:2,sizes:{[hosts[0].id]:470},initialized:true}})
 const saved=registry.workspace()
 assert.equal(saved.mode,'file-board')
 assert.deepEqual(saved.fileBoard.tabs,tabs)
 assert.deepEqual(saved.fileBoard.active,active)
 assert.equal(saved.fileBoard.sizes[hosts[0].id],470)
 assert.deepEqual(saved.boards[0].hosts,[hosts[0].id])
 assert.equal(saved.boards[0].name,'Terminal group')
 registry.workspace({mode:'board'})
 assert.deepEqual(registry.workspace().fileBoard.tabs,tabs)
 assert.equal(registry.workspace().mode,'board')
})
test('bad file-board patches do not corrupt the persisted workspace',()=>{
 const before=registry.workspace()
 assert.throws(()=>registry.workspace({fileBoardPatch:{columns:7}}),/Invalid file board/)
 assert.throws(()=>registry.workspace({fileBoardPatch:{tabs:{[hosts[0].id]:[{id:'repeat',path:'/tmp'},{id:'repeat',path:'/tmp'}]}}}),/Invalid file tabs/)
 assert.deepEqual(registry.workspace(),before)
})
test('removed hosts are pruned from file board without altering remaining tabs',()=>{
 registry.remove(hosts[1].id)
 const state=registry.workspace()
 assert.deepEqual(state.fileBoard.hosts,[hosts[0].id])
 assert.deepEqual(Object.keys(state.fileBoard.tabs),[hosts[0].id])
 assert.deepEqual(state.fileBoard.active[hosts[0].id],'two')
})
test.after(()=>fs.rmSync(home,{recursive:true,force:true}))
