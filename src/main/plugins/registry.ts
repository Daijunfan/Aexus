import fs from 'node:fs'
import path from 'node:path'
import { APP_HOME } from '../../shared/protocol'
import type { PluginDescriptor, PluginManifest } from '../../shared/plugins'

export const PLUGIN_MANIFEST='agents-company.plugin.json'
export function pluginFile(directory:string,relative:string):string {
  if(!relative||path.isAbsolute(relative))throw new Error('Plugin paths must be relative')
  const root=fs.realpathSync(directory),file=fs.realpathSync(path.resolve(root,relative))
  if(!file.startsWith(root+path.sep)||!fs.statSync(file).isFile())throw new Error('Plugin entry escapes its package')
  return file
}
export function readPlugin(directory:string):PluginDescriptor {
  directory=fs.realpathSync(directory)
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,PLUGIN_MANIFEST),'utf8')) as PluginManifest
  if(manifest.schemaVersion!==1)throw new Error('Unsupported plugin schemaVersion')
  if(!/^[a-z][a-z0-9-]*$/.test(manifest.id)||!manifest.name||!manifest.version)throw new Error('Invalid plugin identity')
  if(manifest.scope&&!['workspace','application'].includes(manifest.scope))throw new Error('Invalid plugin scope')
  if(manifest.workspaceDirectory&&!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(manifest.workspaceDirectory))throw new Error('Invalid plugin workspaceDirectory')
  for(const key of ['runtime','renderer','cli','documentation','schema'] as const)pluginFile(directory,manifest[key])
  const schema=JSON.parse(fs.readFileSync(pluginFile(directory,manifest.schema),'utf8'))
  if(schema.schemaVersion!==1||schema.pluginId!==manifest.id||schema.version!==manifest.version||!Array.isArray(schema.commands)||!schema.commands.length||schema.commands.some((c:any)=>typeof c.method!=='string'||!c.method.trim()||typeof c.description!=='string'||!c.description.trim())||new Set(schema.commands.map((c:any)=>c.method)).size!==schema.commands.length)throw new Error('Invalid plugin command schema: every plugin must declare its CLI API')
  const docs=fs.readFileSync(pluginFile(directory,manifest.documentation),'utf8')
  if(!docs.startsWith('---\n')||!/^schema: agents-company\.cli\/v1$/m.test(docs)||!docs.includes(`plugin: ${manifest.id}\n`))throw new Error('Plugin documentation must declare agents-company.cli/v1 and its plugin ID')
  for(const heading of ['## Purpose','## Workspace','## Quick start','## Commands','## Files','## Errors','## Compatibility'])if(!docs.split('\n').includes(heading))throw new Error(`Plugin documentation missing ${heading}`)
  return {...manifest,directory}
}
export function pluginDirectories():string[] {
  const resources=process.resourcesPath
  const builtin=process.env.AGENTS_COMPANY_BUILTIN_PLUGINS || (resources&&fs.existsSync(path.join(resources,'plugins'))?path.join(resources,'plugins'):path.resolve(__dirname,'../../../build/plugins'))
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
