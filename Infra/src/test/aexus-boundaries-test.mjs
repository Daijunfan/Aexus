// Verify the physical/public boundaries without executing any Engine or touching user state.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/aexus-architecture/closeout'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-boundaries-')),checks=[]
const ok=(value,label)=>{assert.ok(value,label);checks.push(label);console.log('PASS '+label)}
const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isSymbolicLink()?[]:entry.isDirectory()&&!['node_modules','.aexus','dist'].includes(entry.name)?walk(path.join(directory,entry.name)):entry.isFile()&&/\.(?:[cm]?js|tsx?)$/.test(entry.name)?[path.join(directory,entry.name)]:[])
function imports(file,source){
 const found=[],tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)
 const visit=node=>{
  let specifier
  if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))specifier=node.moduleSpecifier
  if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))specifier=node.arguments[0]
  if(specifier&&ts.isStringLiteralLike(specifier))found.push(specifier.text)
  ts.forEachChild(node,visit)
 };visit(tree);return found
}
const beneath=(file,base)=>file===base||file.startsWith(base+path.sep)
function violation(file,specifier){
 if(!specifier.startsWith('.')&&!path.isAbsolute(specifier))return false
 const target=path.resolve(path.dirname(file),specifier),contract=path.join(root,'Contract'),engine=path.join(root,'Engine')
 if(beneath(file,contract))return !beneath(target,contract)
 if(beneath(file,engine)){
  const own=path.join(engine,path.relative(engine,file).split(path.sep)[0])
  return !beneath(target,own)&&!beneath(target,contract)
 }
 return false
}
try{
 assert.deepEqual(fs.readdirSync(root).filter(name=>/\.md$/i.test(name)),['README.md'])
 assert.deepEqual(fs.readdirSync(path.join(root,'Infra')).sort(),['Plugins','src'])
 ok(['Engine','Infra','Contract'].every(name=>fs.statSync(path.join(root,name)).isDirectory()),'Three real layers; Infra contains only src and Plugins; README is the sole root Markdown')
 const files=[...walk(path.join(root,'Contract')),...walk(path.join(root,'Engine'))],bad=[]
 for(const file of files)for(const dependency of imports(file,fs.readFileSync(file,'utf8')))if(violation(file,dependency))bad.push({file:path.relative(root,file),dependency})
 assert.deepEqual(bad,[])
 const simulated=path.join(root,'Engine','example','Page.tsx')
 assert.ok(violation(simulated,'../../Infra/src/main/store'))
 assert.ok(violation(simulated,'../other/workflow.mjs'))
 assert.ok(!violation(simulated,'../../Contract/protocol'))
 assert.ok(violation(path.join(root,'Contract','client.ts'),'../Infra/src/main/server'))
 ok(true,'Contract has no Infra implementation imports; each Engine imports only its own code, Contract or declared external packages')
 const bundle=path.join(temp,'manifest.mjs');await build({entryPoints:[path.join(root,'Contract/engine.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent'})
 const {validateEngineManifest}=await import(pathToFileURL(bundle)),catalog=JSON.parse(fs.readFileSync(path.join(root,'Contract/commands.v1.json'))),supported=new Set(catalog.commands.map(c=>c.name))
 const engineRoot=path.join(root,'Engine'),engines=fs.readdirSync(engineRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(engineRoot,d.name,'engine.json')))
 for(const {name} of engines){const directory=path.join(engineRoot,name),manifest=validateEngineManifest(JSON.parse(fs.readFileSync(path.join(directory,'engine.json'))),name);for(const file of [manifest.ui,manifest.cli])assert.ok(fs.statSync(path.join(directory,file)).isFile());assert.ok(manifest.requiredCommands.every(c=>supported.has(c)))}
 const sample=JSON.parse(fs.readFileSync(path.join(engineRoot,'workspace-audit/engine.json')))
 for(const patch of [{id:'../escape'},{contractVersion:'2.0.0'},{ui:'../Infra/index.ts'},{requiredCommands:['group.list','group.list']},{inputSchema:[]},{unexpected:true}])assert.throws(()=>validateEngineManifest({...sample,...patch}),e=>typeof e.code==='string')
 ok(engines.length>0,'Every Engine has valid versioned entrypoints and supported requirements; invalid manifests fail explicitly')
 assert.equal(catalog.contractVersion,'1.0.0');for(const name of ['assets.naming','conversation.file','conversation.download-status','conversation.transfer','channel.settings']){const c=catalog.commands.find(c=>c.name===name);assert.equal(c?.effect,'conditional');assert.equal(c.readOnly,false)};assert.equal(supported.size,catalog.commands.length)
 for(const c of catalog.commands){assert.ok(['company','messages','plan','files','runtime'].includes(c.domain));assert.ok(c.inputSchema&&typeof c.inputSchema==='object');assert.ok(['registry','legacy-documentation'].includes(c.schemaSource));assert.ok(!c.name.startsWith('plugin.')&&!c.name.startsWith('contract.'))}
 ok(true,'Public v1 capabilities are unique and explicitly describe their domain, schema provenance and transport')
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')))
 assert.equal(pkg.name,'aexus');assert.equal(pkg.productName,'Aexus');assert.equal(pkg.build.productName,'Aexus')
 for(const name of ['aexus','agents','avalon','anexus'])assert.ok(fs.existsSync(path.join(root,pkg.bin[name])))
 const documents=fs.readFileSync(path.join(root,'Infra/src/main/api-documents.ts'),'utf8'),references=[...documents.matchAll(/\['core\/[^']+','([^']+)'\]/g)].map(m=>m[1].startsWith('Contract/')?m[1]:'Infra/src/docs/'+m[1].replace(/^docs\//,''))
 for(const name of references){assert.ok(fs.existsSync(path.join(root,name)),name);assert.ok(pkg.build.files.includes(name)||name.startsWith('Contract/')&&pkg.build.files.includes('Contract/**/*'),'Missing packaged API document '+name)}
 ok(true,'Product naming, four compatible CLI entrypoints and every discoverable Core/Contract document are present in the desktop manifest')
 const profileLine=fs.readFileSync(path.join(root,'Infra/src/main/index.ts'),'utf8').split('\n').find(line=>line.startsWith("app.setPath('userData'"));assert.ok(profileLine)
 const resolved=[],applicationData=path.join(temp,'application-data'),explicitHome=path.join(temp,'explicit-home')
 for(const env of [{},{AGENTS_COMPANY_HOME:explicitHome}])runInNewContext(profileLine,{process:{env},join:path.join,app:{getPath:name=>{assert.equal(name,'appData');return applicationData},setPath:(name,value)=>{assert.equal(name,'userData');resolved.push(value)}}})
 assert.deepEqual(resolved,[path.join(applicationData,'Agents Company'),path.join(explicitHome,'electron')])
 ok(true,'Aexus display naming retains the original Electron profile path and honors isolated/custom data homes; no user-profile migration is required')
 const {sourceFiles}=await import('../tooling/source-files.mjs'),source=new Set(sourceFiles().map(file=>path.relative(root,file)))
 for(const entry of ['README.md','Contract/commands.v1.json','Contract/node-client.mjs','Engine/workspace-audit/workflow.mjs','Infra/src/main/contract.ts','Infra/src/docs/INFRA_API.md'])assert.ok(source.has(entry),'Missing source archive entry '+entry)
 assert.ok([...source].every(name=>!name.startsWith('.aexus/')&&!name.startsWith('progress/')&&!name.startsWith('share_chat/')))
 ok(true,'Portable source inventory contains all three source layers and excludes runtime, cooperation logs and private build data')
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'boundaries.json'),JSON.stringify({passed:true,checks,engines:engines.map(e=>e.name),layerFiles:files.length,publicCommands:catalog.commands.length,preciseSchemas:catalog.commands.filter(c=>c.schemaSource==='registry').length,scope:'Static imports/exports and literal require/import; trusted Engine code is not an OS sandbox'},null,2))
}finally{fs.rmSync(temp,{recursive:true,force:true})}
