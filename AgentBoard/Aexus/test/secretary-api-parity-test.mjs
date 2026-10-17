// Mechanical GUI/registry/Secretary/CLI audit. Behavioral authorization is tested separately.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'
import ts from 'typescript'
import {COMMANDS} from '../src/shared/api-registry.ts'
import {READ_ONLY_APIS,RETIRED_APIS,apiReadOnly} from '../src/shared/api-effects.ts'
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-api-audit-')),out=path.join(root,'artifacts/secretary-plan-api'),known=new Map(COMMANDS.map(c=>[c.name,c])),home=process.env.AGENTS_COMPANY_HOME
try{
 process.env.AGENTS_COMPANY_HOME=path.join(temp,'state');const entry=path.join(temp,'auth.cjs')
 await build({entryPoints:[path.join(root,'src/main/authorization.ts')],outfile:entry,bundle:true,platform:'node',format:'cjs',packages:'external',define:{__AGENTS_PROJECT_ROOT__:JSON.stringify(root)},logLevel:'silent'});fs.symlinkSync(path.join(root,'node_modules'),path.join(temp,'node_modules'),'dir')
 const {allowedCommands}=createRequire(import.meta.url)(entry),context={principal:{kind:'agent',employeeId:'audit-secretary'}},store={sessions:[{id:'audit-secretary',managementRole:'secretary',group:'Audit'}],groups:['Audit']},allowed=new Set(allowedCommands(context,store).map(c=>c.name))
 const references=new Map(),walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(/\.tsx?$/.test(file)){
  const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS)
  const visit=node=>{if(ts.isStringLiteralLike(node)&&known.has(node.text)){const sites=references.get(node.text)??new Set();sites.add(path.relative(root,file)+':'+(source.getLineAndCharacterOfPosition(node.pos).line+1));references.set(node.text,sites)}ts.forEachChild(node,visit)};visit(source)
 }}};walk(path.join(root,'src/renderer/src'))
 const exclusions={
  'session.acknowledge':'Human private reading receipt','chat.acknowledge':'Human group reading receipt','channel.acknowledge':'Human news reading receipt',
  'ui.click':'Device pointer input would execute as the renderer user; use the canonical business API',
  'ui.type':'Device keyboard input would execute as the renderer user; use the canonical business API',
  'ui.drag':'Device pointer input would execute as the renderer user; use layout/position APIs',
  'ui.wheel':'Device wheel input is presentation state; use paged query APIs'
 }
 const inventory=[...references].sort(([a],[b])=>a.localeCompare(b)).map(([command,sites])=>({command,gui:known.get(command).gui,sites:[...sites],secretary:allowed.has(command),exception:allowed.has(command)?null:RETIRED_APIS[command]?'Retired compatibility interface: '+RETIRED_APIS[command]:exclusions[command]??null}))
 const missing=inventory.filter(item=>!item.secretary&&!item.exception);assert.deepEqual(missing,[],'Unexplained GUI operations unavailable to Secretary')
 for(const command of READ_ONLY_APIS)assert.ok(known.has(command),'Unknown read-only classification '+command)
 for(const command of ['group.root','workspace.write','schedule.create','schedule.delete','settings.set','plugin.call','auth.agent-token','session.send','channel.publish','not.real'])assert.equal(apiReadOnly(command),false,command+' must not bypass native write policy')
 for(const args of [{operation:'write'},{operation:'trash'},{operation:'restore'}])assert.equal(apiReadOnly('conversation.file',args),false)
 assert.equal(apiReadOnly('conversation.file',{operation:'read'}),true);assert.equal(apiReadOnly('channel.settings',{patch:{enabled:true}}),false)
 for(const command of Object.keys(RETIRED_APIS)){assert.ok(!allowed.has(command));assert.ok(allowedCommands(context,store,true).find(c=>c.name===command)?.replacement)}
 // Every renderer-referenced registered payload is representable without a flag-specific branch.
 for(const item of inventory){const args={fixture:'原样 JSON',nested:{values:[1,true,null]}},result=spawnSync(process.execPath,[path.join(root,'bin/agents'),'api','call',item.command,'--args',JSON.stringify(args),'--json'],{env:{...process.env,AGENTS_COMPANY_PARSE_ONLY:'1'},encoding:'utf8',timeout:10000});assert.equal(result.status,0,item.command+': '+result.stderr+result.stdout);assert.deepEqual(JSON.parse(result.stdout),{cmd:item.command,args})}
 const plugins=[] // Removed products have no shipped method schemas to audit.
 assert.ok(!fs.existsSync(path.join(root,'build/plugins/cloud-hosts/schema.json')))
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'gui-api-inventory.json'),JSON.stringify({passed:true,registered:COMMANDS.length,referenced:inventory.length,secretaryCallable:inventory.filter(i=>i.secretary).length,explicitExclusions:inventory.filter(i=>!i.secretary).length,unexplained:missing,plugins,inventory,limits:'Literal inventory and parse-only transport parity; not a claim that every operation or external service was executed.'},null,2))
 console.log(`PASS GUI API inventory: ${inventory.length} referenced commands, ${inventory.filter(i=>i.secretary).length} Secretary-callable, ${inventory.filter(i=>!i.secretary).length} explicit identity/client exceptions, no unexplained gap; raw CLI preserves every payload; conservative read classification; legacy replacements; no removed plugin catalogs`)
}finally{if(home===undefined)delete process.env.AGENTS_COMPANY_HOME;else process.env.AGENTS_COMPANY_HOME=home;fs.rmSync(temp,{recursive:true,force:true})}
