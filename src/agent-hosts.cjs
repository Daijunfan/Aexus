// Agent launch hosts and work hosts are separate identities. "local" is the Core machine.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const registry = require('./registry.cjs');
const ssh = require('./ssh.cjs');
const ENGINES = Object.freeze(['codex', 'claude', 'cline', 'pi', 'opencode']);
const POSIX_PATH = 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"; ';
const WINDOWS_PATH = '$env:PATH=(Join-Path $env:USERPROFILE ".local\\bin")+";"+(Join-Path $env:USERPROFILE ".npm-global\\bin")+";"+$env:PATH; ';
const local = () => ({id:'local', name:'本地主机', host:os.hostname(), os:process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux', defaultDirectory:os.homedir(), local:true});
function get(id) {return id === 'local' ? local() : registry.get(id);}
function list() {return [local(), ...registry.list().map(h => ({...h, local:false}))];}
function publicHost(host) {return {id:host.id, name:host.name, host:host.host, os:host.os, distribution:host.distribution, local:host.id === 'local'};}
function directory(host, value) {
  const text = String(value === undefined ? host.defaultDirectory : value).trim();
  if (!text || /[\0\r\n]/.test(text) || text.length > 4096) throw Error('无效的工作目录');
  if (!(host.os === 'windows' ? /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(text) : text.startsWith('/'))) throw Error('工作目录必须是工作主机上的绝对路径');
  return text;
}
function binary(engine) {
  if (!ENGINES.includes(engine)) throw Error('不支持的 Agent 引擎');
  const configured = process.env['CLOUD_HOSTS_' + engine.toUpperCase()];
  const dirs = [...(process.env.PATH || '').split(path.delimiter), path.join(os.homedir(), '.npm-global/bin'), path.join(os.homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  const candidates = configured ? [configured] : dirs.flatMap(dir => (process.platform === 'win32' ? ['.exe','.cmd',''] : ['']).map(ext => path.join(dir, engine + ext)));
  return candidates.find(file => {try {fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile();} catch {return false;}});
}
function remoteCommand(host, engine, argv, environment, cwd) {
  if (!ENGINES.includes(engine)) throw Error('不支持的 Agent 引擎');
  if (host.os === 'windows') {
    const env = WINDOWS_PATH + Object.entries(environment).map(([key,value]) => '$env:' + key + '=' + ssh.psquote(value) + '; ').join('');
    return ssh.command({...host, directory:cwd}, env + '$program=(Get-Command -Name '+ssh.psquote(engine)+' -CommandType Application -ErrorAction Stop|Select-Object -First 1).Source; & $program ' + argv.map(ssh.psquote).join(' ') + '; exit $LASTEXITCODE');
  }
  const env = Object.entries(environment).map(([key,value]) => 'export ' + key + '=' + ssh.quote(value) + '; ').join('');
  const script = POSIX_PATH + 'cd -- ' + ssh.quote(cwd) + ' && ' + env + 'exec ' + engine + ' ' + argv.map(ssh.quote).join(' ');
  return 'exec "${SHELL:-/bin/sh}" -lc ' + ssh.quote(script);
}
function processOn(host, engine, argv = [], {cwd = host.defaultDirectory, environment = {}} = {}) {
  if (!ENGINES.includes(engine)) throw Error('不支持的 Agent 引擎');
  if (Object.keys(environment).some(key => !/^[A-Z][A-Z0-9_]*$/.test(key))) throw Error('Invalid process environment');
  if (host.id !== 'local') {
    const target = registry.target(host.id, cwd);
    return spawn(ssh.sshExecutable(), [...ssh.args(target), remoteCommand(host, engine, argv, environment, cwd)], {env:ssh.env(target), stdio:['pipe','pipe','pipe'], windowsHide:true});
  }
  const executable = binary(engine);
  if (!executable) throw Error('本地主机尚未安装 ' + engine + ' CLI');
  const options = {cwd, env:{...process.env, ...environment}, stdio:['pipe','pipe','pipe'], windowsHide:true};
  if (process.platform === 'win32' && /\.cmd$/i.test(executable)) {
    const script = '& ' + ssh.psquote(executable) + ' ' + argv.map(ssh.psquote).join(' ') + '; exit $LASTEXITCODE';
    return spawn('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',ssh.encoded(script)], options);
  }
  return spawn(executable, argv, options);
}
function collect(child, timeout = 16000) {
  return new Promise((resolve,reject) => {
    let stdout = '', stderr = '', expired = false;
    const timer = setTimeout(() => {expired = true; child.kill();}, timeout);
    child.stdout.on('data',data => {stdout = (stdout + data).slice(-65536);});
    child.stderr.on('data',data => {stderr = (stderr + data).slice(-4000);});
    child.stdin.on('error',() => {}); child.stdin.end();
    child.once('error',error => {clearTimeout(timer); reject(error);});
    child.once('close',code => {clearTimeout(timer); resolve({stdout,stderr,exit_code:expired ? 124 : code ?? 1});});
  });
}
// Persist the launch account and Codex data directory with the native thread.
// Never infer that the same UUID on a different OS account or CODEX_HOME means
// the same conversation. Remote probes read only identity metadata, not auth.
async function identity(host) {
  const base={engine:'codex',sourceId:host.id,address:host.id==='local'?os.hostname():host.host,os:host.os};
  if(host.id==='local')return {...base,account:os.userInfo().username,
    dataDir:path.resolve(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'))};
  const command=host.os==='windows'
    ? "$p=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'};Write-Output ('__CLOUDHOSTS_USER__'+$env:USERNAME);Write-Output ('__CLOUDHOSTS_DATA__'+$p)"
    : 'printf "__CLOUDHOSTS_USER__%s\\n__CLOUDHOSTS_DATA__%s\\n" "$(id -un)" "${CODEX_HOME:-$HOME/.codex}"';
  const result=await ssh.execute(host.id,command,host.defaultDirectory,20);
  if(result.exit_code)throw Error('Cannot verify native Codex account/data directory on '+host.name+': '+(result.stderr||'SSH unavailable').trim().slice(0,220));
  const lines=result.stdout.split(/\r?\n/).map(line=>line.trim());
  const account=lines.find(line=>line.startsWith('__CLOUDHOSTS_USER__'))?.slice('__CLOUDHOSTS_USER__'.length);
  const dataDir=lines.find(line=>line.startsWith('__CLOUDHOSTS_DATA__'))?.slice('__CLOUDHOSTS_DATA__'.length);
  if(!account||!dataDir||dataDir.length>4096)throw Error('Codex engine account or data directory could not be verified on '+host.name);
  return {...base,account,dataDir};
}

async function capabilities(id,targetHostId,selectedEngine) {
  const host = get(id);
  let engines;
  if (host.id === 'local') engines = Object.fromEntries(ENGINES.map(engine => [engine, !!binary(engine)]));
  else {
    const script = host.os === 'windows' ? WINDOWS_PATH + ENGINES.map(engine => "if (Get-Command -Name '" + engine + "' -ErrorAction SilentlyContinue) { '" + engine + "' }").join('; ') : POSIX_PATH + 'for tool in ' + ENGINES.join(' ') + '; do if command -v "$tool" >/dev/null 2>&1; then printf "%s\\n" "$tool"; fi; done';
    const command = host.os === 'windows' ? script : 'exec "${SHELL:-/bin/bash}" -lic ' + ssh.quote(script);
    const result = await ssh.execute(host.id, command, undefined, 16);
    if (result.exit_code) throw Error(result.stderr?.trim() || '无法检测 Agent 引擎');
    const lines = result.stdout.trim().split(/\r?\n/).map(line => line.trim());
    engines = Object.fromEntries(ENGINES.map(engine => [engine, lines.includes(engine)]));
  }
  const transparentRouting=Object.fromEntries(ENGINES.map(engine=>[engine,false])),notes={};
  const eligible=engine=>host.id==='local'&&engines[engine]&&targetHostId&&targetHostId!=='local'&&(!selectedEngine||selectedEngine===engine);
  const verify=async(engine,probe)=>{
    if(!eligible(engine))return;
    try{await probe();transparentRouting[engine]=true;notes[engine]=engine+' native execution verified.'}
    catch(error){notes[engine]=engine+' remote execution is unavailable: '+error.message.slice(0,260)}
  };
  await Promise.all([
    verify('codex',async()=>{
      const workHost=get(targetHostId);
      const [sourceVersion,clientHelp,workerHelp]=await Promise.all([
        collect(processOn(host,'codex',['--version']),9500),
        collect(processOn(host,'codex',['app-server','--help']),9500),
        collect(processOn(workHost,'codex',['exec-server','--help']),30000)
      ]);
      if(sourceVersion.exit_code||clientHelp.exit_code||workerHelp.exit_code)throw Error('A required native Codex CLI command is unavailable');
      if(!/codex(?:-cli)?\s+\d+\.\d+/i.test(sourceVersion.stdout+sourceVersion.stderr))throw Error('Codex source version could not be verified');
      if(!/\blisten\b/i.test(clientHelp.stdout+clientHelp.stderr))throw Error('Codex app-server stdio connection is not supported');
      if(!/\blisten\b/i.test(workerHelp.stdout+workerHelp.stderr))throw Error('Work-host Codex exec-server is not supported');
    }),
    verify('pi',async()=>{
      const [help,tools]=await Promise.all([collect(processOn(host,'pi',['--help']),9500),ssh.files(targetHostId,'native_io',{operation:'tools'})]);
      if(help.exit_code||!['--no-builtin-tools','--no-context-files','--extension','--tools'].every(flag=>help.stdout.includes(flag)))throw Error('The installed Pi CLI does not support native tool adapters');
      if(!tools.rg)throw Error('The work host needs ripgrep for native search');
    }),
    verify('cline',async()=>{
      const worker=new (require('./agent-cline-worker.cjs').ClineWorker)(targetHostId,get(targetHostId).defaultDirectory);
      try{
        const probe='import {sdk} from '+JSON.stringify(require('node:url').pathToFileURL(path.join(__dirname,'../Runtime/cline_sdk.mjs')).href)+
          ';for(const name of ["LocalRuntimeHost","DefaultRuntimeBuilder","startHubWebSocketServer","getClineDefaultSystemPrompt"])if(typeof sdk[name]!=="function")throw Error("Native Cline API unavailable: "+name);';
        const [source,remote]=await Promise.all([collect(spawn(process.execPath,['--input-type=module','-e',probe],{stdio:['pipe','pipe','pipe'],windowsHide:true}),12000),worker.request('initialize')]);
        if(source.exit_code)throw Error('The source Cline SDK does not support native execution adapters');
        if(!['readFile','search','bash','webFetch','editor','applyPatch'].every(name=>remote.methods.includes(name)))throw Error('The target Cline SDK is missing native executors');
        if(!remote.checkpoints)throw Error('The target Cline SDK is missing native workspace restore');
      }finally{worker.close()}
    }),
    verify('claude',async()=>{
      const workHost=get(targetHostId);
      const [version,targetVersion,nodeVersion]=await Promise.all([
        collect(processOn(host,'claude',['--version']),9500),
        collect(processOn(workHost,'claude',['--version']),30000),
        ssh.execute(targetHostId,(workHost.os==='windows'?'& ':POSIX_PATH)+'node --version',undefined,30)
      ]);
      const match=version.stdout.match(/(\d+)\.(\d+)\.(\d+)/),targetMatch=targetVersion.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
      if(version.exit_code||!match||Number(match[1])<2||Number(match[1])===2&&(Number(match[2])<1||Number(match[2])===1&&Number(match[3])<299))throw Error('The controller needs Claude Code 2.1.299 or newer');
      if(targetVersion.exit_code||!targetMatch||Number(targetMatch[1])<2||Number(targetMatch[1])===2&&(Number(targetMatch[2])<1||Number(targetMatch[2])===1&&Number(targetMatch[3])<287))throw Error('The work host needs Claude Code 2.1.287 or newer');
      if(nodeVersion.exit_code||Number(nodeVersion.stdout.match(/v(\d+)\./)?.[1]||0)<18)throw Error('The work host needs Node.js 18 or newer');
      const worker=new (require('./agent-claude-worker.cjs').ClaudeWorker)(targetHostId,workHost.defaultDirectory);
      try{await worker.request('initialize')}finally{worker.close()}
    })
  ]);
  return {hostId:host.id,host:publicHost(host),engines,transparentRouting,
    routingVerified:Object.values(transparentRouting).some(Boolean),routingNote:ENGINES.map(engine=>notes[engine]).filter(Boolean).join(' ')};
}
async function checkDirectory(host, cwd) {
  if (host.id === 'local') {
    if (!fs.statSync(cwd).isDirectory()) throw Error('工作目录不存在：' + cwd);
    return;
  }
  const result = await ssh.execute(host.id, host.os === 'windows' ? "if (!(Test-Path -LiteralPath . -PathType Container)) { throw 'Working directory unavailable' }" : 'test -d .', cwd, 16);
  if (result.exit_code) throw Error(result.stderr?.trim() || '工作主机目录不可用：' + cwd);
}
module.exports = {ENGINES, local, get, list, publicHost, directory, binary, processOn, remoteCommand, collect, capabilities, checkDirectory, identity};
