import fs from 'node:fs'
import path from 'node:path'
import {APP_HOME} from '../shared/protocol'
declare const __AGENTS_PROJECT_ROOT__:string
/** Compiled from the checkout, so installed apps never store user files inside app.asar. */
export function sharedDirectory(){
  const project=typeof __AGENTS_PROJECT_ROOT__==='string'?__AGENTS_PROJECT_ROOT__:undefined
  const root=process.env.AGENTS_COMPANY_SHARED_DIR||(project&&fs.existsSync(path.join(project,'package.json'))&&fs.existsSync(path.join(project,'Shared'))?path.join(project,'Shared'):path.join(APP_HOME,'Shared'))
  fs.mkdirSync(root,{recursive:true});return fs.realpathSync(root)
}
