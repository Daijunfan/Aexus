const {test}=require('node:test')
const assert=require('node:assert/strict')
const {localPython,sshExecutable}=require('../src/ssh.cjs')

test('Windows file workspace launches the real python command, not the Store python3 alias',()=>{
  assert.equal(localPython('win32',''),'python')
})
test('macOS and Linux keep python3 for their existing SSH file workspaces',()=>{
  assert.equal(localPython('darwin',''),'python3')
  assert.equal(localPython('linux',''),'python3')
})
test('explicit Python override remains highest priority on all systems',()=>{
  const full=String.raw`C:\Program Files\Python313\python.exe`
  assert.equal(localPython('win32',full),full)
  assert.equal(localPython('darwin','/custom/python'),'/custom/python')
})
test('Windows piped SSH selects Git for Windows and respects explicit overrides',()=>{
  const prefix=String.raw`C:\Program Files`
  const git=String.raw`C:\Program Files\Git\usr\bin\ssh.exe`
  assert.equal(sshExecutable('win32',{ProgramFiles:prefix},candidate=>candidate===git),git)
  assert.equal(sshExecutable('win32',{ProgramFiles:prefix},()=>false),'ssh')
  assert.equal(sshExecutable('darwin',{},()=>true),'ssh')
  assert.equal(sshExecutable('win32',{CLOUD_HOSTS_SSH:String.raw`D:\Tools\ssh.exe`},()=>false),String.raw`D:\Tools\ssh.exe`)
})
