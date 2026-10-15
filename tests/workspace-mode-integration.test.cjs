const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const os=require('node:os')
const {spawn}=require('node:child_process')

const project=path.resolve(__dirname,'..')
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-mode-api-'))
const env={...process.env,CLOUD_HOSTS_HOME:home}

async function withServer(action) {
 const child=spawn(process.execPath,[path.join(project,'cli.cjs'),'serve'],{env,stdio:['ignore','pipe','pipe']})
 let pending='',lastError=''
 child.stderr.on('data',chunk=>{lastError=(lastError+chunk.toString()).slice(-1000)})
 const url=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('isolated server did not start: '+lastError)),10000)
   child.stdout.on('data',data=>{
     pending+=data.toString()
     for(const line of pending.split('\n').slice(0,-1)){
       try{const state=JSON.parse(line);if(state.ready&&state.url){clearTimeout(timeout);resolve(state.url)}}catch{}
     }
     pending=pending.slice(pending.lastIndexOf('\n')+1)
   })
   child.once('error',reject)
   child.once('exit',code=>reject(Error('server exited early: '+code+' '+lastError)))
 })
 const rpc=async(method,params={})=>{
   const response=await fetch(url+'rpc',{
     method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})
   })
   assert.equal(response.status,200)
   const value=await response.json()
   if(value.error)throw Error(value.error.message)
   return value.result
 }
 try{return await action({url,rpc})}
 finally{child.kill();await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);setTimeout(resolve,4000)})}
}

