// Explicit live acceptance: own SSH sessions only; no user's session is reused.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {WebSocket}=require('ws'),{Terminal}=require('@xterm/headless'),{rpc,state}=require('../cli.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const owned=[];
async function open(host){
  const session=await rpc('hosts.terminal-open',{id:host.id,cols:120,rows:32});owned.push({id:host.id,terminal:session.id});
  const endpoint=new URL('terminal-stream',(await state()).url);endpoint.protocol='ws:';for(const [k,v] of Object.entries({host:host.id,terminal:session.id,flow:'1'}))endpoint.searchParams.set(k,v);
  const terminal=new Terminal({cols:120,rows:32,allowProposedApi:true,scrollback:1000}),ws=new WebSocket(endpoint);
  let output='',seq=0,error,bytes=0;const ack=new Map();
  const send=data=>new Promise((resolve,reject)=>{const id=++seq;ack.set(id,{resolve,reject});ws.send(JSON.stringify({op:'input',data,seq:id}));});
  terminal.onData(data=>{void send(data).catch(e=>error=e)});
  ws.on('message',raw=>{const r=JSON.parse(raw);if(r.error){error=Error(r.error);return}if(r.inputAck!==undefined){ack.get(r.inputAck)?.resolve();ack.delete(r.inputAck);return}if(r.output!==undefined){bytes+=Buffer.byteLength(r.output);output+=r.output;terminal.write(r.output,()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({op:'ack',seq:r.seq}));});}});
  ws.on('error',e=>error=e);
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
  const wait=async(text,from=0,timeout=20000)=>{const until=Date.now()+timeout;while(!output.slice(from).includes(text)){if(error)throw error;if(Date.now()>until)throw Error(host.name+': missing expected response '+text);await delay(10);}return output.slice(from)};
  await wait(host.os==='windows'?'PS ':host.name==='GPU-server'?'$ ':':~');
  return {host,session,send,wait,ws,terminal,get output(){return output},get bytes(){return bytes},get text(){const b=terminal.buffer.active;return Array.from({length:b.length},(_,i)=>b.getLine(i)?.translateToString(true)||'').join('\n')},async command(command,marker){const from=output.length;await send(command+'\r');return wait(marker,from)},close(){ws.terminate();terminal.dispose()}};
}
async function main(){
  const hosts=await rpc('hosts.list'),linux=hosts.find(h=>h.name==='GPU-server'),windows=hosts.find(h=>h.name==='Windows-target1');
  const clients=[],report={};
  try{
    const a=await open(linux);clients.push(a);
    await a.command("__cloudhosts_completion_probe(){ printf '\\nTAB_%s\\n' COMPLETE; }",'completion_probe');
    let from=a.output.length;await a.send('__cloudhosts_completion_pr');await a.send('\t');await a.send('\r');await a.wait('TAB_COMPLETE',from);report.linuxTab=true;
    const b=await open(windows);clients.push(b);
    await b.command("function __CloudHostsCompletionProbe { Write-Output ('TAB_'+'COMPLETE') }",'CompletionProbe');
    from=b.output.length;await b.send('__CloudHostsComple');await b.send('\t');await b.send('\r');await b.wait('TAB_COMPLETE',from);report.windowsTab=true;
    from=b.output.length;await b.send('discardme');await b.send('\u0003');await b.send("Write-Output ('CANCEL_'+'OK')\r");await b.wait('\r\nCANCEL_OK',from);report.windowsCancelLine=true;
    from=b.output.length;await b.send('\u001b[A\r');await b.wait('\r\nCANCEL_OK',from);report.windowsHistory=true;
    const payload=('abcXYZ0123456789_中文🙂').repeat(12000),size=Buffer.byteLength(payload),hash=crypto.createHash('sha256').update(payload).digest('hex');
    const script=`import os,sys,termios,tty,hashlib,threading,time\na=termios.tcgetattr(0);tty.setraw(0);stop=threading.Event()\ndef noise():\n while not stop.is_set():\n  os.write(1,b'LOAD '+b'x'*200+b'\\r\\n');time.sleep(.002)\nt=threading.Thread(target=noise);t.start();os.write(1,b'READY_PAYLOAD\\r\\n');data=b''\ntry:\n while len(data)<${size}: data+=os.read(0,min(65536,${size}-len(data)))\nfinally:\n stop.set();t.join();termios.tcsetattr(0,termios.TCSANOW,a)\nprint('RESULT_'+hashlib.sha256(data).hexdigest(),flush=True)`;
    const quoted="'"+script.replace(/'/g,"'\\''")+"'";from=a.output.length;await a.send('python3 -c '+quoted+'\r');await a.wait('READY_PAYLOAD\r\n',from);
    const started=performance.now();for(let i=0;i<payload.length;i+=4096){let end=Math.min(payload.length,i+4096);if(end<payload.length&&payload.charCodeAt(end-1)>=0xD800&&payload.charCodeAt(end-1)<=0xDBFF)end--;await a.send(payload.slice(i,end));i=end-4096;}
    await a.wait('RESULT_'+hash,from,30000);report.largePasteDuringOutput={bytes:size,sha256:hash,exact:true,milliseconds:Math.round(performance.now()-started)};
    const background=await Promise.all([open(linux),open(linux)]);clients.push(...background);
    for(const c of background)await c.send("python3 -c 'import time;[(print(\"LOAD \"+\"x\"*500,flush=True),time.sleep(.005)) for _ in range(800)]'\r");
    const latencies=[];for(let i=0;i<20;i++){const start=performance.now(),mark='FAST_'+i;from=a.output.length;for(const char of "printf '\\nFAST_%s\\n' "+i+'\r')await a.send(char);await a.wait('\r\n'+mark,from);latencies.push(Math.round(performance.now()-start));}
    report.multiTerminalInput={sessions:clients.length,commands:latencies.length,allReceived:true,medianMs:latencies.sort((x,y)=>x-y)[10],maximumMs:Math.max(...latencies)};
    for(const c of background)await c.send('\u0003');
    from=a.output.length;await a.send('sleep 20\r');await delay(100);await a.send('\u0003');await a.send("printf '\\nINTERRUPT_%s\\n' OK\r");await a.wait('\r\nINTERRUPT_OK',from);report.ctrlC=true;
    fs.writeFileSync(path.join(__dirname,'../artifacts/terminal-live-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{for(const c of clients)c.close();for(const s of owned)await rpc('hosts.terminal-close',s).catch(()=>{});}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
