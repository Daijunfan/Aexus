#!/usr/bin/env node
// Never replace an ASAR at a path still used by an Electron process: archive offsets are cached.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url),asar=require('@electron/asar')
const bundleId='com.agentscompany.app'
const plist=(app,key)=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :'+key,path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim()
export function runningApp(target) {
  return execFileSync('/bin/ps',['-axo','command='],{encoding:'utf8'}).split('\n').filter(line=>line.trim().startsWith(target+'/Contents/'))
}
export function installApp({source,target='/Applications/Agents Company.app',home=process.env.AGENTS_COMPANY_HOME||path.join(os.homedir(),'AgentsCompany')}) {
  source=path.resolve(source);target=path.resolve(target)
  if(source===target)throw new Error('Source and target must differ')
  const stopped=()=>{if(runningApp(target).length||runningApp(source).length)throw new Error('Close Agents Company before installing. Running applications cannot be replaced; no app files were changed.')}
  stopped()
  if(plist(source,'CFBundleIdentifier')!==bundleId||fs.existsSync(target)&&plist(target,'CFBundleIdentifier')!==bundleId)throw new Error('Unexpected application identity')
  const archive=path.join(source,'Contents/Resources/app.asar'),html=asar.extractFile(archive,'out/renderer/index.html').toString('utf8')
  if(!html.startsWith('<!doctype html>')||!html.includes('id="root"'))throw new Error('Invalid renderer HTML')
  for(const [,file] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g))if(!asar.extractFile(archive,'out/renderer/'+file).length)throw new Error('Empty renderer asset: '+file)
  const version=plist(source,'CFBundleShortVersionString'),stamp=Date.now().toString(),backups=path.join(home,'backups')
  const stage=path.join(path.dirname(target),'.Agents-Company-'+stamp+'-stage'),backup=path.join(backups,'AgentsCompany-before-'+version+'-'+stamp+'.backup')
  fs.mkdirSync(backups,{recursive:true})
  try {
    execFileSync('/usr/bin/ditto',[source,stage])
    if(!fs.readFileSync(path.join(stage,'Contents/Resources/app.asar')).equals(fs.readFileSync(archive)))throw new Error('Staged archive verification failed')
    stopped()
    const data=path.join(home,'sessions.json')
    if(fs.existsSync(data))fs.copyFileSync(data,path.join(backups,'before-'+version+'-'+stamp+'.json'))
    const existed=fs.existsSync(target)
    if(existed)fs.renameSync(target,backup)
    try{fs.renameSync(stage,target)}catch(error){if(existed)fs.renameSync(backup,target);throw error}
    if(target==='/Applications/Agents Company.app')execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',target])
    return {version,target,backup:existed?backup:null}
  }finally{fs.rmSync(stage,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1]
  try{if(!args.includes('--source'))throw new Error('Usage: npm run install:mac -- --source /path/Agents Company.app [--target /path/Agents Company.app]');console.log(JSON.stringify(installApp({source:value('--source'),target:args.includes('--target')?value('--target'):undefined}),null,2))}
  catch(error){console.error(error.message);process.exitCode=1}
}
