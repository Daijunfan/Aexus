#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const registry = require('./src/registry.cjs');
const ssh = require('./src/ssh.cjs');
const file = path.join(registry.home, 'server.json');
const localRelease=()=>{try{return require('./src/release.cjs').verify()}catch(error){return {verified:false,error:error.message}}};
async function state() {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const reply = await fetch(value.url + 'health', {signal: AbortSignal.timeout(1500)});
    if (reply.ok) {
      const health=await reply.json(),expected=localRelease();
      return {...value,version:health.version||null,buildId:health.buildId||null,verified:!!health.verified,
        codeMatches:expected.verified&&health.buildId===expected.buildId,
        ...(expected.error?{localCodeError:expected.error}:{})};
    }
  }catch {}
  return null;
}
async function start() {
  const existing = await state(); if (existing) {if(!existing.codeMatches)throw Error('Running Aexus backend does not match this CLI/build. Check status, then explicitly upgrade or stop the old service.');return existing;}
  const local=localRelease();if(!local.verified)throw Error('Aexus source/UI fingerprint is invalid: '+local.error);
  registry.ensure();
  const log = fs.openSync(path.join(registry.home, 'server.log'), 'a', 0o600);
  const child = spawn(process.execPath, [__filename, 'serve'], {env: process.env, detached: true, windowsHide: true, stdio: ['ignore', log, log]}); child.unref(); fs.closeSync(log);
  for (let i = 0; i < 80; i++) {await new Promise(r => setTimeout(r, 100)); const value = await state(); if (value) return value;}
  throw Error('Aexus service did not start; inspect ' + path.join(registry.home, 'server.log'));
}
async function rpc(method, params = {}) {
  const value = await start();
  const reply = await fetch(value.url + 'rpc', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({jsonrpc: '2.0', id: Date.now(), method, params})}).then(r => r.json());
  if (reply.error) throw Error(reply.error.message); return reply.result;
}
const help = `Aexus — native Agents, Roles and cloud hosts CLI\n\naexus list [--json]\naexus get HOST\naexus check HOST|--all\naexus exec HOST --command TEXT [--directory DIR] [--timeout SECONDS]\naexus shell HOST\naexus files HOST --operation list_files|read_file|write_file|edit_file --data @file.json\naexus files HOST --directory ABSOLUTE_PATH --operation workspace --data @file-action.json  # list/read/write/mkdir/move/trash/restore\naexus create --data @host.json\naexus update HOST --data @patch.json\naexus remove HOST\naexus agent-hosts\naexus agent-list [WORK_HOST]\\naexus agent-order WORK_HOST\\naexus agent-swap WORK_HOST --first AGENT_ID --second AGENT_ID\\naexus agent-activate WORK_HOST --session ID\\naexus agent-tui WORK_HOST --session ID\naexus agent-open ENGINE_HOST --target-host WORK_HOST --engine codex --name NAME --directory DIR\naexus agent-rename WORK_HOST --session ID --name NAME\naexus agent-close WORK_HOST --session ID\naexus agent-restart WORK_HOST --session ID\naexus agent-send WORK_HOST --session ID --text TEXT\naexus agent-read WORK_HOST --session ID [--cursor N]\naexus terminal-open HOST\naexus terminal-input HOST --terminal ID --input TEXT\naexus terminal-read HOST --terminal ID [--cursor N] [--wait-ms N]\naexus terminal-close HOST --terminal ID\naexus desktop-open HOST\naexus inspect HOST\naexus rdp-credentials HOST\naexus rdp-open HOST [--data -]\naexus rdp-list [HOST]\naexus rdp-close HOST --data SESSION_JSON\naexus station list\naexus station import --path FILE_OR_FOLDER [--parent FOLDER_ID]\naexus station create --name NAME --type file|folder [--parent FOLDER_ID] [--text TEXT]\naexus station update ITEM --name NAME [--parent FOLDER_ID|root]\naexus station read ITEM\naexus station write ITEM --text TEXT\naexus station fetch HOST --directory DIR --path FILE\naexus station send ITEM HOST --directory DIR [--name NAME]\naexus station copy --source-host HOST --source-directory DIR --path RELATIVE --host HOST --directory DIR --to RELATIVE  # copy file/folder including hidden; no overwrite\naexus station export ITEM --destination FILE_OR_DIR\naexus station remove ITEM\naexus station cancel JOB\naexus messages list|create|update|archive|history|post|read [GROUP_ID] [--data @json]
aexus messages post GROUP_ID --text 'Out-of-band note' [--client-message-id KEY]
aexus workspaces list|register|projects|projectCreate|projectUpdate|projectArchive [ID] [--data @json]
aexus messages sessions
aexus messages nativeHistory SESSION_ID [--limit N] [--before N] [--search TEXT]
aexus plan list|create|update|archive|history|run [PLAN_ID] [--data @json]
aexus plan create --data @plan.json  # disabled by default; no preprompt
aexus api info|list|describe|docs|call [COMMAND] [--search TEXT] [--prefix PREFIX] [--data JSON|@file]
aexus sync-vscode [--data @options.json]\naexus migrate --from DIR\naexus start|serve|status|stop|open\n\nLegacy hosts.* methods remain available with --data JSON or @file.\nCommands and file operations run only on the selected local or remote host.\n`;
async function main(args = process.argv.slice(2)) {
  const option = name => {const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1];};
  const method = args[0];
  if (!method || ['--help', '-h', 'help'].includes(method)) {console.log(help); return;}
  let data = option('--data');
  if (data === '-') {data = fs.readFileSync(0, 'utf8');}
  const params = data ? JSON.parse(data.startsWith('@') ? fs.readFileSync(data.slice(1), 'utf8') : data) : {};
  if (method === 'migrate') return registry.migrate(option('--from'));
  if (method === 'serve') return require('./src/server.cjs').serve(Number(option('--port') || 0));
  if (method === 'start') return start();
  if (method === 'status') return await state() || {ready: false, home: registry.home, localRelease:localRelease()};
  if (method === 'stop') {const value = await state(); if (value) process.kill(value.pid, 'SIGTERM'); return {stopped: !!value};}
  if (method === 'open') {const value = await start(); spawn(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open', [value.url], {stdio: 'ignore'}); return {url: value.url};}
  if (method === 'sync-vscode') return require('./src/vscode.cjs').sync(params);
   if(method==='api'){
     const action=args[1],name=args[2];
     if(action==='info')return rpc('api.info');
     if(action==='list')return rpc('api.list',{search:option('--search')||'',prefix:option('--prefix')||'',agentOnly:args.includes('--agent-only')});
     if(action==='describe')return rpc('api.describe',{command:name});
     if(action==='docs')return rpc('api.document',{document:name||'index'});
     if(action==='call'){
       const contract=require('./src/api-contracts.cjs'),methodName=contract.resolve(name),spec=contract.lookup(methodName);
       if(!spec)throw Error('Undocumented Core command: '+name);
       contract.validate(spec.inputSchema,params);
       return rpc(methodName,params);
     }
     throw Error('API action must be info, list, describe, docs or call');
   }
  if(method==='workspaces'){
    const mapping={list:'list',get:'get',register:'register',unregister:'unregister',projects:'projects',project:'project',projectCreate:'projectCreate',projectUpdate:'projectUpdate',projectArchive:'projectArchive'};
    const sub=args[1];if(!Object.hasOwn(mapping,sub))throw Error('Unknown workspaces action: '+sub);
    if(args[2]&&!args[2].startsWith('--'))params.id=args[2];
    return rpc('workspaces.'+mapping[sub],params);
  }
  if(method==='messages'||method==='plan'){
    const action=args[1],allowed=method==='messages'
      ? ['list','get','create','update','archive','history','post','read','sessions','nativeHistory']
      : ['list','get','create','update','archive','history','preview','run'];
    if(!allowed.includes(action))throw Error('Unknown '+method+' action: '+action);
    const id=args[2]&&!args[2].startsWith('--')?args[2]:undefined;
    if(id)params[action==='nativeHistory'?'sessionId':'id']=id;
    for(const [flag,key] of [['--name','name'],['--text','text'],['--client-message-id','clientMessageId'],['--reply-to','replyTo']])
      if(option(flag)!==undefined)params[key]=option(flag);
    if(option('--limit')!==undefined)params.limit=Number(option('--limit'));
    if(option('--before')!==undefined)params.before=Number(option('--before'));
    if(option('--sequence')!==undefined)params.sequence=Number(option('--sequence'));
    if(option('--search')!==undefined)params.search=option('--search');
    return rpc(method+'.'+action,params);
  }
  if (method === 'station') {
    const action = args[1];
    if (action === 'fetch') params.host = args[2];
    if (['send', 'export', 'remove', 'update', 'read', 'write'].includes(action)) params.item = args[2];
    if (action === 'send') params.host = args[3];
    if (action === 'cancel') params.job = args[2];
    if (action === 'copy') {
      for(const [flag,field] of [['--source-host','sourceHost'],['--source-directory','sourceDirectory'],['--path','path'],['--host','host'],['--directory','directory'],['--to','to']])if(option(flag)!==undefined)params[field]=option(flag);
    }
    for (const field of ['path', 'directory', 'destination', 'name', 'parent', 'type', 'text']) if (option('--' + field) !== undefined) params[field] = option('--' + field) === 'root' ? null : option('--' + field);
    if (option('--expected-hash') !== undefined) params.expectedHash = option('--expected-hash');
    if (args.includes('--force')) params.force = true;
    let result = await rpc('station.' + action, params);
    if (['fetch', 'send', 'copy'].includes(action)) {
      while (result.state === 'running') {
        await new Promise(resolve => setTimeout(resolve, 300));
        result = (await rpc('station.list')).jobs.find(job => job.id === result.id);
      }
      if (result.state !== 'done') throw Error(result.error || 'Transfer cancelled');
      return result.result;
    }
    return result;
  }
  const positional = args[1] && !args[1].startsWith('--') ? args[1] : params.id;
  if (method === 'shell') {
    if (positional === 'local') {
      const cwd=option('--directory') || os.homedir();
      const shell=process.platform==='win32'?'powershell.exe':process.env.SHELL||'/bin/bash';
      const flags=process.platform==='win32'?['-NoLogo','-NoExit']:['-il'];
      const child=spawn(shell,flags,{cwd,env:process.env,stdio:'inherit'});
      return await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>{process.exitCode=code;resolve()})});
    }
    const target = registry.target(positional, option('--directory'));
    const command = target.os === 'windows' ? 'powershell.exe -NoLogo -NoExit -EncodedCommand ' + ssh.encoded('Set-Location -LiteralPath ' + ssh.psquote(target.directory) + '; if (Get-Module -ListAvailable PSReadLine) { Import-Module PSReadLine -ErrorAction SilentlyContinue }') : 'cd -- ' + ssh.quote(target.directory) + ' && exec "${SHELL:-/bin/bash}" -il';
    const child = spawn('ssh', [...ssh.args(target, true), command], {env: ssh.env(target), stdio: 'inherit'});
    return await new Promise((resolve, reject) => {child.once('error', reject); child.once('close', code => {process.exitCode = code; resolve();});});
  }
  if (method === 'check' && args.includes('--all')) {
    const rows = registry.list(), results = [], queue = rows.slice();
    await Promise.all(Array.from({length: Math.min(3, rows.length)}, async () => {while (queue.length) {const host = queue.shift(); results.push(host.vm && host.vm.access !== 'ssh' ? {id: host.id, name: host.name, skipped: true, reason: 'SSH is not configured', connected: false} : {id: host.id, name: host.name, ...await rpc('hosts.check', {id: host.id})});}}));
    if (results.some(r => !r.skipped && !r.connected)) process.exitCode = 1; return results;
  }
  const names = {list: 'list', get: 'get', create: 'create', update: 'update', remove: 'remove', check: 'check', exec: 'exec', files: 'files'};
  const command = method.startsWith('hosts.') ? method : 'hosts.' + (names[method] || method);
  if (positional) params.id = positional === 'local' ? 'local' : registry.get(positional).id;
  if (method === 'update' && !params.patch) {const id = params.id; const patch = {...params}; delete patch.id; Object.assign(params, {id, patch});}
  for (const [flag, field] of [['--command', 'command'], ['--directory', 'directory'], ['--terminal', 'terminal'], ['--input', 'data'], ['--operation', 'operation'], ['--engine-host','engineHostId'], ['--target-host','targetHostId'], ['--engine','engine'], ['--name','name'], ['--session','session'], ['--first','first'], ['--second','second'], ['--text','text'], ['--permission','permission'], ['--request-id','requestId'], ['--decision','decision']]) if (option(flag) !== undefined) params[field] = option(flag);
  for (const [flag, field] of [['--timeout', 'timeout'], ['--cursor', 'cursor'], ['--wait-ms', 'waitMs'], ['--cols', 'cols'], ['--rows', 'rows']]) if (option(flag) !== undefined) params[field] = Number(option(flag));
  const result = await rpc(command, params);
  if (command === 'hosts.exec' && result.exit_code) process.exitCode = result.exit_code;
  if (command === 'hosts.check' && !result.connected) process.exitCode = 1;
  return result;
}
if (require.main === module) main().then(result => {if (result !== undefined) console.log(JSON.stringify(result, null, 2));}).catch(error => {console.error(error.message); process.exitCode = 1;});
module.exports = {main, rpc, start, state};
