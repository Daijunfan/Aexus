import {fileVersion,readSourceText} from '../read-cache'
import {applicationRoot} from '../resources'
import fs from 'node:fs'
import path from 'node:path'
import { APP_HOME } from '../../shared/protocol'
import type { PluginDescriptor, PluginManifest } from '../../shared/plugins'

const descriptorCache=new Map<string,{manifestVersion:string;entries:{relative:string;canonical:string;version:string}[];plugin:PluginDescriptor}>()
export const PLUGIN_MANIFEST='agents-company.plugin.json'
export function pluginFile(directory:string,relative:string):string {
  if(!relative||path.isAbsolute(relative))throw new Error('Plugin paths must be relative')
  const root=fs.realpathSync(directory),file=fs.realpathSync(path.resolve(root,relative))
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw new Error('Plugin entry escapes its package')
  return file
}
export function readPlugin(directory:string):PluginDescriptor {
  directory=fs.realpathSync(directory)
  const manifestFile=path.join(directory,PLUGIN_MANIFEST),manifestVersion=fileVersion(manifestFile),previous=descriptorCache.get(directory)
  if(previous?.manifestVersion===manifestVersion&&previous.entries.every(entry=>pluginFile(directory,entry.relative)===entry.canonical&&fileVersion(entry.canonical)===entry.version))return structuredClone(previous.plugin)
  const manifest=JSON.parse(readSourceText(manifestFile)) as PluginManifest
  if(manifest.schemaVersion!==1)throw new Error('Unsupported plugin schemaVersion')
  if(!/^[a-z][a-z0-9-]*$/.test(manifest.id)||!manifest.name||!manifest.version)throw new Error('Invalid plugin identity')
  if(manifest.scope&&!['workspace','application'].includes(manifest.scope))throw new Error('Invalid plugin scope')
  if(manifest.defaultWorkspace!==undefined&&!['default','collection'].includes(manifest.defaultWorkspace))throw new Error('Invalid plugin defaultWorkspace')
  if(manifest.workspaceDirectory&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(manifest.workspaceDirectory))throw new Error('Invalid plugin workspaceDirectory')
  for(const key of ['runtime','renderer','cli','documentation','schema'] as const)pluginFile(directory,manifest[key])
  const schema=JSON.parse(readSourceText(pluginFile(directory,manifest.schema)))
  if(schema.schemaVersion!==1||schema.pluginId!==manifest.id||schema.version!==manifest.version||!Array.isArray(schema.commands)||!schema.commands.length||schema.commands.some((c:any)=>(c.agentAccess!==undefined&&!['workspace','operator'].includes(c.agentAccess))||typeof c.method!=='string'||!c.method.trim()||typeof c.description!=='string'||!c.description.trim())||new Set(schema.commands.map((c:any)=>c.method)).size!==schema.commands.length)throw new Error('Invalid plugin command schema: every plugin must declare its CLI API')
  const docs=readSourceText(pluginFile(directory,manifest.documentation))
  if(!docs.startsWith('---\n')||!/^schema: agents-company\.cli\/v1$/m.test(docs)||!docs.includes(`plugin: ${manifest.id}\n`))throw new Error('Plugin documentation must declare agents-company.cli/v1 and its plugin ID')
  for(const heading of ['## Purpose','## Workspace','## Quick start','## Commands','## Files','## Errors','## Compatibility'])if(!docs.split('\n').includes(heading))throw new Error(`Plugin documentation missing ${heading}`)
  const plugin={...manifest,directory},entries=(['runtime','renderer','cli','documentation','schema'] as const).map(key=>{const relative=manifest[key],canonical=pluginFile(directory,relative);return {relative,canonical,version:fileVersion(canonical)}})
  descriptorCache.delete(directory);descriptorCache.set(directory,{manifestVersion,entries,plugin})
  if(descriptorCache.size>64)descriptorCache.delete(descriptorCache.keys().next().value!)
  return structuredClone(plugin)
}
export function pluginDirectories():string[] {
  const resources=process.resourcesPath
  const builtin=process.env.AGENTS_COMPANY_BUILTIN_PLUGINS || (resources&&fs.existsSync(path.join(resources,'plugins'))?path.join(resources,'plugins'):path.join(applicationRoot(),'Infra/src/resources/plugins'))
  return [builtin,path.join(APP_HOME,'plugins'),...(process.env.AGENTS_COMPANY_PLUGIN_DIRS||'').split(path.delimiter).filter(Boolean)]
}
export function listPlugins():PluginDescriptor[] {
  const found=new Map<string,PluginDescriptor>()
  for(const root of pluginDirectories()) {
    if(!fs.existsSync(root))continue
    const directories=fs.existsSync(path.join(root,PLUGIN_MANIFEST))?[root]:fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(root,e.name))
    for(const directory of directories)if(fs.existsSync(path.join(directory,PLUGIN_MANIFEST))){const plugin=readPlugin(directory);found.set(plugin.id,plugin)}
  }
  return [...found.values()]
}
export function requirePlugin(id:string):PluginDescriptor {
  const plugin=listPlugins().find(p=>p.id===id)
  if(!plugin)throw new Error(`Plugin not installed: ${id}`)
  return plugin
}
export function installPlugin(source:string):PluginDescriptor {
  const plugin=readPlugin(source),directory=path.join(APP_HOME,'plugins',plugin.id)
  if(fs.existsSync(directory))throw new Error('Plugin already installed; remove it before installing a replacement')
  fs.mkdirSync(path.dirname(directory),{recursive:true})
  fs.cpSync(plugin.directory,directory,{recursive:true,dereference:true})
  return readPlugin(directory)
}
