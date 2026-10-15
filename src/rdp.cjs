const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),http=require('node:http');
const {spawn}=require('node:child_process'),{randomUUID}=require('node:crypto'),{StringDecoder}=require('node:string_decoder');
const {WebSocketServer,WebSocket}=require('ws');
const registry=require('./registry.cjs'),ssh=require('./ssh.cjs'),desktops=require('./desktops.cjs');
const {instruction,Parser}=require('./guac-protocol.cjs');
const sessions=new Map();let engine,starting;
const publicSession=s=>({id:s.id,hostId:s.hostId,transport:s.transport,state:s.state,wsUrl:s.wsUrl,width:s.width,height:s.height,error:s.error});
async function startEngine(){
 if(engine&&!engine.child.killed)return engine.port;
 if(starting)return starting;
 starting=(async()=>{
  const root=path.join(__dirname,'../Runtime/rdp'),binary=process.env.CLOUD_HOSTS_GUACD||path.join(root,'sbin/guacd');
  if(!fs.existsSync(binary))throw Error('内嵌 RDP 引擎尚未安装');
  const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const child=spawn(binary,['-f','-b','127.0.0.1','-l',String(port),'-L','warning'],{env:{...process.env,OBJC_DISABLE_INITIALIZE_FORK_SAFETY:'YES',DYLD_LIBRARY_PATH:path.join(root,'lib'),LTDL_LIBRARY_PATH:path.join(root,'lib'),FREERDP_ADDIN_PATH:path.join(root,'lib/freerdp3')},stdio:['ignore','pipe','pipe']});
  let failure='';child.stderr.on('data',d=>{failure=(failure+d.toString()).slice(-2000)});child.on('error',e=>{failure=e.message});
  const current={child,port,lastError:''};for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{current.lastError=(current.lastError+d.toString()).slice(-4000)});engine=current;child.on('exit',()=>{if(engine===current)engine=null});
  for(let i=0;i<300;i++){
   if(child.exitCode!==null||child.signalCode)throw Error('RDP 引擎启动失败：'+failure);
   const ready=await new Promise(r=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false))});
   if(ready)return port;await new Promise(r=>setTimeout(r,50));
  }
  child.kill();throw Error('RDP 引擎未能启动');
 })();try{return await starting}finally{starting=null}
}
async function certificate(hostId){
 const script="$s=Get-CimInstance -Namespace root/cimv2/TerminalServices -ClassName Win32_TSGeneralSetting -Filter \"TerminalName='RDP-tcp'\"; $c=Get-ChildItem 'Cert:\\LocalMachine\\Remote Desktop'|Where-Object {$_.Thumbprint -eq $s.SSLCertificateSHA1Hash}|Select-Object -First 1; if(!$c){throw 'Active RDP certificate not found'}; [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($c.RawData)).Replace('-','').ToLower()";
 const r=await ssh.execute(hostId,script,undefined,20);if(r.exit_code)throw Error('无法通过 SSH 核对远程桌面证书：'+r.stderr.trim());
 const fingerprint=r.stdout.trim();if(!/^[a-f0-9]{64}$/.test(fingerprint))throw Error('无法读取有效的远程桌面证书');return fingerprint;
}
function get(hostId,id){const s=sessions.get(id);if(!s||s.hostId!==registry.get(hostId).id)throw Error('RDP 会话不属于此主机');return s;}
async function open(hostId,options={}){
 if(!options.password){const saved=await require('./rdp-credentials.cjs').get(hostId);if(saved.found)options={...options,username:saved.username,password:saved.password};}
 if(!options.username||!options.password)throw Error('请输入 Windows 登录账号与密码');

 let host=registry.get(hostId);
 if(!host.desktop&&host.os==='windows'){
  const info=host.info?.remoteDesktop?host.info:await require('./host-info.cjs').inspect(host.id);
  if(!info.remoteDesktop?.supported)throw Error('此 Windows 版本不支持 RDP 被连接端，可使用 VNC');
  if(!info.remoteDesktop.enabled)throw Error('此主机尚未启用远程桌面');
  host=registry.update(host.id,{desktop:{protocol:'rdp',address:'127.0.0.1',port:3389,viaHostId:host.id,username:options.username}});
 }
 if(host.desktop?.protocol!=='rdp')throw Error('请先配置此主机的 RDP 连接');
 const width=Number(options.width||1280),height=Number(options.height||800);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<320||width>7680||height<240||height>4320)throw Error('Invalid RDP size');
 const [port,transport,fingerprint]=await Promise.all([startEngine(),desktops.connectHostDesktop(host.id),certificate(host.id)]);
 const id=randomUUID(),ticket=randomUUID(),server=http.createServer((req,res)=>{res.writeHead(404);res.end()});
 const origin=new URL(JSON.parse(fs.readFileSync(path.join(registry.home,'server.json'))).url).origin;
 const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:8*1024*1024});
 const session={id,hostId:host.id,transport:transport.id,state:'ready',width,height,server,wss,sockets:new Set()};sessions.set(id,session);
 let credentials={username:String(options.username),password:String(options.password)},used=false;
 server.on('upgrade',(req,socket,head)=>{
  if(new URL(req.url,'http://127.0.0.1').pathname!=='/'+ticket||used||(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!=='null')){socket.destroy();return}
  used=true;wss.handleUpgrade(req,socket,head,ws=>{
   const tcp=net.connect(port,'127.0.0.1'),decoder=new StringDecoder('utf8');session.sockets.add(tcp);tcp.setNoDelay(true);
   let ready=false,ending=false,remembered=options.remember?{username:options.username,password:options.password}:null;
   const fields={hostname:transport.address,port:transport.port,username:credentials.username,password:credentials.password,security:'nla','cert-fingerprints':'sha256:'+fingerprint,width,height,dpi:96,'color-depth':32,'resize-method':'display-update','enable-wallpaper':'true','enable-theming':'true','enable-font-smoothing':'true','disable-audio':'true','disable-copy':'false','disable-paste':'false'};
   const slash=fields.username.indexOf('\\');if(slash>=0){fields.domain=fields.username.slice(0,slash);fields.username=fields.username.slice(slash+1)}
   credentials=null;
   const send=(...values)=>tcp.write(instruction(...values));
   let outbound=[];
   const parser=new Parser((values,wire)=>{
    const [opcode,...args]=values;
    if(opcode==='args'&&!ready){const packets=[['size',width,height,96],['audio'],['video'],['image','image/png','image/jpeg','image/webp'],['connect',...args.map(a=>a.startsWith('VERSION_')?a:fields[a]??'')]];tcp.write(packets.map(v=>instruction(...v)).join(''));fields.password='';return}
    if(opcode==='ready'){ready=true;session.state='connected';ws.send(instruction('',id));return}
    if(opcode==='sync'&&remembered){const saved=remembered;remembered=null;void require('./rdp-credentials.cjs').set(host.id,saved.username,saved.password).catch(()=>{})}
    if(opcode==='error'){remembered=null;session.error=args[0];session.state='failed'}
    if(ws.readyState===WebSocket.OPEN)outbound.push(wire);
   });
   tcp.once('connect',()=>send('select','rdp'));tcp.on('data',data=>{try{parser.write(decoder.write(data));if(outbound.length&&ws.readyState===WebSocket.OPEN)ws.send(outbound.join(''));outbound=[]}catch(e){session.error=e.message;session.state='failed';tcp.destroy()}});
   ws.on('message',data=>{if(ready)tcp.write(data)});
   const end=()=>{if(ending)return;ending=true;if(!ready&&session.state!=='failed'&&session.state!=='closing'){session.error='RDP 连接在握手时关闭';session.state='failed';if(ws.readyState===WebSocket.OPEN)ws.send(instruction('error',session.error,512))}session.sockets.delete(tcp);tcp.destroy();if(session.state!=='failed'&&session.state!=='closing')session.state='disconnected';if(ws.readyState===WebSocket.OPEN)ws.close(1000)};
   tcp.on('error',e=>{session.error=e.message;session.state='failed';end()});tcp.on('close',end);ws.on('close',()=>{end();void close(host.id,id)});ws.on('error',end);
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});session.wsUrl='ws://127.0.0.1:'+server.address().port+'/'+ticket;
 return publicSession(session);
}
async function close(hostId,id){if(!sessions.has(id))return {closed:true};const s=get(hostId,id);if(s.state==='closing')return {closed:true};s.state='closing';for(const socket of s.sockets)socket.destroy();for(const ws of s.wss.clients)ws.terminate();s.wss.close();await new Promise(r=>s.server.close(r));sessions.delete(id);return {closed:true};}
const list=hostId=>[...sessions.values()].filter(s=>!hostId||s.hostId===registry.get(hostId).id).map(publicSession);
async function shutdown(){for(const s of [...sessions.values()])await close(s.hostId,s.id);engine?.child.kill();}
module.exports={open,close,list,shutdown,certificate,startEngine};
