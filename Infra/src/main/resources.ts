import fs from 'node:fs'
import path from 'node:path'
/** Resolve resources in development, a standalone server, or an installed ASAR. */
export function applicationRoot(){
  for(const start of [__dirname,process.env.AGENTS_COMPANY_PACKAGE_ROOT,process.cwd()].filter(Boolean) as string[])for(let current=start;;current=path.dirname(current)){
    const file=path.join(current,'package.json')
    try{const {name}=JSON.parse(fs.readFileSync(file,'utf8'));if(['aexus','agents-company'].includes(name))return current}catch{}
    if(path.dirname(current)===current)break
  }
  throw Error('Aexus package resources are missing')
}
export const rendererDirectory=()=>path.join(applicationRoot(),'.aexus/out','renderer')
export const applicationVersion=()=>String(JSON.parse(fs.readFileSync(path.join(applicationRoot(),'package.json'),'utf8')).version)
