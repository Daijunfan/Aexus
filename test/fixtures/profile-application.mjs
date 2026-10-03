// Standalone profile tests build disposable application output, never the developer's out/.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {build} from 'electron-vite'
export async function profileApplication(){
 const root=path.resolve(import.meta.dirname,'../..'),external=process.env.AGENTS_COMPANY_PROFILE_APPLICATION
 if(external)return {directory:fs.realpathSync(external),dispose:()=>{}}
 const directory=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'ac-profile-app-'))),dispose=()=>fs.rmSync(directory,{recursive:true,force:true})
 try{
  fs.writeFileSync(path.join(directory,'package.json'),fs.readFileSync(path.join(root,'package.json')))
  for(const name of ['node_modules','bin','docs','Modules','build','src','API.md','PERMISSIONS.md','ARCHITECTURE.md','AGENTS.md','PLAN.md','SCHEDULER.md','PLUGIN_SPEC.md','README.md','engine-downloads.json'])if(fs.existsSync(path.join(root,name)))fs.symlinkSync(path.join(root,name),path.join(directory,name))
  const config=path.join(directory,'build.config.mjs');fs.writeFileSync(config,`import original from ${JSON.stringify(path.join(root,'electron.vite.config.ts'))};export default Object.fromEntries(Object.entries(original).map(([part,value])=>[part,{...value,build:{...value.build,outDir:${JSON.stringify(directory)}+'/out/'+part,emptyOutDir:true}}]));`)
  await build({configFile:config,logLevel:'error'});return {directory,dispose}
 }catch(error){dispose();throw error}
}
