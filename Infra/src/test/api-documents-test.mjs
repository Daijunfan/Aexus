// Shared public docs in a disposable Core home; no employee, runtime or model starts.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {execFileSync} from 'node:child_process'

const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-api-documents-')),home=path.join(temp,'home'),resources=path.join(temp,'resources'),plugins=path.join(temp,'plugins'),entry=path.join(temp,'documents.cjs')
const sourceName=file=>file.startsWith('Contract/')?file:'Infra/src/docs/'+file.replace(/^docs\//,'')
const keys=['AGENTS_COMPANY_HOME','AGENTS_COMPANY_PACKAGE_ROOT','AGENTS_COMPANY_BUILTIN_PLUGINS','AGENTS_COMPANY_PLUGIN_DIRS'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]])),checks=[]
try{
 fs.mkdirSync(resources);fs.mkdirSync(plugins);fs.writeFileSync(path.join(resources,'package.json'),'{"name":"agents-company"}')
 for(const file of ['Contract/PROTOCOL.md','ENGINE_WORKSPACES.md','INFRA_API.md','API.md','PERMISSIONS.md','PLAN.md','SCHEDULER.md','ARCHITECTURE.md','docs/CONVERSATION_WORKSPACES.md','docs/CONVERSATION_CONTROLS.md','docs/MESSAGE_COLLABORATION.md','docs/SECRETARY_API_PARITY.md']){fs.mkdirSync(path.dirname(path.join(resources,sourceName(file))),{recursive:true});fs.copyFileSync(path.join(root,sourceName(file)),path.join(resources,sourceName(file)))}
 const makePlugin=(id,version)=>{
  const directory=path.join(plugins,id);fs.mkdirSync(directory,{recursive:true})
  const api=`---\nschema: agents-company.cli/v1\nplugin: ${id}\n---\n# ${id} ${version}\n\n${['Purpose','Workspace','Quick start','Commands','Files','Errors','Compatibility'].map(title=>'## '+title+'\n\nFixture '+title+'\n').join('\n')}`
  fs.writeFileSync(path.join(directory,'API.md'),api)
  fs.writeFileSync(path.join(directory,'schema.json'),JSON.stringify({schemaVersion:1,pluginId:id,version,commands:[{method:'fixture.read',description:'Read a fixture record',agentAccess:'workspace',options:[{name:'record-id',type:'string',required:true}],examples:['fixture.read --record-id chosen']},{method:'fixture.write',description:'Write a fixture record.\n'+'A long description. '.repeat(30),agentAccess:'workspace',options:[{name:'private-body-parameter',type:'string'}]}]}))
  fs.writeFileSync(path.join(directory,'runtime.cjs'),`require('node:fs').writeFileSync(${JSON.stringify(path.join(temp,'runtime-started'))},'must not start');throw Error('Docs must not load runtime')`)
  for(const file of ['cli.cjs','index.html'])fs.writeFileSync(path.join(directory,file),'fixture')
  fs.writeFileSync(path.join(directory,'agents-company.plugin.json'),JSON.stringify({schemaVersion:1,id,name:id==='mininotion'?'MiniNotion':'Fixture Notes',version,runtime:'runtime.cjs',cli:'cli.cjs',renderer:'index.html',documentation:'API.md',schema:'schema.json'}))
  return {directory,api}
 }
 const first=makePlugin('mininotion','1.0.0');makePlugin('fixture-notes','2.0.0')
 Object.assign(process.env,{AGENTS_COMPANY_HOME:home,AGENTS_COMPANY_PACKAGE_ROOT:resources,AGENTS_COMPANY_BUILTIN_PLUGINS:plugins,AGENTS_COMPANY_PLUGIN_DIRS:''})
 await build({entryPoints:[path.join(root,'Infra/src/main/api-documents.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'silent'})
 const {ensureApiDocuments,readApiDocument}=createRequire(import.meta.url)(entry),catalogRoot=ensureApiDocuments(),index=readApiDocument()
 assert.equal(catalogRoot,path.join(home,'api-docs'));assert.equal(index.document,'index');assert.equal(index.path,path.join(catalogRoot,'README.md'));assert.equal(index.catalogRoot,catalogRoot)
 assert.ok(index.markdown.length<5000,'Default index stays small');assert.ok(index.markdown.indexOf('| Company |')<index.markdown.indexOf('| Messages |'));assert.ok(index.markdown.indexOf('| Messages |')<index.markdown.indexOf('| Plan |'));assert.ok(index.markdown.indexOf('| Plan |')<index.markdown.indexOf('## 已安装插件'))
 assert.match(index.markdown,/Plan 是 Core 视图，不是 MiniNotion 插件/);assert.match(index.markdown,/describe` 仅查询 Core/);assert.doesNotMatch(index.markdown,/### card\.create|全部 CLI 命令索引/)
 assert.match(index.markdown,/"operation":"document","document":"plugin\/mininotion\/command\/page.create"/);assert.match(index.markdown,/EMPLOYEE_ID 取 identity/);assert.match(index.markdown,/省略 `--employee`、`--team`、`--workspace`/)
 const parsed=JSON.parse(execFileSync(process.execPath,[path.join(root,'Infra/src/cli/agents'),'plugin','call','mininotion','page.create','--employee','fixture-employee','--params','{"title":"..."}','--json'],{env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8'}))
 assert.equal(parsed.cmd,'plugin.call');assert.equal(parsed.args.employee,'fixture-employee');assert.equal(parsed.args.method,'page.create');assert.deepEqual(parsed.args.params,{title:'...'})
 checks.push('Short default index separates all three Core views from installed plugins without injecting the full command catalogue')
 for(const [id,file] of [['engine-workspaces','ENGINE_WORKSPACES.md'],['api','API.md'],['permissions','PERMISSIONS.md'],['plan','PLAN.md'],['scheduler','SCHEDULER.md'],['architecture','ARCHITECTURE.md'],['conversation-workspaces','docs/CONVERSATION_WORKSPACES.md'],['conversation-controls','docs/CONVERSATION_CONTROLS.md'],['message-collaboration','docs/MESSAGE_COLLABORATION.md'],['secretary-api','docs/SECRETARY_API_PARITY.md']]){
  const result=readApiDocument('core/'+id),source=fs.readFileSync(path.join(resources,sourceName(file)),'utf8');assert.equal(result.markdown,source);assert.equal(fs.readFileSync(result.path,'utf8'),source)
 }
 assert.equal(readApiDocument('plugin/mininotion/api').markdown,first.api);assert.equal(JSON.parse(readApiDocument('plugin/fixture-notes/schema').markdown).version,'2.0.0');assert.equal(fs.existsSync(path.join(temp,'runtime-started')),false)
 assert.deepEqual(fs.readdirSync(home),['api-docs']);checks.push('Core packaged resources and validated installed plugin API/schema are exact public copies; no runtime or workspace side effects')
 const methods=readApiDocument('plugin/mininotion/index'),single=readApiDocument('plugin/mininotion/command/fixture.read'),schema=readApiDocument('plugin/mininotion/schema')
 assert.match(index.markdown,/plugin\/mininotion\/index/);assert.match(index.markdown,/plugin\/mininotion\/command\/page.create/);assert.match(methods.markdown,/`fixture.read`/);assert.match(methods.markdown,/`fixture.write`/);assert.ok(methods.markdown.split('\n').find(line=>line.startsWith('- `fixture.write`')).length<190);assert.doesNotMatch(methods.markdown,/private-body-parameter|record-id/)
 assert.deepEqual(JSON.parse(single.markdown),JSON.parse(schema.markdown).commands[0]);assert.equal(single.document,'plugin/mininotion/command/fixture.read');assert.equal(single.path,schema.path);assert.deepEqual(fs.readdirSync(path.dirname(schema.path)).sort(),['API.md','README.md','schema.json']);assert.equal(fs.existsSync(path.join(temp,'runtime-started')),false)
 assert.throws(()=>readApiDocument('plugin/mininotion/command/not.real'),/Unknown plugin command: mininotion\/not.real/)
 checks.push('Plugin method index is summary-only; single-method lookup returns the exact current schema entry without per-method files or runtime startup')
 const corePath=readApiDocument('core/api').path,old=new Date('2001-01-01T00:00:00Z');fs.utimesSync(corePath,old,old);fs.utimesSync(index.path,old,old);ensureApiDocuments();assert.equal(fs.statSync(corePath).mtimeMs,old.getTime());assert.equal(fs.statSync(index.path).mtimeMs,old.getTime())
 fs.appendFileSync(path.join(resources,sourceName('PLAN.md')),'\nFixture current-release update.\n');assert.match(readApiDocument('core/plan').markdown,/Fixture current-release update/)
 const updated=makePlugin('mininotion','1.0.1');assert.equal(readApiDocument('plugin/mininotion/api').markdown,updated.api);assert.match(readApiDocument().markdown,/mininotion`, 1\.0\.1/)
 assert.equal(fs.statSync(corePath).mtimeMs,old.getTime());checks.push('Unchanged bytes preserve files; Core and plugin source updates refresh the same stable IDs and paths')
 for(const id of ['../docs/API.md','core/../../sessions.json','plugin/mininotion/runtime','unknown'])assert.throws(()=>readApiDocument(id),/Unknown API document/)
 fs.rmSync(path.join(plugins,'fixture-notes'),{recursive:true});assert.throws(()=>readApiDocument('plugin/fixture-notes/api'),/Unknown API document/);assert.ok(!readApiDocument().markdown.includes('fixture-notes'))
 checks.push('Only catalogued document IDs resolve; runtime/private paths and removed plugins cannot be read through the API')
 // Warm caches must follow file identity, not just a plugin's advertised version.
 const schemaFile=path.join(first.directory,'schema.json'),originalSchema=fs.readFileSync(schemaFile,'utf8'),times=fs.statSync(schemaFile)
 fs.writeFileSync(schemaFile,originalSchema.replace('Read a fixture record','View a fixture record'));fs.utimesSync(schemaFile,times.atime,times.mtime)
 assert.equal(JSON.parse(readApiDocument('plugin/mininotion/command/fixture.read').markdown).description,'View a fixture record')
 fs.writeFileSync(schemaFile,'{');assert.throws(()=>readApiDocument(),/JSON|property|Unexpected/i)
 fs.writeFileSync(schemaFile,originalSchema);assert.equal(JSON.parse(readApiDocument('plugin/mininotion/command/fixture.read').markdown).description,'Read a fixture record')
 const projected=readApiDocument('core/plan');fs.writeFileSync(projected.path,'stale local copy');readApiDocument('core/plan');assert.equal(fs.readFileSync(projected.path,'utf8'),projected.markdown)
 fs.unlinkSync(projected.path);readApiDocument('core/plan');assert.equal(fs.readFileSync(projected.path,'utf8'),projected.markdown)
 fs.unlinkSync(projected.path);fs.symlinkSync(path.join(resources,sourceName('PLAN.md')),projected.path);assert.throws(()=>readApiDocument(),/symlink/);fs.unlinkSync(projected.path);readApiDocument()
 const cliFile=path.join(first.directory,'cli.cjs'),originalCli=fs.readFileSync(cliFile);fs.unlinkSync(cliFile);fs.symlinkSync(path.join(resources,sourceName('PLAN.md')),cliFile)
 assert.throws(()=>readApiDocument(),/escapes/);fs.unlinkSync(cliFile);fs.writeFileSync(cliFile,originalCli);readApiDocument()
 checks.push('Warm caches track same-version/same-size edits, reject corrupt schemas and escaped symlinks, and repair deleted or modified public projections')
 const out=path.join(root,'.aexus/artifacts/api-documents');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,defaultIndexCharacters:index.markdown.length,scope:'Isolated source module, disposable resources/plugins/Core home; no real employee or model.'},null,2))
 console.log('PASS '+checks.join('; '))
}finally{for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];fs.rmSync(temp,{recursive:true,force:true})}
