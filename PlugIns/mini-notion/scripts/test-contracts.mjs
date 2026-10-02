// Test-only instrumentation counts completed domain calls, not schema lookups.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const out=path.resolve(process.env.MINI_NOTION_TEST_RESULTS||path.join(root,'.local-data/contract-results'));
fs.mkdirSync(out,{recursive:true});
const ledger=fs.mkdtempSync(path.join(out,'run-'));
const result=spawnSync(process.execPath,[path.join(root,'scripts/test.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,MINI_NOTION_COMMAND_COVERAGE:ledger}});
if(result.error)throw result.error;
const bundle=path.join(ledger,'catalog.cjs');
buildSync({entryPoints:[path.join(root,'src/plugin/catalog.ts')],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'});
const {pluginCommands}=require(bundle);
const calls=fs.readdirSync(ledger).filter(file=>file.endsWith('.jsonl')).flatMap(file=>fs.readFileSync(path.join(ledger,file),'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)));
const methods=pluginCommands.map(command=>{
 const entries=calls.filter(call=>call.method===command.method);
 return {method:command.method,mutates:!!command.mutates,serviceSuccess:entries.filter(call=>call.ok&&call.layer!=='core').length,coreSuccess:entries.filter(call=>call.ok&&call.layer==='core').length,rejected:entries.filter(call=>!call.ok).length,layers:[...new Set(entries.map(call=>call.layer))]};
});
const missing=methods.filter(method=>!method.serviceSuccess).map(method=>method.method);
const report={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,testExitCode:result.status,total:methods.length,covered:methods.length-missing.length,missing,methods};
fs.writeFileSync(path.join(out,'methods.json'),JSON.stringify(report,null,2)+'\n');
console.log(`CLI service contract coverage: ${report.covered}/${report.total}; test exit ${result.status}`);
if(missing.length)console.error('Missing successful service scenarios: '+missing.join(', '));
process.exitCode=result.status|| (missing.length?1:0);
