const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const root=path.resolve(__dirname,'..')
const source=filename=>fs.readFileSync(path.join(root,filename),'utf8')

test('Windows GUI starts Node without creating a console window',()=>{
  assert.match(source('Windows/CloudHostsApp.cs'),/CreateNoWindow\s*=\s*true/)
  assert.match(source('Windows/CloudHostsApp.cs'),/WindowStyle\s*=\s*ProcessWindowStyle\.Hidden/)
  assert.match(source('cli.cjs'),/windowsHide:\s*true/)
  assert.match(source('Windows/CloudHostsSilentService.cs'),/CreateNoWindow\s*=\s*true/)
  assert.match(source('Windows/build.cmd'),/target:winexe[^\n]*CloudHostsSilentService/)
  assert.match(source('Windows/build.cmd'),/target:winexe[^\n]*ConPtyTerminal/)
  assert.doesNotMatch(source('Windows/ConPtyTerminal.cs'),/Console\.OutputEncoding/)

})
test('every headless terminal, SSH check, file worker, and SSH tunnel suppresses Windows consoles',()=>{
  for(const [file,pattern] of [
    ['src/terminals.cjs',/spawn\(broker,\s*args,\s*\{[^}]*windowsHide:\s*true/],
    ['src/ssh.cjs',/spawn\(sshExecutable\(\),\s*argv,\s*\{[^}]*windowsHide:\s*true/],
    ['src/ssh.cjs',/spawn\(localPython\(\)[^;]*windowsHide:\s*true/],
    ['src/ssh.cjs',/spawn\('ssh-keyscan'[^;]*windowsHide:\s*true/],
    ['src/desktops.cjs',/spawn\)\("ssh",\s*args,\s*\{[^}]*windowsHide:\s*true/]
  ])assert.match(source(file),pattern,file+' must not create new consoles')
})
test('Python SSH subprocesses and remote Windows commands suppress console windows',()=>{
  const transport=source('Runtime/transport.py')
  assert.match(transport,/Popen\(server_command\(config\)[\s\S]*?creationflags=getattr\(subprocess, "CREATE_NO_WINDOW", 0\)/)
  assert.match(transport,/result = subprocess\.run\(server_command\(config\)[\s\S]*?creationflags=getattr\(subprocess, "CREATE_NO_WINDOW", 0\)/)
  assert.match(source('Runtime/remote.py'),/creationflags=getattr\(subprocess, "CREATE_NO_WINDOW", 0\) if self\.windows else 0/)
})
