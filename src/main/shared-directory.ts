import fs from 'node:fs'
import path from 'node:path'
declare const __AGENTS_PROJECT_ROOT__:string
/** Compiled from the checkout, so installed apps never store user files inside app.asar. */
export function sharedDirectory(){
  const project=typeof __AGENTS_PROJECT_ROOT__==='string'?__AGENTS_PROJECT_ROOT__:process.cwd()
  const root=process.env.AGENTS_COMPANY_SHARED_DIR||path.join(project,'Shared')
  fs.mkdirSync(root,{recursive:true});return fs.realpathSync(root)
}
