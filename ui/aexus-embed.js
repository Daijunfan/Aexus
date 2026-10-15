// One hosted Aexus Web client for Company, Messages and Plan. Never create a
// second iframe or clientId on tab changes.
const VERSION=1;
const VIEWS=new Set(['company','messages','plan']);
const NATIVE=new Set(['file.pick','folder.pick','file.reveal','external.open','clipboard.read','clipboard.write','window.focus','download.open']);
const TIMEOUT=12000;
const id=()=>crypto.randomUUID();
const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(value);
const getClient=()=>{
  const key='cloudhosts-aexus-client';
  try{const saved=sessionStorage.getItem(key);if(validId(saved))return saved;
    const result=id();sessionStorage.setItem(key,result);return result}catch{return id()}
};
export function aexusEmbed({root,rpc,message,onNavigation}){
 let disposed=false,frame=null,origin='',instanceId='',nonce='',ready=false,active=false;
 let status='stopped',lastView='company',queuedNavigation={view:'company'},generation=0,refreshTimer=null,helloTimer=null,ticketId=null,requestedAt=0,navigationId=null;
 const pending=new Map(),clientId=getClient(),windowId=id();
 const trace=[];const record=(event,details={})=>{trace.push({at:Date.now(),event,...details});if(trace.length>40)trace.shift()};
 // Safe, read-only UI diagnostics. Never expose ticket, nonce, private bridge secret,
 // client bearer credentials or native operations to CloudHosts renderer globals.
 const diagnostics=Object.freeze({
   get clientId(){return clientId},
   get instanceId(){return ready?instanceId:null},
   get ready(){return ready},
   get trace(){return trace.slice()}
 });
 if(!window.cloudHosts)window.cloudHosts={};
 window.cloudHosts.roleBoard=diagnostics;
 root.classList.add('aexus-embed-container');
 root.innerHTML='<div class="aexus-embed-status" role="status"><span>Connecting to hosted Aexus…</span><button type="button" hidden>Reconnect</button></div>';
 const statusNode=root.querySelector('.aexus-embed-status');
 const statusText=statusNode.querySelector('span'),retryButton=statusNode.querySelector('button');
 const error=(text)=>{if(!disposed){statusNode.hidden=false;statusText.textContent=text;retryButton.hidden=false}};
 retryButton.onclick=async()=>{
   retryButton.disabled=true;
   try{
     const value=await rpc('roleboard.start');
     if(!disposed&&value.status==='ready')createFrame(value);
   }catch(e){error('Aexus reconnect failed: '+e.message)}
   finally{retryButton.disabled=false}
 };
 const envelope=(type,payload={},requestId=id())=>({protocolVersion:VERSION,instanceId,windowId,clientId,requestId,type,payload,nonce});
 function send(type,payload={},requestId){
   if(!frame?.contentWindow||!origin)return;
   frame.contentWindow.postMessage(envelope(type,payload,requestId),origin);
 }
 function stopPending(reason){
   for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error(reason))}
   pending.clear();
 }
 function navigateFrame(){
   navigationId=id();
   send('navigation.change',queuedNavigation,navigationId);
 }
 function ask(type,payload={}){
   if(!ready)return Promise.reject(Error('Hosted Aexus has not completed handshake'));
   const requestId=id();
   return new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>{pending.delete(requestId);reject(Error(type+' timed out'))},TIMEOUT);
     pending.set(requestId,{type,resolve,reject,timer});
     send(type,payload,requestId);
   });
 }
 // One authorization at a time. A lost or refused session asks the owning host
 // for a fresh single-use ticket; the child is never asked to re-run its own
 // failed work.
 async function requestTicket(){
   if(disposed||ticketId||Date.now()-requestedAt<1000)return;
   requestedAt=Date.now();
   try{
     const data=await rpc('roleboard.ticket',{instanceId,windowId,clientId,parentOrigin:location.origin});
     if(disposed)return;
     ticketId=id();
     send('host.ticket',{ticket:data.ticket,expiresAt:data.expiresAt},ticketId);
   }catch(e){
     ticketId=null;
     record('ticket-failed',{error:String(e.message||e).slice(0,180)});
     error('Aexus authorization failed: '+e.message);
   }
 }
 async function nativeOperation(capability,args,requestId){
   if(!NATIVE.has(capability))throw Error('Unsupported native capability');
   if(capability==='window.focus'){window.focus();return {focused:document.hasFocus()}}
   if(capability==='clipboard.write'){
     if(typeof args?.text!=='string'||args.text.length>256*1024)throw Error('Invalid clipboard text');
     try{await navigator.clipboard.writeText(args.text);return {ok:true}}
     catch{/* Browser activation can be lost across postMessage. Use the owned Mac. */}
   }
   if(capability==='clipboard.read'){
     try{return {text:await navigator.clipboard.readText()}}
     catch{/* Use the authenticated native service, never iframe clipboard JS. */}
   }
   if(capability==='download.open'){
     const value=new URL(String(args?.url||''),origin);
     if(value.origin!==origin||!value.pathname.startsWith('/api/download'))throw Error('Invalid hosted download');
     // The Aexus server authorizes the scoped download through its own cookie.
     const link=document.createElement('a');link.href=value.href;link.rel='noopener noreferrer';
     link.download='';root.append(link);link.click();link.remove();return {ok:true};
   }
   return rpc('roleboard.native',{instanceId,windowId,clientId,requestId,capability,payload:args||{}});
 }
 function valid(event){
   if(disposed||!frame||event.source!==frame.contentWindow||event.origin!==origin)return false;
   const e=event.data;
   return !!e&&typeof e==='object'&&!Array.isArray(e)&&e.protocolVersion===VERSION&&
     e.instanceId===instanceId&&e.windowId===windowId&&e.clientId===clientId&&
     e.nonce===nonce&&validId(e.requestId)&&typeof e.type==='string'&&e.payload&&
     typeof e.payload==='object'&&!Array.isArray(e.payload);
 }
 async function receive(event){
   if(!valid(event)){
     // Never respond to another frame or origin. A same-frame malformed
     // envelope receives an explicit denial without any secret material.
     if(!disposed&&frame&&event.source===frame.contentWindow&&event.origin===origin&&
        validId(event.data?.requestId))send('protocol.error',{code:'ENVELOPE_DENIED'},event.data.requestId);
     return;
   }
   const {type,payload,requestId}=event.data;
   if(type==='navigation.change'||type==='aexus.ready'||type==='host.ticket'||type==='protocol.error'||type==='auth.required')record('received',{type,view:payload.view,revision:payload.revision,accepted:payload.accepted,code:payload.code,errorMessage:String(payload.message||'').slice(0,180),lastView,ready});
   if(type==='aexus.ready'){
     if(ready||ticketId||payload.nonce!==nonce||payload.origin!==origin)return;
     statusNode.hidden=false;statusText.textContent='Authorizing the original Aexus client…';
     await requestTicket();
     return;
   }
   // The hosted Core session expired, was revoked, or was replaced. Only the
   // host can authorize another one; the running view is kept as it is.
   if(type==='auth.required'){
     if(!ready||ticketId)return;
     statusNode.hidden=false;statusText.textContent='Reauthorizing the original Aexus client…';
     await requestTicket();
     return;
   }
   if(type==='host.ticket'&&ticketId===requestId){
     ticketId=null;
     if(payload.accepted!==true){ready=false;error('Aexus rejected the host authorization');return}
     const initial=!ready;
     ready=true;statusNode.hidden=true;clearTimeout(helloTimer);
     if(initial){
       navigateFrame();
       send('view.visibility',{visible:active&&!document.hidden,focused:document.hasFocus()});
     }
     return;
   }
   if(type==='protocol.error'&&ticketId===requestId){
     ticketId=null;ready=false;error('Aexus rejected its host session: '+String(payload.message||payload.code||'unknown'));
     return;
   }
   if(!ready)return;
   if(type==='protocol.error'){
     if(requestId===navigationId)navigationId=null;
     if(payload.code==='NAVIGATION_FAILED')message?.(String(payload.message||'Unable to open this role'),'error');
     return; // Prevent error ACK loops.
   }
   if(type==='view.visibility')return;
   if(type==='native.request'){
     try{
       const capability=payload.capability;
       const result=await nativeOperation(capability,payload.args,requestId);
       send('native.response',{ok:true,result},requestId);
     }catch(e){send('native.response',{ok:false,error:e.message,code:e.code||'NATIVE_FAILED'},requestId)}
     return;
   }
   if(type==='navigation.change'){
     if(!VIEWS.has(payload.view)){send('protocol.error',{code:'VIEW_DENIED'},requestId);return}
     // Older host requests and intermediate child states cannot replace the
     // selection still awaiting its own acknowledgement.
     if(payload.accepted===true){
       if(requestId!==navigationId)return;
       navigationId=null;
     }else if(navigationId)return;
     if(lastView!==payload.view){lastView=payload.view;queuedNavigation={view:lastView};onNavigation?.(payload.view)}
     return;
   }
   if(type==='runtime.state'){
     if(!['starting','ready','failed','stopped'].includes(payload.status))return;
     status=payload.status;
     if(status==='failed')error('Aexus connection failed: '+String(payload.error||'unknown error'));
     return;
   }
   const task=pending.get(requestId);
   if(task&&((type==='state.flush'&&type===task.type)||type==='native.response'||type==='protocol.response')){
     clearTimeout(task.timer);pending.delete(requestId);
     (payload.ok===false||type==='state.flush'&&payload.saved!==true)?task.reject(Error(payload.error||type+' failed')):task.resolve(payload.result??payload);
     return;
   }
   if(type!=='protocol.error')send('protocol.error',{code:'TYPE_DENIED'},requestId);
 }
 // Every tab shares this source + origin + instance binding. A hostile sibling
 // frame cannot drive privileged host actions.
 window.addEventListener('message',receive);
 const visibility=()=>send('view.visibility',{visible:active&&!document.hidden,focused:document.hasFocus()});
 document.addEventListener('visibilitychange',visibility);
 window.addEventListener('focus',visibility);
 window.addEventListener('blur',visibility);
 function createFrame(state){
   generation++;ready=false;ticketId=null;requestedAt=0;navigationId=null;status='starting';stopPending('Hosted Aexus reconnected');
   if(frame){frame.remove();frame=null}
   instanceId=state.instanceId;origin=new URL(state.url).origin;nonce=id();
   frame=document.createElement('iframe');
   frame.className='aexus-embed-frame';frame.title='Aexus Company, Messages and Plan';
   frame.setAttribute('sandbox','allow-same-origin allow-scripts allow-forms allow-downloads allow-popups');
   frame.setAttribute('referrerpolicy','no-referrer');
   frame.src=origin+'/?aexus-host=cloudhosts&client='+encodeURIComponent(clientId);
   const version=generation;
   frame.onload=()=>{
     if(disposed||version!==generation)return;
     nonce=id();ready=false;
     send('host.hello',{version:VERSION,parentOrigin:location.origin,childOrigin:origin,
       nonce,expectedOrigin:origin,capabilities:[...NATIVE]});
     clearTimeout(helloTimer);
     helloTimer=setTimeout(()=>{if(!ready&&version===generation)error('Aexus frame handshake timed out')},TIMEOUT);
   };
   root.append(frame);statusNode.hidden=false;retryButton.hidden=true;statusText.textContent='Authenticating hosted Aexus…';
 }
 async function check(){
   if(disposed)return;
   try{
     const value=await rpc('roleboard.runtime');
     if(disposed)return;
     if(value.status!=='ready'||!value.url){
       status=value.status;error(value.error?'Aexus unavailable: '+value.error:'Aexus is '+value.status);
       return;
     }
     const url=new URL(value.url);
     if(url.protocol!=='http:'||url.hostname!=='127.0.0.1')throw Error('Aexus reported an unsafe endpoint');
     if(value.instanceId!==instanceId||url.origin!==origin||!frame)createFrame(value);
   }catch(e){error('Unable to read Aexus runtime: '+e.message)}
 }
 void check();
 refreshTimer=setInterval(()=>void check(),5000);
 return {
   get clientId(){return clientId},
   get windowId(){return windowId},
   get iframe(){return frame},
   async navigate(view,options={}){
     if(!VIEWS.has(view))throw Error('Invalid Aexus navigation view');
     record('navigate',{view,ready,previous:lastView});
     lastView=view;queuedNavigation={view,...options};
     if(!frame)await check();
     if(ready)navigateFrame();
   },
   setVisible(visible){
     active=!!visible;root.hidden=!active;
     if(frame)visibility();
   },
   async flush(){
     if(!frame||!ready)return {ok:true,skipped:'not-attached'};
     return ask('state.flush',{}); // Must be acknowledged by the real Web client.
   },
   dispose(){
     disposed=true;clearInterval(refreshTimer);clearTimeout(helloTimer);
     if(window.cloudHosts?.roleBoard===diagnostics)delete window.cloudHosts.roleBoard;
     document.removeEventListener('visibilitychange',visibility);
     window.removeEventListener('focus',visibility);
     window.removeEventListener('blur',visibility);
     window.removeEventListener('message',receive);stopPending('Aexus frame disposed');
     frame?.remove();frame=null;root.classList.remove('aexus-embed-container');
   }
 };
}
