import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import assert from 'node:assert/strict'
import {installApp,runningApp} from '../tooling/install-app.mjs'
const require=createRequire(import.meta.url),asar=require('@electron/asar'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-inst-'))
const target=path.join(temp,'Avalon.app'),legacy=path.join(temp,'Anexus.app'),source=path.join(temp,'candidate.app'),home=path.join(temp,'data')
async function bundle(app,version){
 const content=path.join(temp,'content-'+version);fs.mkdirSync(path.join(content,'.aexus/out/renderer/assets'),{recursive:true})
 fs.writeFileSync(path.join(content,'.aexus/out/renderer/index.html'),'<!doctype html><div id="root"></div><script src="./assets/app.js"></script>')
 fs.writeFileSync(path.join(content,'.aexus/out/renderer/assets/app.js'),'window.version='+JSON.stringify(version))
 fs.mkdirSync(path.join(app,'Contents/Resources'),{recursive:true});fs.mkdirSync(path.join(app,'Contents/MacOS'))
 fs.writeFileSync(path.join(app,'Contents/Info.plist'),`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.agentscompany.app</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`)
 await asar.createPackage(content,path.join(app,'Contents/Resources/app.asar'))
}
let process_
try{
 await bundle(target,'1');await bundle(source,'2');fs.mkdirSync(home);fs.writeFileSync(path.join(home,'sessions.json'),'original data')
 const before=fs.readFileSync(path.join(target,'Contents/Resources/app.asar'))
 process_=spawn('/bin/sleep',['30'],{argv0:path.join(target,'Contents/MacOS/Anexus')})
 await new Promise(r=>process_.once('spawn',r))
 assert.ok(runningApp(target).length)
 assert.throws(()=>installApp({source,target,home}),/Running applications cannot be replaced/)
 assert.ok(fs.readFileSync(path.join(target,'Contents/Resources/app.asar')).equals(before))
 assert.equal(fs.existsSync(path.join(home,'backups')),false)
 console.log('PASS installer refuses a running app before changing files or metadata')
 const ended=new Promise(r=>process_.once('exit',r));process_.kill();await ended;process_=undefined
 const result=installApp({source,target,home})
 assert.equal(result.version,'2');assert.ok(fs.readFileSync(path.join(result.backup,'Contents/Resources/app.asar')).equals(before))
 assert.equal(fs.readFileSync(path.join(home,'sessions.json'),'utf8'),'original data')
 // asar caches by pathname too: inspect via a fresh process/path-independent file read.
 assert.ok(fs.readFileSync(path.join(target,'Contents/Resources/app.asar')).equals(fs.readFileSync(path.join(source,'Contents/Resources/app.asar'))))
 console.log('PASS stopped-app installation stages, verifies and backs up the app while preserving user data')
 fs.renameSync(target,legacy)
 process_=spawn('/bin/sleep',['30'],{argv0:path.join(legacy,'Contents/MacOS/Agents Company')})
 await new Promise(r=>process_.once('spawn',r))
 assert.throws(()=>installApp({source,target,home}),/Running applications cannot be replaced/)
 assert.equal(fs.existsSync(target),false);assert.ok(fs.existsSync(legacy))
 const legacyEnded=new Promise(r=>process_.once('exit',r));process_.kill();await legacyEnded;process_=undefined
 const migrated=installApp({source,target,home})
 assert.ok(fs.existsSync(target));assert.equal(fs.existsSync(legacy),false);assert.ok(fs.existsSync(migrated.legacyBackup))
 assert.equal(migrated.backup,migrated.legacyBackup)
 assert.equal(fs.readFileSync(path.join(home,'sessions.json'),'utf8'),'original data')
 console.log('PASS Avalon upgrade refuses a running legacy app and preserves its bundle in a backup')
 const renamed=path.join(temp,'Aexus.app')
 process_=spawn('/bin/sleep',['30'],{argv0:path.join(target,'Contents/MacOS/Anexus')})
 await new Promise(r=>process_.once('spawn',r))
 assert.throws(()=>installApp({source,target:renamed,home}),/Running applications cannot be replaced/)
 const renameEnded=new Promise(r=>process_.once('exit',r));process_.kill();await renameEnded;process_=undefined
 const upgraded=installApp({source,target:renamed,home})
 assert.ok(fs.existsSync(renamed));assert.equal(fs.existsSync(target),false)
 assert.ok(fs.existsSync(upgraded.legacyBackup));assert.equal(fs.readFileSync(path.join(home,'sessions.json'),'utf8'),'original data')
 console.log('PASS Aexus upgrade detects the running Avalon app and safely migrates its bundle')
}finally{process_?.kill();fs.rmSync(temp,{recursive:true,force:true})}
