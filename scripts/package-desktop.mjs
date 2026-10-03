import path from 'node:path'
import fs from 'node:fs'
import spawn from 'cross-spawn'
const root=path.resolve(import.meta.dirname,'..'),development=process.argv.includes('--development'),directory=process.argv.includes('--dir')
const platform=process.argv.includes('--win')?'win':process.argv.includes('--linux')?'linux':process.argv.includes('--mac')?'mac':process.platform==='darwin'?'mac':process.platform==='win32'?'win':'linux'
function run(command,args,env={}){const result=spawn.sync(command,args,{cwd:root,stdio:'inherit',env:{...process.env,...env}});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1)}
const nativePlatform=process.platform==='darwin'?'mac':process.platform==='win32'?'win':'linux'
if(platform!==nativePlatform)throw Error('Build the desktop package on its target OS so native engine and terminal dependencies match; use the platform CI runner.')
run(process.execPath,['scripts/release-check.mjs',...(development?['--technical']:[])])
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
const review=JSON.parse(fs.readFileSync(path.join(root,'licenses/release-review.json'),'utf8'))
fs.mkdirSync(path.join(root,'build'),{recursive:true})
fs.writeFileSync(path.join(root,'build/DISTRIBUTION.json'),JSON.stringify({version:pkg.version,platform:process.platform,arch:process.arch,candidate:development,plugins:JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8')).plugins,pendingReviews:review.reviews.filter(item=>item.status!=='approved').map(item=>item.id)},null,2)+'\n')
run(process.execPath,['scripts/build-icon.mjs'])
run(process.execPath,['scripts/build-pet-previews.mjs'])
// A private candidate bypasses only pending redistribution reviews, not portability.
run(process.execPath,['scripts/build-plugins.mjs','--release'])
run('npx',['--no-install','electron-vite','build'],{AGENTS_COMPANY_RELEASE:'1'})
// Do not ship a developer-specific global CLI wrapper; regenerate a portable one.
fs.mkdirSync(path.join(root,'build/cli'),{recursive:true})
const cliRoot=path.join(root,'build/cli')
for(const name of ['agents','agents.cmd','anexus','anexus.cmd'])fs.rmSync(path.join(cliRoot,name),{force:true})
if(platform==='win'){
  for(const name of ['agents.cmd','anexus.cmd'])fs.writeFileSync(path.join(cliRoot,name),'@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n"%~dp0..\\..\\Anexus.exe" "%~dp0..\\app.asar\\bin\\agents" %*\r\n')
}else{
  const program=platform==='mac'?'$ROOT/MacOS/Anexus':'$ROOT/agents-company'
  const script=platform==='mac'?'$ROOT/Resources/app.asar/bin/agents':'$ROOT/resources/app.asar/bin/agents'
  const cli=`#!/bin/sh\nROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"\nexec env ELECTRON_RUN_AS_NODE=1 "${program}" "${script}" "$@"\n`
  for(const name of ['agents','anexus'])fs.writeFileSync(path.join(cliRoot,name),cli,{mode:0o755})
}
const nativeOptions=[]
// Local macOS candidates need a fresh signature after Electron's bundle is renamed.
if(platform==='mac'&&development)nativeOptions.push('--config.mac.identity=-')
if(platform==='win'){
  // node-pty 1.1 uses N-API prebuilds. Verify the actual Electron runtime before
  // skipping the redundant rebuild; a missing or incompatible module stops packaging.
  run(path.join(root,'node_modules/electron/dist/electron.exe'),[path.join(root,'scripts/check-desktop-native.cjs')],{ELECTRON_RUN_AS_NODE:'1'})
  nativeOptions.push('--config.npmRebuild=false')
}
// Packaging never publishes implicitly when CI is set; publication is a separate action.
run('npx',['--no-install','electron-builder','--'+platform,'--publish','never',...nativeOptions,...(directory?['--dir']:[])])
