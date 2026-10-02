// Exercise the real settings store in fresh processes, isolated from user state.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-theme-preferences-')),run=promisify(execFile),bundle=path.join(temp,'preferences.cjs'),home=path.join(temp,'state')
const env={...process.env,AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'work')}
try{
 await build({stdin:{contents:`import {getPreferences,setPreferences} from './src/main/store';import {readableThemeAccent} from './src/shared/preferences';const [operation,value,color]=process.argv.slice(2);if(operation==='set')setPreferences({theme:value,...(color?{themeColor:color}:{})});process.stdout.write(JSON.stringify(operation==='contrast'?readableThemeAccent(value):getPreferences()));`,resolveDir:root,loader:'ts'},outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
 const invoke=async(...args)=>JSON.parse((await run(process.execPath,[bundle,...args],{env})).stdout)
 assert.equal((await invoke('get')).theme,'violet')
 assert.equal((await invoke('get')).themeColor,'#7953ce')
 const file=path.join(home,'sessions.json')
 for(const theme of ['violet','blue','mint','teal','cyan','rose','coral','amber','indigo','graphite','white','light','space','black','midnight','sage']){
  assert.equal((await invoke('set',theme)).theme,theme)
  assert.equal((await invoke('get')).theme,theme,'theme survives a new process')
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).preferences.theme,theme)
 }
 await invoke('set','custom','#BF527F');assert.equal((await invoke('get')).themeColor,'#BF527F')
 for(const [theme,color] of [['unknown','#bf527f'],['custom','#abc'],['custom','red'],['custom','#gg1122']]){
  const before=fs.readFileSync(file,'utf8')
  await assert.rejects(()=>invoke('set',theme,color),/Unknown theme|six-digit hex/)
  assert.equal(fs.readFileSync(file,'utf8'),before,'invalid theme/color must not write partial preferences')
 }
 for(const color of ['#ffffff','#ffff00','#00ff00','#ffaa00','#ff00ff','#000000','#7953ce','#2479c4','#2e825c']){
  const accent=await invoke('contrast',color),rgb=[1,3,5].map(at=>parseInt(accent.slice(at,at+2),16)/255),linear=rgb.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4),luminance=linear[0]*.2126+linear[1]*.7152+linear[2]*.0722
  assert.ok(1.05/(luminance+.05)>=4.5,`${color} accent remains readable on white`)
  if(['#000000','#7953ce','#2479c4','#2e825c'].includes(color))assert.equal(accent,color,'already readable colors stay unchanged')
 }
 const state=JSON.parse(fs.readFileSync(file,'utf8'));assert.deepEqual(state.groups,[]);assert.deepEqual(state.sessions,[])
 console.log('PASS settings persistence: default Violet, ten palettes, six legacy IDs, custom hex color, new-process reload, invalid updates leave state unchanged, custom white/yellow/black accent contrast; no models or real user state')
}finally{fs.rmSync(temp,{recursive:true,force:true})}
