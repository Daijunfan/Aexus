import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),repo=path.resolve(root,'../..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'engine.json'),'utf8'))
test('Engine product code has no import, subprocess, database or UI dependency on Infra implementation',()=>{
 const files=fs.readdirSync(root).filter(n=>/\.(mjs|tsx|mts|css)$/.test(n));for(const name of files){const text=fs.readFileSync(path.join(root,name),'utf8');assert.ok(!/Infra\/|Infra\\|AGENTS_COMPANY_HOME|control\.token|sessions\.json|channels\.sqlite/.test(text),name+' references Infra internals');for(const m of text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)){const ref=m[2];if(ref.startsWith('..'))assert.ok(ref.startsWith('../../Contract/'),name+' imports outside Engine/Contract: '+ref)}}
 assert.ok(!fs.readdirSync(root).some(n=>/store|sqlite|credential/.test(n)))
})
test('manifest capabilities are public Contract operations and UI, CLI, runtime entries are real',()=>{
 const {commands}=JSON.parse(fs.readFileSync(path.join(repo,'Contract/commands.v1.json'),'utf8')),names=new Set(commands.map(c=>c.name))
 assert.equal(manifest.id,'profile-improvement');for(const command of manifest.requiredCommands)assert.ok(names.has(command),command)
 for(const file of [manifest.ui,manifest.cli,manifest.runtime])assert.ok(fs.existsSync(path.join(root,file)))
 const allowed=new Set(manifest.requiredCommands),source=['Page.tsx','agents.mjs','workflow.mjs','cli.mjs'].map(n=>fs.readFileSync(path.join(root,n),'utf8')).join('\n')
 for(const m of source.matchAll(/(?:invoke|call)\s*(?:<[^>]*>)?\(\s*['"]([a-z]+\.[a-z.-]+)['"]/g))assert.ok(allowed.has(m[1]),'Undeclared command '+m[1])
 assert.equal(manifest.outputSchema.properties.files.maxItems,3)
})