test('four CloudHosts modes persist across a real backend process restart',async()=>{
 try{
  await withServer(async({url,rpc})=>{
   const initial=await rpc('hosts.workspace')
   assert.equal(initial.mode,'single')
   assert.equal(initial.fileBoard.columns,2)
   assert.deepEqual(initial.viewOrder,['single','hosts-board','agent-board','role-board'])
   assert.equal(initial.hostsBoardMode,'board')
   assert.equal(initial.language,'en')
   assert.deepEqual(initial.agentBoard.rolePositions,{})
   assert.deepEqual(initial.agentBoard.roleOrder,{})
   assert.deepEqual(initial.agentBoard.roleOffsets,{})
   assert.equal((await rpc('hosts.workspace',{patch:{language:'zh'}})).language,'zh')
   await assert.rejects(rpc('hosts.workspace',{patch:{language:'fr'}}),/Invalid UI language/)
   assert.equal((await rpc('hosts.workspace')).language,'zh')
   const reordered=await rpc('hosts.workspace',{patch:{viewOrder:['agent-board','single','hosts-board','role-board']}})
   assert.deepEqual(reordered.viewOrder,['agent-board','single','hosts-board','role-board'])
   const files=await rpc('hosts.workspace',{patch:{mode:'file-board',fileBoardPatch:{columns:4,cardHeight:450,initialized:true}}})
   assert.equal(files.mode,'file-board')
   assert.equal(files.hostsBoardMode,'file-board')
   assert.equal(files.fileBoard.columns,4)
   assert.equal(files.fileBoard.cardHeight,450)
   assert.equal((await fetch(url+'agent-board.bundle.js')).status,200)
   assert.equal((await fetch(url+'bundle.js')).status,200)
   const agents=await rpc('hosts.workspace',{patch:{mode:'agent-board'}})
   assert.equal(agents.mode,'agent-board')
   assert.equal(agents.hostsBoardMode,'file-board','leaving Hosts Board retains its selected inner board')
   const savedRole=await rpc('hosts.workspace',{patch:{agentBoardPatch:{rolePositions:{'test-session':{x:1260,y:890}},roleOffsets:{local:{left:310,top:255}}}}})
   assert.deepEqual(savedRole.agentBoard.rolePositions['test-session'],{x:1260,y:890})
   assert.deepEqual(savedRole.agentBoard.roleOffsets.local,{left:310,top:255})
   const savedSlots=await rpc('hosts.workspace',{patch:{agentBoardPatch:{roleOrder:{local:['session-2','session-1']}}}})
   assert.deepEqual(savedSlots.agentBoard.roleOrder.local,['session-2','session-1'])
   assert.equal(agents.fileBoard.columns,4)
   assert.deepEqual(await rpc('hosts.agent-list'),[])
   assert.equal((await rpc('hosts.workspace',{patch:{mode:'board'}})).hostsBoardMode,'board')
   assert.equal((await rpc('hosts.workspace',{patch:{mode:'single'}})).hostsBoardMode,'board')
   assert.equal((await rpc('hosts.workspace',{patch:{mode:'agent-board'}})).mode,'agent-board')
  })
  await withServer(async({rpc})=>{
   const reloaded=await rpc('hosts.workspace')
   assert.equal(reloaded.mode,'agent-board')
   assert.equal(reloaded.fileBoard.columns,4)
   assert.deepEqual(reloaded.agentBoard.rolePositions['test-session'],{x:1260,y:890})
   assert.deepEqual(reloaded.agentBoard.roleOffsets.local,{left:310,top:255})
   assert.deepEqual(reloaded.agentBoard.roleOrder.local,['session-2','session-1'])
   await assert.rejects(rpc('hosts.workspace',{patch:{agentBoardPatch:{roleOrder:{local:['same','same']}}}}),/Invalid Agent role order/)
   await assert.rejects(rpc('hosts.workspace',{patch:{agentBoardPatch:{rolePositions:{oops:{x:-10,y:0}}}}}),/Invalid Agent role positions/)
   assert.deepEqual(reloaded.viewOrder,['agent-board','single','hosts-board','role-board'])
   assert.equal(reloaded.hostsBoardMode,'board')
   assert.equal(reloaded.language,'zh')
   assert.equal((await rpc('hosts.workspace',{patch:{language:'en'}})).language,'en')
   await assert.rejects(rpc('hosts.workspace',{patch:{viewOrder:['single','hosts-board','hosts-board']}}),/Invalid workspace view order/)
   await assert.rejects(rpc('hosts.workspace',{patch:{viewOrder:['single','board','file-board','agent-board']}}),/Invalid workspace view order/)
   await assert.rejects(rpc('hosts.workspace',{patch:{hostsBoardMode:'agent-board'}}),/Invalid Hosts Board view/)
   await assert.rejects(rpc('hosts.workspace',{patch:{viewOrder:['single','hosts-board']}}),/Invalid workspace view order/)
   assert.deepEqual((await rpc('hosts.workspace')).viewOrder,['agent-board','single','hosts-board','role-board'])
   assert.equal(reloaded.fileBoard.cardHeight,450)
   assert.deepEqual(await rpc('hosts.agent-list'),[])
   await assert.rejects(rpc('hosts.workspace',{patch:{mode:'unknown'}}),/Invalid workspace layout/)
   assert.equal((await rpc('hosts.workspace')).mode,'agent-board')
  })
  // Real users already have a saved four-button order. A subsequent process
  // must migrate that layout without resetting either board's data or mode.
  const layoutFile=path.join(home,'workspace.json')
  const legacy=JSON.parse(fs.readFileSync(layoutFile,'utf8'))
  legacy.viewOrder=['agent-board','file-board','single','board']
  legacy.mode='file-board'
  delete legacy.hostsBoardMode
  fs.writeFileSync(layoutFile,JSON.stringify(legacy))
  await withServer(async({rpc})=>{
   const migrated=await rpc('hosts.workspace')
   assert.deepEqual(migrated.viewOrder,['agent-board','hosts-board','single','role-board'])
   assert.equal(migrated.mode,'file-board')
   assert.equal(migrated.hostsBoardMode,'file-board')
   assert.equal(migrated.fileBoard.columns,4)
   assert.deepEqual(migrated.agentBoard.roleOrder.local,['session-2','session-1'])
   await rpc('hosts.workspace',{patch:{language:'zh'}})
  })
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutFile,'utf8')).viewOrder,['agent-board','hosts-board','single','role-board'])
 }finally{fs.rmSync(home,{recursive:true,force:true})}
})
