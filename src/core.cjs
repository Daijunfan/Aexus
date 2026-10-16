const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const registry = require('./registry.cjs');
const ssh = require('./ssh.cjs');
const terminals = require('./terminals.cjs');
const agents = require('./agent-sessions.cjs');
const localFiles = require('./local-files.cjs');
const localHost = require('./local-host.cjs');
const desktops = require('./desktops.cjs');
const station = require('./station.cjs');
const collaboration=require('./collaboration.cjs');
const plan=require('./plan-scheduler.cjs');
const schema = require('../schema.json');
const {isDeepStrictEqual} = require('node:util');
// Display-only edits do not invalidate live connections. The form also submits
// unchanged optional fields, so compare effective values rather than key presence.
function changesConnection(host, patch) {
  const normalize = (key, value) => key === 'port' ? value || 22 : key === 'desktop' ? value || null : value || '';
  return ['host','port','os','defaultDirectory','identityFile','knownHosts','sshConfig','jump','desktop'].some(key =>
    key in patch && !isDeepStrictEqual(normalize(key, host[key]), normalize(key, patch[key])))
    || ('password' in patch && String(patch.password || '') !== registry.password(host.id));
}
const methods = new Set(schema.commands.map(c => c.method));
methods.add('hosts.files');
async function dispatch(method, args = {}, signal) {
  // Hosted Aexus has one owner, one Core and original authenticated business API.
  // These methods expose only redacted runtime state and read-only projections.
  if(method==='agentboard.runtime'||method==='roleboard.runtime')return require('./agentboard-supervisor.cjs').shared().state();
  if(method==='roleboard.start')return require('./agentboard-supervisor.cjs').shared().start();
  if(method==='agentboard.roster'||method==='roleboard.roster')return require('./agentboard-supervisor.cjs').shared().roster();
  if(method==='agentboard.ticket'||method==='roleboard.ticket')return require('./agentboard-supervisor.cjs').shared().issueTicket(args);
  if(method==='agentboard.native'||method==='roleboard.native')return require('./agentboard-native.cjs').request(args);
  const contracts=require('./api-contracts.cjs'),plugins=require('./plugins.cjs');
  if(method==='api.info')return {...contracts.metadata(),connectedPlugins:plugins.list().length,pluginSchemaHash:plugins.version()};
  if(method==='api.list')return [...contracts.list(args),...plugins.catalog(null,args)];
  if(method==='api.describe')return String(args.command||'').startsWith('plugin.')?plugins.describe(args.command):contracts.describe(args.command);
  if(method==='api.document')return String(args.document||'').startsWith('plugin/')?plugins.document(args.document):contracts.document(args.document||'index');
  if(method==='plugins.list')return plugins.list(args);
  if(method==='plugins.attach')return plugins.attach(args);
  if(method==='plugins.detach')return plugins.detach(args);
  if(method==='plugins.grant')return plugins.grant(args);
  if(method==='plugins.describe')return plugins.describe(args.command);
  if(method==='plugins.call')return plugins.call(args);
  // Channels share the existing collaboration SQLite connection and expose
  // one command registry to App, Web, CLI and authenticated Agent tools.
  if(method.startsWith('channel.')){
    const contract=contracts.lookup(method);
    if(!contract||contract.contractStatus!=='strict')throw Error('Unknown Channel command');
    contracts.validate(contract.inputSchema,args);
    const result=require('./channels.cjs').dispatch(method,args,{kind:'operator'});
    contracts.validate(contract.outputSchema,result,'result');return result;
  }
  // Aexus Messenger preferences project canonical native journals and group
  // records; this operator-owned view cannot create another conversation store.
  if(method.startsWith('messenger.')){
    const contract=contracts.lookup(method);
    if(!contract||contract.contractStatus!=='strict'||contract.agentCallable)throw Error('Unknown user Messenger command');
    contracts.validate(contract.inputSchema,args);
    const result=await require('./messenger-state.cjs').dispatch(method,args);
    contracts.validate(contract.outputSchema,result,'result');
    return result;
  }
  // Canonical terminal owners are immutable for the lifetime of a session.
  // Validate ownership in memory instead of reading hosts.json per keystroke.
  if (['hosts.terminal-read', 'hosts.terminal-input', 'hosts.terminal-resize', 'hosts.terminal-close'].includes(method)) {
    const owner = terminals.terminalOwner(args.terminal);
    const id = owner === 'host:' + args.id ? args.id : (args.id==='local'?'local':registry.get(args.id).id);
    const terminal = desktops.requireHostTerminal(id, args.terminal);
    if (method === 'hosts.terminal-read') return terminals.read(terminal, args.cursor, args.waitMs, signal, args.maxChars);
    if (method === 'hosts.terminal-input') return terminals.input(terminal, args.data);
    if (method === 'hosts.terminal-resize') return terminals.resize(terminal, args.cols, args.rows);
    return terminals.close(terminal);
  }
  if (method === 'hosts.agent-hosts') return agents.hosts();
  if (method === 'hosts.agent-list') return agents.sessions(args.id);
  if (method === 'hosts.agent-order') return agents.order(args);
  if (method === 'hosts.agent-swap') return agents.swap(args);
  if (method === 'hosts.agent-capabilities') return agents.capabilities(args.id,args.targetHostId);
  if (method === 'hosts.agent-open') return agents.open(args);
  if (method === 'hosts.agent-close') return agents.close(args);
  if (method === 'hosts.agent-rename') return agents.rename(args);
  if (method === 'hosts.agent-configure') return agents.configure(args);
  if (method === 'hosts.agent-restart') return agents.restart(args);
  if (method === 'hosts.agent-activate') return agents.activate(args);
  if (method === 'hosts.agent-tui') return agents.tui(args);
  if (method === 'hosts.agent-remove') return agents.remove(args);
  if (method === 'hosts.agent-read') return agents.read(args);
  if (method === 'hosts.agent-send') return agents.send({id:args.id,session:args.session,text:args.text});
  if (method === 'hosts.agent-respond') return agents.respond(args);
  if (method === 'hosts.agent-interrupt') return agents.interrupt(args);
  // Messages, Company and Plan operate on persistent Agent identities.
  // Group send durably records each recipient before native execution.
  const messagesMethods={list:'list',get:'get',create:'create',update:'update',archive:'archive',history:'messages',search:'search',entry:'entry',post:'post',send:'post',retry:'retry',read:'readMessage'};
  if(method==='messages.publish')return collaboration.post({...args,kind:args.kind||'result',mentions:[]});
  if(method==='messages.sessions')return require('./session-journal.cjs').summaries();
  if(method==='messages.nativeHistory')return require('./session-journal.cjs').history(args);
  if(method==='messages.nativeSend')return agents.send({id:args.id,session:args.session,text:args.text});
  if(method==='messages.nativeInterrupt')return agents.interrupt({id:args.id,session:args.session});
  if(method==='messages.approvals'){
    return agents.sessions().flatMap(agent=>{try{return agents.read({id:agent.targetHostId,session:agent.id,cursor:0}).approvals.map(approval=>({...approval,agentId:agent.id,engine:agent.engine,agentName:agent.name,targetHostId:agent.targetHostId}))}catch{return []}});
  }
  if(method.startsWith('messages.')&&Object.hasOwn(messagesMethods,method.slice(9))){
    return collaboration[messagesMethods[method.slice(9)]](args);
  }
  const views=require('./plan-views.cjs');
  if(method==='plan.schema')return {version:1,layouts:views.layouts,views:'plan.views',records:'plan.query'};
  if(method==='plan.views')return views.list(args);
  if(method==='plan.view-create')return views.create(args);
  if(method==='plan.view-update')return views.update(args);
  if(method==='plan.view-delete')return views.remove(args);
  const planMethods={list:'list',get:'get',create:'create',update:'update',archive:'archive',history:'history',preview:'preview',run:'run',cancel:'cancel',calendar:'calendar',timeline:'timeline',query:'query',analytics:'analytics',feed:'feed'};
  if(method.startsWith('plan.')&&Object.hasOwn(planMethods,method.slice(5)))
    return plan[planMethods[method.slice(5)]](args);
  const company=require('./company.cjs');
  const companyMethods={roster:'roster',teams:'teams',createTeam:'createTeam',updateTeam:'updateTeam',assignRole:'assignRole',bindings:'bindings',bind:'bind',delegate:'delegate',tasks:'tasks',task:'task',retry:'retry'};
  if(method.startsWith('company.')&&Object.hasOwn(companyMethods,method.slice(8)))return company[companyMethods[method.slice(8)]](args);
  if (method === 'station.list') return station.list();
  if (method === 'station.import') return station.importFile(args.path, args.parent);
  if (method === 'station.create') return station.create(args.name, args.type, args.parent, args.text);
  if (method === 'station.update') return station.update(args.item, args.patch || args);
  if (method === 'station.read') return station.read(args.item);
  if (method === 'station.write') return station.write(args.item, args.text, args.expectedHash, args.force === true);
  if (method === 'station.fetch') return station.fetchFile(args.host, args.directory, args.path, args.parent);
  if (method === 'station.send') return station.sendFile(args.item, args.host, args.directory, args.name);
  if (method === 'station.copy') return station.copyBetweenHosts(args);
  if (method === 'station.export') return station.exportFile(args.item, args.destination);
  if (method === 'station.remove') return station.remove(args.item);
  if (method === 'station.cancel') return station.cancel(args.job);
  const workspaces=require('./workspaces.cjs');
  const workspaceMethods={list:'list',get:'get',register:'register',unregister:'unregister',projects:'projects',project:'project',projectCreate:'createProject',projectUpdate:'updateProject',projectArchive:'archiveProject'};
  if(method.startsWith('workspaces.')&&Object.hasOwn(workspaceMethods,method.slice(11)))return workspaces[workspaceMethods[method.slice(11)]](args);
  if (!methods.has(method)) throw Error('Unknown host command: ' + method);
  const local=()=>({...agents.hosts().find(host=>host.id==='local'),status:{connected:true,local:true},local:true});
  if (method === 'hosts.list') return [local(),...registry.list()].filter(h => (!args.os || h.os === args.os) && (!args.distribution || h.distribution === args.distribution));
  if (method === 'hosts.get') return args.id === 'local' ? local() : registry.get(args.id);
  if (method === 'hosts.reorder') return [local(),...registry.reorder(args.ids.filter(id=>id!=='local'))];
  if (method === 'hosts.workspace') return registry.workspace(args.patch);
  if (method === 'hosts.inspect') return args.id === 'local' ? localHost.inspect() : require('./host-info.cjs').inspect(args.id);
  if (method === 'hosts.rdp-open') return require('./rdp.cjs').open(args.id,args);
  if (method === 'hosts.rdp-list') return require('./rdp.cjs').list(args.id);
  if (method === 'hosts.rdp-credentials') return require('./rdp-credentials.cjs').status(args.id);
  if (method === 'hosts.rdp-close') return require('./rdp.cjs').close(args.id,args.session);
  if (method === 'hosts.create') return registry.create(args);
  if (method === 'hosts.update') {if(args.id==='local')throw Error('Local Core host settings are managed by your computer');const host = registry.get(args.id); if(changesConnection(host, args.patch)){agents.assertHostIdle(host.id); desktops.assertHostIdle(host.id); await require('./agentboard-supervisor.cjs').shared().assertHostUnbound(host.id);} return registry.update(host.id, args.patch);}
  if (method === 'hosts.remove') {if(args.id==='local')throw Error('Local Core host cannot be deleted');const id = registry.get(args.id).id; agents.assertHostRemovable(id); desktops.assertHostIdle(id); await require('./agentboard-supervisor.cjs').shared().assertHostUnbound(id); await desktops.closeHostConnections(id); return registry.remove(id);}
  if (method === 'hosts.check') return args.id === 'local' ? local().status : ssh.check(args.id);
  if (method === 'hosts.exec') return args.id==='local'?localHost.execute(args.command,args.directory,args.timeout):ssh.execute(args.id,args.command,args.directory,args.timeout);
  if (method === 'hosts.files') return args.id === 'local' ? localFiles.files(args.operation||'workspace',args.arguments||{operation:'list',args:{path:args.path||'.'}},args.directory) : ssh.files(args.id, args.operation || 'list_files', args.arguments || {path: args.path || '.'}, args.directory);
  if (method === 'hosts.directories') {
    const result = await (args.id==='local'?localFiles.files('workspace',{operation:'list',args:{path:'.'}},args.path||args.directory):ssh.files(args.id,'workspace',{operation:'list',args:{path:'.'}},args.path||args.directory));
    return {path: result.root, entries: result.entries.filter(entry => entry.directory)};
  }
  if (method === 'hosts.credentials') return args.id==='local'?{id:'local',password:''}:{id:registry.get(args.id).id,password:registry.password(args.id)};
  if (method === 'hosts.fingerprints') return ssh.fingerprints(args.id);
  if (method === 'hosts.trust') {
    const host = registry.get(args.id), key = (await ssh.fingerprints(args.id)).find(key => key.fingerprint === args.fingerprint);
    if (!key) throw Error('Fingerprint has changed or does not match');
    const dir = path.join(registry.home, 'known_hosts'); fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    const file = path.join(dir, host.id); fs.writeFileSync(file, key.line + '\n', {mode: 0o600});
    registry.update(host.id, {knownHosts: file}); return file;
  }
  const id = args.id==='local'?'local':registry.get(args.id).id;
  if (method === 'hosts.terminal-list') return (id==='local'?terminals.listTerminals('host:local'):desktops.hostTerminals(id)).filter(t => t.kind !== 'agent');
  if (method === 'hosts.terminal-open') return id==='local'?terminals.openTerminal({id:'host:local',cwd:args.directory||os.homedir()},args.cols,args.rows):desktops.openHostTerminal(id,args.directory,args.cols,args.rows);
  if (method === 'hosts.desktop-list') return desktops.listHostDesktops(id);
  if (method === 'hosts.desktop-open') return desktops.openHostDesktop(id);
  if (method === 'hosts.desktop-launch') return desktops.launchHostDesktop(id, args.session);
  if (method === 'hosts.desktop-close') return desktops.closeHostDesktop(id, args.session);
}
async function shutdown() {await plan.stop();require('./collaboration-execution.cjs').stop();require('./company-execution.cjs').stop();await agents.shutdown();await require('./rdp.cjs').shutdown();for (const host of registry.list()) await desktops.closeHostConnections(host.id); await terminals.shutdown();}
module.exports = {dispatch, shutdown, methods};
