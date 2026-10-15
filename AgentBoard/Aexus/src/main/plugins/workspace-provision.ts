import fs from 'node:fs'
import path from 'node:path'
import type {TeamSettings} from '../../shared/types'
import {requirePlugin} from './registry'
import {ensureApiDocuments} from '../api-documents'

/** Remove only our old root instruction blocks; retain user-authored instructions and files. */
export function retireRootInstructions(root:string){
 for(const name of ['AGENTS.md','CLAUDE.md']){
  const file=path.join(root,name);if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())continue
  const before=fs.readFileSync(file,'utf8');let after=before
  for(const kind of ['workspace','control']){
   const begin=`<!-- agents-company:${kind}:start -->`,end=`<!-- agents-company:${kind}:end -->`,a=after.indexOf(begin),b=after.indexOf(end)
   if(a>=0&&b>=a)after=after.slice(0,a)+after.slice(b+end.length)
  }
  if(after!==before){if(after.trim())fs.writeFileSync(file,after);else fs.unlinkSync(file)}
 }
}

export function provisionWorkspace(root:string,settings:TeamSettings,teamRoot=root){
 root=fs.realpathSync(root);teamRoot=fs.realpathSync(teamRoot);retireRootInstructions(root)
 const plugins=settings.mode==='work'?[requirePlugin(settings.pluginId!)]:[]
 return {schemaVersion:3,mode:settings.mode,workspace:root,teamRoot,documentation:ensureApiDocuments(),plugins:plugins.map(plugin=>({id:plugin.id,name:plugin.name,version:plugin.version,documentation:'plugin/'+plugin.id+'/api'}))}
}
