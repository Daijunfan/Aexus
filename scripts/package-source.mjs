import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {create as tar,list as listTar} from 'tar'
import {root,sourceFiles} from './source-files.mjs'
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')),name='Avalon-'+pkg.version+'-source'
const output=path.join(root,'release'),stage=path.join(root,'.dist',name)
fs.mkdirSync(output,{recursive:true});fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true})
const manifest=[],files=sourceFiles()
for(const file of files){
  const relative=path.relative(root,file),target=path.join(stage,relative)
  const content=fs.readFileSync(file),mode=fs.statSync(file).mode&0o777
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,{mode})
  manifest.push({file:relative.split(path.sep).join('/'),sha256:createHash('sha256').update(content).digest('hex')})
}
const plugins=JSON.parse(fs.readFileSync(path.join(stage,'plugins.lock.json'),'utf8')).plugins
for(const plugin of plugins){
  const actual=JSON.parse(fs.readFileSync(path.join(stage,'PlugIns',plugin.directory,'package.json'),'utf8'))
  if(actual.version!==plugin.version)throw Error('Source snapshot plugin/lock mismatch: '+plugin.directory)
}
if(JSON.parse(fs.readFileSync(path.join(stage,'package.json'),'utf8')).version!==pkg.version)throw Error('Package version changed while collecting sources')
for(const item of manifest){const current=createHash('sha256').update(fs.readFileSync(path.join(root,item.file))).digest('hex');if(current!==item.sha256)throw Error('Source changed while creating snapshot; retry after the edit completes: '+item.file)}
if(JSON.stringify(sourceFiles())!==JSON.stringify(files))throw Error('Source file list changed while creating snapshot; retry')
fs.writeFileSync(path.join(stage,'SOURCE_MANIFEST.json'),JSON.stringify({version:pkg.version,plugins,files:manifest},null,2)+'\n')
const archive=path.join(output,name+'.tar.gz')
// Node's portable tar writer never emits macOS AppleDouble/xattr sidecar files.
await tar({cwd:path.dirname(stage),file:archive,gzip:true,portable:true},[name])
const expected=new Set([...manifest.map(item=>name+'/'+item.file),name+'/SOURCE_MANIFEST.json'])
await listTar({file:archive,onentry(entry){
  if(entry.type==='Directory')return
  if(entry.type!=='File'||!expected.delete(entry.path))throw Error('Unexpected file in source archive: '+entry.path)
}})
if(expected.size)throw Error('Source archive is incomplete: '+[...expected].join(', '))
const hash=createHash('sha256').update(fs.readFileSync(archive)).digest('hex')
fs.writeFileSync(archive+'.sha256',hash+'  '+path.basename(archive)+'\n')
console.log(JSON.stringify({archive,sha256:hash,files:manifest.length,notes:'Contains all three plugin sources, not their private Git histories. Run release:check before public redistribution.'},null,2))
