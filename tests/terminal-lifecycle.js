// Real terminal UI in hidden native WebKit, with deterministic broker responses.
window.runTerminalInputChecks=async function(){
 const checks=[],timers=[],nativeTimeout=window.setTimeout,root=document.querySelector('#root');
 Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});
 window.setTimeout=(callback,delay,...args)=>delay===0?(timers.push(()=>callback(...args)),-timers.length):nativeTimeout(callback,delay,...args);
 const tick=async()=>{for(let i=0;i<30;i++){await Promise.resolve();while(timers.length)timers.shift()();}};
 const sockets=[];
 class Socket{
  static OPEN=1;static CONNECTING=0;static CLOSED=3;readyState=1;
  constructor(url){this.id=new URL(url).searchParams.get('terminal');sockets.push(this);setTimeout(()=>this.onopen?.(),0)}
  send(){} close(){this.readyState=3;this.onclose?.()}
  reply(value){this.onmessage?.({data:JSON.stringify(value)})}
 }
 window.WebSocket=Socket;
 const host={id:'lifecycle',name:'Lifecycle',os:'linux',host:'fixture'};
 let rows=[{id:'expired',running:false},{id:'live',running:true}],opened=0,closed=[];
 const rpc=async(method,p)=>{
  if(method==='hosts.terminal-list')return rows.map(t=>({...t}));
  if(method==='hosts.terminal-close'){closed.push(p.terminal);rows=rows.filter(t=>t.id!==p.terminal);return true}
  if(method==='hosts.terminal-open'){const item={id:'replacement-'+(++opened),running:true};rows.push(item);return {...item}}
 };
 let dispose=cloudClients.terminal(root,host,rpc,()=>{},null,null);
 await tick();
 checks.push({name:'Expired preferred session is replaced once while live session is retained',exact:opened===1&&closed.join(',')==='expired'&&rows.some(t=>t.id==='live')});
 checks.push({name:'Compact labels and actions',exact:[...root.querySelectorAll('[data-terminal]')].every(b=>/^终端 \d+$/.test(b.textContent))&&root.querySelector('#terminal-new').textContent==='＋'});
 sockets.at(-1).reply({output:'',cursor:0,running:false,exitCode:255});await tick();
 checks.push({name:'Failed automatic replacement is removed without retry loop',exact:opened===1&&closed.includes('replacement-1')&&!root.querySelector('[data-terminal="replacement-1"]')&&root.querySelector('[data-terminal="live"]')!==null});
 const live=sockets.findLast(s=>s.id==='live');live.close();root.dispatchEvent(new Event('terminal-activate'));await tick();
 checks.push({name:'Returning to disconnected viewer reconnects same live session',exact:sockets.filter(s=>s.id==='live').length===2&&!closed.includes('live')&&opened===1});
 sockets.at(-1).reply({output:'',cursor:0,running:false,exitCode:255});await tick();
 checks.push({name:'Exited process discovered on reconnect is replaced once',exact:closed.includes('live')&&opened===2});
 dispose();await tick();
 rows=[{id:'another-live',running:true}];const count=opened;closed=[];
 dispose=cloudClients.terminal(root,{...host,id:'healthy'},rpc,()=>{},null,null);await tick();
 checks.push({name:'Healthy host entry does not create or remove sessions',exact:opened===count&&closed.length===0&&root.querySelector('[data-terminal="another-live"]')!==null});
 dispose();window.setTimeout=nativeTimeout;
 return {checks,passed:checks.every(c=>c.exact)};
}
