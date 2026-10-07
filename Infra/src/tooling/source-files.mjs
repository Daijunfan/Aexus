import fs from 'node:fs'
import path from 'node:path'
export const root=path.resolve(import.meta.dirname,'../../..')
const topDirectories=['Infra/src','Engine','Contract','.github']
const excluded=new Set(['.git','node_modules','out','release','release.noindex','dist','dist-cli','dist-plugin','build','artifacts','workspaces','.local-data','.agents-company','.tunnel','__pycache__','.pytest_cache','test-results','test-artifacts','playwright-report','REPAIR_STATUS.md','VERIFICATION.md'])
function walk(directory,result){
  if(!fs.existsSync(directory))return
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(directory===path.join(root,'Infra/src/resources')&&['plugins','cli','Source.zip'].includes(entry.name))continue
    if(excluded.has(entry.name)||entry.name==='.DS_Store'||entry.name.startsWith('._')||entry.name.endsWith('.tsbuildinfo')||entry.name.startsWith('.env')&&entry.name!=='.env.example')continue
    const file=path.join(directory,entry.name)
    if(entry.isSymbolicLink())continue
    if(entry.isDirectory())walk(file,result)
    else if(entry.isFile())result.push(file)
  }
}
/** Explicit product roots, never the developer's working folders, browser profiles or .git history. */
export function sourceFiles(){
  const files=[]
  for(const directory of topDirectories)walk(path.join(root,directory),files)
  for(const file of fs.readdirSync(root,{withFileTypes:true}))if(file.isFile()&&file.name!=='UI.png'&&(/\.(md|json|ts|png)$/.test(file.name)||['LICENSE','NOTICE','.gitignore','.dockerignore','.env.example','.gitattributes','.editorconfig','Dockerfile'].includes(file.name)))files.push(path.join(root,file.name))
  const lock=JSON.parse(fs.readFileSync(path.join(root,'Infra/src/resources/plugins.lock.json'),'utf8'))
  for(const plugin of lock.plugins)walk(path.join(root,'Infra/Plugins',plugin.directory),files)
  files.push(path.join(root,'Infra/Plugins','README.md'))
  return [...new Set(files)].sort()
}
