import fs from 'node:fs'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'..'),source=path.join(root,'PlugIns')
for(const folder of fs.readdirSync(source,{withFileTypes:true}).filter(entry=>entry.isDirectory())){
  const directory=path.join(source,folder.name),manifest=path.join(directory,'package.json')
  if(!fs.existsSync(manifest)||!JSON.parse(fs.readFileSync(manifest)).scripts?.['build:plugin'])continue
  const out=path.join(root,'build/plugins',folder.name)
  const result=spawnSync('npm',['--prefix',directory,'run','build:plugin','--','--out',out],{stdio:'inherit'})
  if(result.status!==0)process.exit(result.status??1)
}
