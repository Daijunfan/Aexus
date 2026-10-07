import fs from 'node:fs'
import path from 'node:path'
import spawn from 'cross-spawn'
const root=path.resolve(import.meta.dirname,'../../..'),release=process.argv.includes('--release')
const lock=JSON.parse(fs.readFileSync(path.join(root,'Infra/src/resources/plugins.lock.json'),'utf8'))
if(lock.schemaVersion!==1||!lock.plugins?.length)throw Error('Missing plugin distribution lock')
for(const item of lock.plugins){
  if(!/^[a-z0-9-]+$/.test(item.directory))throw Error('Invalid plugin directory')
  const directory=path.join(root,'Infra/Plugins',item.directory),manifest=path.join(directory,'package.json')
  if(!fs.existsSync(manifest))throw Error(`Required first-release plugin is missing: ${item.directory}. Use the full source distribution.`)
  const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(pkg.version!==item.version)throw Error(`Plugin ${item.directory} is ${pkg.version}; update plugins.lock.json deliberately before release`)
  if(!pkg.scripts?.['build:plugin'])throw Error(`Plugin ${item.directory} has no build:plugin entry`)
  const output=path.join(root,'Infra/src/resources','plugins',item.directory),stage=output+'.stage-'+process.pid
  try{
    fs.rmSync(stage,{recursive:true,force:true})
    const result=spawn.sync('npm',['--prefix',directory,'run','build:plugin','--','--out',stage],{stdio:'inherit'})
    if(result.error)throw result.error
    if(result.status!==0)throw Error(`Plugin ${item.directory} build failed (${result.status})`)
    for(const name of ['agents-company.plugin.json','API.md','schema.json'])if(!fs.existsSync(path.join(stage,name)))throw Error(`Plugin ${item.directory} did not produce ${name}`)
    if(!release)fs.writeFileSync(path.join(stage,'source-location.json'),JSON.stringify({source:fs.realpathSync(directory)})+'\n')
    else fs.rmSync(path.join(stage,'source-location.json'),{force:true})
    const previous=output+'.previous-'+process.pid
    if(fs.existsSync(output))fs.renameSync(output,previous)
    try{fs.renameSync(stage,output)}catch(error){if(fs.existsSync(previous))fs.renameSync(previous,output);throw error}
    fs.rmSync(previous,{recursive:true,force:true})
    console.log(`Bundled ${item.directory}@${item.version} (${release?'portable release':'development'})`)
  }finally{fs.rmSync(stage,{recursive:true,force:true})}
}
