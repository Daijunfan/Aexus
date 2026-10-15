// Adapted from Aexus src/main/codex-executor.ts (GPL-3.0-only).
// Private native execution transport. Neither a model tool nor a prompt wrapper.
const {WebSocketServer} = require('ws');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const {randomBytes} = require('node:crypto');
const ssh = require('./ssh.cjs');
const registry = require('./registry.cjs');
const hosts = require('./agent-hosts.cjs');

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 1800); timer.unref();
    child.once('close',() => {clearTimeout(timer); resolve();});
    child.stdin?.end(); child.kill('SIGTERM');
  });
}
function reverseForward(source, localPort) {
  const target = registry.target(source.id);
  const args = ssh.args(target), host = args.pop();
  const child = spawn(ssh.sshExecutable(), [...args,'-N','-v','-o','ExitOnForwardFailure=yes','-R',`127.0.0.1:0:127.0.0.1:${localPort}`,host], {env:ssh.env(target),stdio:['ignore','ignore','pipe'],windowsHide:true});
  return new Promise((resolve,reject) => {
    let error = '', settled = false;
    const fail = async reason => {if (settled) return; settled = true; clearTimeout(timer); await stop(child); reject(reason);};
    const timer = setTimeout(() => void fail(Error('引擎来源主机未建立私有回环通道；请检查 SSH 端口转发权限')), 20000);
    child.stderr.on('data', data => {
      error = (error + data).slice(-6000);
      const match = error.match(/Allocated port (\d+) for remote forward/);
      if (!match || settled) return;
      const port = Number(match[1]);
      if (port < 1 || port > 65535) return;
      settled = true; clearTimeout(timer); resolve({child,port});
    });
    child.once('error',reason => void fail(reason));
    child.once('close',() => void fail(Error('引擎来源 SSH 通道关闭：' + error.slice(-1200))));
  });
}
async function open(source, target, cwd) {
  const token = randomBytes(32).toString('hex'), children = new Set();
  let lastError = '', closing = false, forward;
  const server = new WebSocketServer({host:'127.0.0.1',port:0,maxPayload:16*1024*1024,
    verifyClient:({req}) => !closing && !req.headers.origin && req.url === '/' + token && children.size < 4});
  await new Promise((resolve,reject) => {server.once('listening',resolve);server.once('error',reject);});
  server.on('error',error => {lastError = error.message;});
  server.on('connection',socket => {
    let child;
    try {child = hosts.processOn(target,'codex',['exec-server','--listen','stdio'],{cwd});}
    catch (error) {lastError = error.message; socket.close(1011,'Execution environment unavailable'); return;}
    children.add(child);
    let paused = false;
    const lines = createInterface({input:child.stdout});
    child.stderr.on('data',data => {lastError = (lastError + data).slice(-4000);});
    child.once('error',error => {lastError = error.message;socket.close(1011,'Execution environment unavailable');});
    child.stdin.on('error',() => socket.close(1011,'Execution environment disconnected'));
    socket.on('message',data => {if (!child.stdin.destroyed && !child.stdin.writableEnded && !child.stdin.write(data.toString()+'\n')) socket._socket?.pause();});
    child.stdin.on('drain',() => socket._socket?.resume());
    lines.on('line',line => {
      if (socket.readyState !== 1) return;
      if (Buffer.byteLength(line) > 16*1024*1024) {lastError = '原生执行响应超过 16 MiB'; socket.close(1009,'Response too large'); return;}
      socket.send(line,error => {if (error) socket.terminate();});
      if (socket.bufferedAmount > 4*1024*1024) {child.stdout.pause();paused = true;}
    });
    const drain = setInterval(() => {if (paused && socket.bufferedAmount < 1024*1024) {paused = false;child.stdout.resume();}}, 25); drain.unref();
    socket.on('error',() => socket.terminate());
    socket.on('close',() => {clearInterval(drain); void stop(child);});
    child.once('close',() => {children.delete(child);clearInterval(drain);lines.close();socket.close();});
  });
  async function close() {
    if (closing) return;
    closing = true;
    const stopping = [...children].map(stop);
    for (const socket of server.clients) socket.terminate();
    await Promise.all([new Promise(resolve => server.close(resolve)),...stopping,stop(forward?.child)]);
  }
  try {
    let port = server.address().port;
    if (source.id !== 'local') {forward = await reverseForward(source,port);port = forward.port;}
    return {url:`ws://127.0.0.1:${port}/${token}`, error:() => lastError, close,
      onDisconnect(callback) {forward?.child.once('close',() => {if (!closing) callback(Error('引擎来源的私有路由通道已断开'));});}};
  } catch (error) {await close();throw error;}
}
module.exports = {open,stop,reverseForward};
