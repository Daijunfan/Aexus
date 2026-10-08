// Install each Engine's own locked production dependencies; do not hoist domain libraries into Infra.
import fs from 'node:fs'
import path from 'node:path'
import spawn from 'cross-spawn'
const root=path.resolve(import.meta.dirname,'../../..'),check=process.argv.includes('--check')
const records=[]
for(const entry of fs.readdirSync(path.join(root,'Engine'),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
 if(!entry.isDirectory()||entry.name.startsWith('.'))continue
 const directory=path.join(root,'Engine',entry.name),manifestFile=path.join(directory,'engine.json'),packageFile=path.join(directory,'package.json')
 if(!fs.existsSync(manifestFile)||!fs.existsSync(packageFile))continue
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8')),pkg=JSON.parse(fs.readFileSync(packageFile,'utf8'))
 if(manifest.id!==entry.name)throw Error('Engine directory and identity differ: '+entry.name)
 const dependencies={...pkg.dependencies,...pkg.optionalDependencies}
 if(!Object.keys(dependencies).length)continue
 const lockFile=path.join(directory,'package-lock.json')
 if(!fs.existsSync(lockFile))throw Error('Engine dependency lock missing: '+entry.name)
 const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'))
 if(lock.name!==pkg.name||lock.version!==pkg.version)throw Error('Engine dependency lock identity/version mismatch: '+entry.name)
 if(!check){
  // Refuse a developer symlink rather than allowing npm to change another checkout.
  const modules=path.join(directory,'node_modules')
  if(fs.existsSync(modules)&&fs.lstatSync(modules).isSymbolicLink())throw Error('Use a private dependency directory before installing: '+entry.name)
  const result=spawn.sync('npm',['--prefix',directory,'ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],{stdio:'inherit'})
  if(result.error)throw result.error
  if(result.status!==0)process.exit(result.status??1)
 }
 for(const name of Object.keys(pkg.dependencies??{})){
  const file=path.join(directory,'node_modules',name,'package.json'),expected=lock.packages?.['node_modules/'+name]?.version
  if(!fs.existsSync(file)||JSON.parse(fs.readFileSync(file,'utf8')).version!==expected)throw Error('Locked Engine dependency missing or mismatched: '+entry.name+'/'+name)
 }
 records.push({engine:manifest.id,version:manifest.version,dependencies:Object.keys(dependencies)})
}
console.log(JSON.stringify({checked:check,engines:records},null,2))
