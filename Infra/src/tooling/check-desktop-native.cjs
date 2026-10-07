// Verify the shipped N-API ConPTY prebuild using the actual Electron runtime.
// This allows release builds to reuse a verified prebuild instead of needing MSVC.
const assert = require('node:assert/strict')
const path = require('node:path')
assert.equal(process.platform, 'win32')
assert.ok(process.versions.electron, 'Run this check with the target Electron executable')
const pty = require('node-pty')
const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
const terminal = pty.spawn(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "Write-Output ('AC_'+'CONPTY_OK'); Start-Sleep -Milliseconds 200"], {name:'xterm-256color',cols:80,rows:24,cwd:process.cwd(),env:process.env})
let output = '', completed = false
const timeout = setTimeout(() => { terminal.kill(); console.error('Electron ConPTY prebuild check timed out'); process.exit(1) }, 15000)
terminal.onData(data => { output += data })
terminal.resize(100, 30)
terminal.onExit(({exitCode}) => {
  if (completed) return
  completed = true
  clearTimeout(timeout)
  if (exitCode !== 0 || !output.includes('AC_CONPTY_OK')) { console.error('Electron ConPTY prebuild failed: '+output); process.exit(1) }
  console.log('PASS verified Electron '+process.versions.electron+' ConPTY N-API prebuild, output and resize')
  process.exit(0)
})
