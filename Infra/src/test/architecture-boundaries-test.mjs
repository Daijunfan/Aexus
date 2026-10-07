// Runtime imports only. Type-only vocabulary does not make an execution dependency.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/slimming')
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):/\.(ts|tsx)$/.test(entry.name)?[path.join(dir,entry.name)]:[])
function graph(files,read){
 const sources=new Set(files),edges=new Map(files.map(file=>[file,[]]))
 for(const file of files){const tree=ts.createSourceFile(file,read(file),ts.ScriptTarget.Latest,true)
  for(const node of tree.statements){
   if(!(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))||!node.moduleSpecifier||!ts.isStringLiteral(node.moduleSpecifier))continue
   if(ts.isImportDeclaration(node)){const clause=node.importClause;if(clause?.isTypeOnly||clause&&!clause.name&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.length>0&&clause.namedBindings.elements.every(item=>item.isTypeOnly))continue}
   else if(node.isTypeOnly||node.exportClause&&ts.isNamedExports(node.exportClause)&&node.exportClause.elements.every(item=>item.isTypeOnly))continue
   const value=node.moduleSpecifier.text;if(!value.startsWith('.'))continue
   const base=path.resolve(path.dirname(file),value),target=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts'),path.join(base,'index.tsx')].find(candidate=>sources.has(candidate))
   if(target)edges.get(file).push(target)
  }
 }
 let next=0;const stack=[],indices=new Map(),low=new Map(),active=new Set(),cycles=[]
 const visit=file=>{indices.set(file,next);low.set(file,next++);stack.push(file);active.add(file)
  for(const target of edges.get(file)){if(!indices.has(target)){visit(target);low.set(file,Math.min(low.get(file),low.get(target)))}else if(active.has(target))low.set(file,Math.min(low.get(file),indices.get(target)))}
  if(low.get(file)===indices.get(file)){const group=[];let item;do{item=stack.pop();active.delete(item);group.push(path.relative(root,item))}while(item!==file);if(group.length>1)cycles.push(group.sort())}
 }
 for(const file of files)if(!indices.has(file))visit(file)
 return {files:files.length,edges:[...edges.values()].reduce((sum,items)=>sum+items.length,0),cycles}
}
const current=graph(['main','shared','preload','renderer/src'].flatMap(dir=>walk(path.join(root,'Infra/src',dir))),file=>fs.readFileSync(file,'utf8'))
assert.deepEqual(current.cycles,[],'Runtime cycles must not reappear; inject operations or use leaf contracts')
const contract=fs.readFileSync(path.join(root,'Infra/src/main/engines/contract.ts'),'utf8')
assert.doesNotMatch(contract,/live:Map|info:Map|privateTurns:Map/,'Adapters must not own Core registry maps')
let before
if(process.argv.includes('--baseline')){
 const files=execFileSync('git',['ls-tree','-r','--name-only','HEAD','src'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(file=>/\.(ts|tsx)$/.test(file)).map(file=>path.join(root,file))
 before=graph(files,file=>execFileSync('git',['show','HEAD:'+path.relative(root,file)],{cwd:root,encoding:'utf8',maxBuffer:4e6}))
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,before?'architecture.json':'architecture-current.json'),JSON.stringify({method:'Static runtime imports/exports; excludes type-only, dynamic and external dependencies',before,after:current},null,2))
console.log(JSON.stringify({before,after:current},null,2))
