import fs from 'node:fs'
import path from 'node:path'
/** Resolve resources in development, a standalone server, or an installed ASAR. */
export function applicationRoot(){
  for(const start of [__dirname,process.env.AGENTS_COMPANY_PACKAGE_ROOT,process.cwd()].filter(Boolean) as string[])for(let current=start;;current=path.dirname(current)){
    const file=path.join(current,'package.json')
    try{if(JSON.parse(fs.readFileSync(file,'utf8')).name==='agents-company')return current}catch{}
    if(path.dirname(current)===current)break
  }
  throw Error('Anexus package resources are missing')
}
export const rendererDirectory=()=>path.join(applicationRoot(),'out','renderer')
export const applicationVersion=()=>String(JSON.parse(fs.readFileSync(path.join(applicationRoot(),'package.json'),'utf8')).version)
