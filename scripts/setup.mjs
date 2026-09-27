import fs from 'node:fs'
import path from 'node:path'
import spawn from 'cross-spawn'
const root=path.resolve(import.meta.dirname,'..')
const lock=JSON.parse(fs.readFileSync(path.join(root,'plugins.lock.json'),'utf8'))
for(const item of lock.plugins){
  const directory=path.join(root,'PlugIns',item.directory),manifest=path.join(directory,'package.json')
  if(!fs.existsSync(manifest))throw Error('Required plugin source is missing: '+item.directory)
  const pkg=JSON.parse(fs.readFileSync(manifest,'utf8'))
  if(pkg.version!==item.version)throw Error('Plugin version does not match plugins.lock.json: '+item.directory)
  if(!Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies}).length)continue
  if(!fs.existsSync(path.join(directory,'package-lock.json')))throw Error('Plugin dependency lock is missing: '+item.directory)
  const result=spawn.sync('npm',['--prefix',directory,'ci'],{stdio:'inherit'})
  if(result.error)throw result.error
  if(result.status!==0)process.exit(result.status??1)
}
console.log('All bundled plugin sources and locked dependencies are ready.')
