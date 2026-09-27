import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { build as buildUI } from 'vite';
import react from '@vitejs/plugin-react';
const root=path.resolve(import.meta.dirname,'..');
process.chdir(root);
const at=process.argv.indexOf('--out');
const out=path.resolve(at>=0?process.argv[at+1]:'dist-plugin');
if(out===root||out===path.dirname(root))throw new Error('Refusing to replace source directory');
fs.mkdirSync(out,{recursive:true});
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
await build({entryPoints:{'backend/server':'src/backend/server.ts','backend/cli':'src/cli/main.ts',runtime:'src/plugin/runtime.ts'},bundle:true,platform:'node',format:'cjs',target:'node22',outdir:out,outExtension:{'.js':'.cjs'},external:['proper-lockfile','jszip','electron','@anthropic-ai/claude-agent-sdk'],logLevel:'warning'});
await build({entryPoints:['src/backend/converter.ts'],bundle:true,packages:'external',platform:'node',format:'esm',target:'node22',outfile:path.join(out,'backend/converter.mjs'),logLevel:'warning'});
// The plugin owns its runtime dependencies, so it can ship independently of either app.
const copied=new Set();
function packageRoot(name,from) {
  const require=createRequire(path.join(from,'package.json'));
  // Read package metadata directly; import-only packages need not export it.
  for(const base of require.resolve.paths(name)||[]) {
    const directory=path.join(base,name),json=path.join(directory,'package.json');
    if(fs.existsSync(json)&&JSON.parse(fs.readFileSync(json,'utf8')).name===name)return fs.realpathSync(directory);
  }
  let file;try{file=require.resolve(name+'/package.json')}catch{file=require.resolve(name)}
  let directory=path.dirname(file);
  while(directory!==path.dirname(directory)) {
    const json=path.join(directory,'package.json');
    if(fs.existsSync(json)&&JSON.parse(fs.readFileSync(json,'utf8')).name===name)return directory;
    directory=path.dirname(directory);
  }
  throw new Error('Package root not found: '+name);
}
function copyPackage(name,from,parent=out) {
  const source=packageRoot(name,from),info=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  let target=path.join(out,'node_modules',name);
  if(fs.existsSync(path.join(target,'package.json'))&&JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version!==info.version)target=path.join(parent,'node_modules',name);
  if(copied.has(target))return;
  copied.add(target);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.cpSync(source,target,{recursive:true,dereference:true,filter:file=>file!==path.join(source,'node_modules')});
  for(const dep of Object.keys({...info.dependencies,...info.optionalDependencies,...info.peerDependencies})) {
    if(dep.startsWith('@types/')||dep==='electron')continue;
    try{copyPackage(dep,source,target)}catch(error){if(info.dependencies?.[dep]&&!info.optionalDependencies?.[dep])throw error}
  }
}
for(const name of ['proper-lockfile','jszip','@blocknote/server-util','@blocknote/core','@blocknote/xl-multi-column'])copyPackage(name,root);
fs.copyFileSync('dist-cli/claude-protocol.json',path.join(out,'backend/claude-protocol.json'));
await buildUI({configFile:false,root,base:'./',plugins:[react()],build:{outDir:path.join(out,'ui'),emptyOutDir:true,chunkSizeWarningLimit:2200}});
const require=createRequire(import.meta.url);
const {pluginCommands}=require(path.join(out,'runtime.cjs'));
const schema={schemaVersion:1,pluginId:'mininotion',version,transport:'JSON-RPC 2.0',commands:pluginCommands.map(command=>({...command,agentAccess:'workspace'})),profile:{workspaceRequired:true,agentRuntime:false,exports:['md','html','json','csv']}};
fs.writeFileSync(path.join(out,'schema.json'),JSON.stringify(schema,null,2)+'\n');
const table=pluginCommands.map(c=>`| \`${c.method}\` | ${c.mutates?'write':'read'} | ${c.description.replaceAll('|','/')} |`).join('\n');
const guide=fs.readFileSync('src/plugin/API.md','utf8').replace('{{VERSION}}',version).replace('{{COMMANDS}}',table);
fs.writeFileSync(path.join(out,'API.md'),guide);
fs.writeFileSync(path.join(out,'agents-company.plugin.json'),JSON.stringify({schemaVersion:1,id:'mininotion',name:'MiniNotion',version,description:'工作文件夹中的笔记、计划、数据库与日历',runtime:'runtime.cjs',renderer:'ui/index.html',cli:'backend/cli.cjs',documentation:'API.md',schema:'schema.json',autoAttach:true,workspaceDirectory:'mini-notion-workspace',license:'GPL-3.0-only'},null,2)+'\n');
for(const name of ['LICENSE','THIRD_PARTY_NOTICES.md','UNICODE-LICENSE.txt','KATEX-LICENSE.txt'])fs.copyFileSync(name,path.join(out,name));
console.log('Plugin package:',out);
