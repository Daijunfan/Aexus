const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {randomBytes} = require('node:crypto');
const registry = require('./registry.cjs');
const core = require('./core.cjs');
const station = require('./station.cjs');
const release = require('./release.cjs');
const file = path.join(registry.home, 'server.json');
const assets = path.join(__dirname, '../dist/ui');
const contentTypes = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png'};
async function serve(port = 0) {
  const build = release.verify(); // Refuse mismatched JS + UI even when the version string matches.
  registry.ensure();
  const lock = path.join(registry.home, 'server.pid');
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try {process.kill(pid, 0); return {alreadyRunning: true, pid};} catch {fs.rmSync(lock, {force: true});}
  }
  try {fs.writeFileSync(lock, String(process.pid), {mode: 0o600, flag: 'wx'});} catch (error) {if (error.code === 'EEXIST') return {alreadyRunning: true}; throw error;}
  process.on('exit', () => {try {if (Number(fs.readFileSync(lock, 'utf8')) === process.pid) fs.rmSync(lock, {force: true});} catch {}});
  const token = randomBytes(24).toString('hex'), prefix = '/' + token + '/';
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // External article collectors have only an independent, source-scoped
    // capability on loopback. They never receive the private Core URL token.
    if(url.pathname==='/channel-ingest')return require('./channel-ingress.cjs').handle(req,res);
    if (!url.pathname.startsWith(prefix)) {res.writeHead(404); res.end(); return;}
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${server.address().port}` && origin !== 'null') {res.writeHead(403); res.end(); return;}
    const name = url.pathname.slice(prefix.length);
    if(name==='events'&&req.method==='GET'){
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','connection':'keep-alive','x-accel-buffering':'no'});
      res.write(': connected\n\n');
      const unsubscribe=require('./core-events.cjs').subscribe(event=>{if(!res.destroyed)res.write('data: '+JSON.stringify(event)+'\n\n')});
      const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': ping\n\n')},25000);
      heartbeat.unref?.();res.on('close',()=>{clearInterval(heartbeat);unsubscribe()});return;
    }
    if (name === 'station/upload' && req.method === 'POST') {
      try {
        const item = await station.ingest(req, url.searchParams.get('name'), {kind: 'mac', name: 'Mac'}, {total: Number(req.headers['content-length']) || 0, parent: url.searchParams.get('parent') || null});
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(item));
      } catch (error) {if (!res.destroyed) {res.writeHead(400, {'content-type': 'application/json'});res.end(JSON.stringify({error: error.message}));}}
      return;
    }
    if (name.startsWith('station/thumbnail/') && req.method === 'GET') {
      const id = name.slice('station/thumbnail/'.length);
      try {const image = await require('./thumbnails.cjs').thumbnail(id);if (!image) {res.writeHead(404);res.end();return;}res.setHeader('content-type','image/png');res.setHeader('cache-control','private, max-age=3600');fs.createReadStream(image).pipe(res);}catch{res.writeHead(404);res.end();}return;
    }
    if (name.startsWith('station/download/') && req.method === 'GET') {
      try {
        const id = name.slice('station/download/'.length), item = station.get(id);
        const payload = item.type === 'folder' ? await require('./archives.cjs').archive(id) : station.file(id);
        res.writeHead(200, {'content-type': item.type === 'folder' ? 'application/zip' : 'application/octet-stream', 'content-length': fs.statSync(payload).size, 'content-disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(item.name + (item.type === 'folder' ? '.zip' : ''))});
        fs.createReadStream(payload).pipe(res);
      } catch {res.writeHead(404);res.end();}
      return;
    }
    if (name === 'health') {res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ready: true, pid: process.pid, home: registry.home, version:build.version, buildId:build.buildId, verified:true})); return;}
    if (name === 'rpc' && req.method === 'POST') {
      const controller = new AbortController(); res.on('close', () => controller.abort());
      let body = ''; for await (const chunk of req) {body += chunk; if (body.length > 8 * 1024 * 1024) {res.writeHead(413); res.end(); return;}}
      let request;
      try {
        request = JSON.parse(body);
        if(['agentboard.ticket','agentboard.native','roleboard.ticket','roleboard.native'].includes(request.method) &&
           req.headers.origin!==('http://127.0.0.1:'+server.address().port)){
          res.writeHead(403,{'content-type':'application/json'});
          res.end(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:'AgentBoard privileged request requires exact CloudHosts origin'}}));
          return;
        }
        const result = await core.dispatch(request.method, request.params || {}, controller.signal);
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({jsonrpc: '2.0', id: request.id, result}));
      } catch (error) {if (!res.destroyed) {res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({jsonrpc: '2.0', id: request?.id, error: {code: -32000, message: error.message}}));}}
      return;
    }
    if (req.method !== 'GET') {res.writeHead(405); res.end(); return;}
    const target = path.resolve(assets, name || 'index.html');
    if (!target.startsWith(assets + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {res.writeHead(404); res.end(); return;}
    res.setHeader('content-type', contentTypes[path.extname(target)] || 'application/octet-stream'); fs.createReadStream(target).pipe(res);
  });
  require('./terminal-stream.cjs').attach(server, prefix, core.dispatch);
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(port, '127.0.0.1', resolve);});
  // Role Board starts independently; Agent Board and host tools never wait
  // for the hosted Aexus runtime or inherit its startup failure.
  const supervisor=require('./agentboard-supervisor.cjs').shared();
  void supervisor.start({parentOrigin:'http://127.0.0.1:'+server.address().port}).catch(error=>{
    console.error('[CloudHosts Role Board]',error.code||'START_FAILED',error.message);
  });
  // Legacy sessions have their own provenance and store. The original
  // Aexus Core exclusively executes all imported Company/Messages/Plan work.
  require('./collaboration-execution.cjs').start();
  require('./company-execution.cjs').start();
  require('./channels.cjs').prune();
  require('./plan-scheduler.cjs').start();
  const state = {pid: process.pid, port: server.address().port, url: `http://127.0.0.1:${server.address().port}${prefix}`,version:build.version,buildId:build.buildId};
  fs.writeFileSync(file, JSON.stringify(state), {mode: 0o600});
  let stopping = false;
  const stop = async () => {if (stopping) return; stopping = true; try{await require('./agentboard-supervisor.cjs').shared().stop();}finally{await core.shutdown();} if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file)).pid === process.pid) fs.rmSync(file, {force: true}); server.close(); process.exit(0);};
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  console.log(JSON.stringify({ready: true, ...state}));
  return state;
}
module.exports = {serve};
