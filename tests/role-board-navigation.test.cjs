// Execute the real outer pane/embed and TypeScript child bridge in separate window
// contexts. Only DOM, authentication transport and the deferred Core API are fixtures.
// Set AEXUS_NAVIGATION_CHILD_SOURCE to a saved old host.ts for the negative control.
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),{webcrypto}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='http://127.0.0.1:59958',ENDPOINT=ORIGIN+'/',INSTANCE='instance-cloudhosts-1';
const vm=require('node:vm'),ts=require('../AgentBoard/Aexus/node_modules/typescript');
const childPath=process.env.AEXUS_NAVIGATION_CHILD_SOURCE||path.join(ROOT,'AgentBoard/Aexus/src/renderer/src/web/host.ts');
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const childCode=compile(fs.readFileSync(childPath,'utf8'));
const sharedCode=compile(fs.readFileSync(path.join(ROOT,'AgentBoard/Aexus/src/shared/types.ts'),'utf8'));
const tempDirs=[];
after(()=>{for(const dir of tempDirs)fs.rmSync(dir,{recursive:true,force:true})});
// Keep the real host sources adjacent so their relative import resolves.
function loadHost(label){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aexus-navigation-'+label+'-'));
 tempDirs.push(dir);
 const source=fs.readFileSync(path.join(ROOT,'ui/aexus-embed.js'),'utf8');
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
 fs.writeFileSync(path.join(dir,'aexus-embed.js'),source);
 fs.copyFileSync(path.join(ROOT,'ui/role-board.js'),path.join(dir,'role-board.js'));
 return import(pathToFileURL(path.join(dir,'role-board.js')).href);
}
const newClassList=()=>{const names=new Set();return{
 add(...values){for(const value of values)names.add(value)},
 remove(...values){for(const value of values)names.delete(value)},
 toggle(value,on){if(on===undefined)names.has(value)?names.delete(value):names.add(value);else if(on)names.add(value);else names.delete(value);return names.has(value)},
 contains:value=>names.has(value)}};
// The DOM surface the two host modules actually use.
class FakeNode{
 constructor(tag='div'){
   this.tagName=String(tag).toUpperCase();this.children=[];this.parentNode=null;this.hidden=false;
   this.textContent='';this.attributes={};this.dataset={};this.classList=newClassList();this.onclick=null;
   this._innerHTML='';this._bySelector=new Map();this._byRoleView=[];
 }
 get innerHTML(){return this._innerHTML}
 set innerHTML(markup){
   this._innerHTML=markup;
   const views=[...markup.matchAll(/data-role-view="([a-z]+)"/g)].map(match=>match[1]);
   if(views.length)this._byRoleView=views.map(view=>{const button=new FakeNode('button');button.dataset.roleView=view;return button});
 }
 setAttribute(name,value){this.attributes[name]=String(value)}
 getAttribute(name){return this.attributes[name]}
 append(child){this.children.push(child);child.parentNode=this;child.onAppended?.()}
 remove(){
   if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);
   this.parentNode=null;this.child?.stop();
 }
 closest(selector){return selector==='[data-role-view]'&&this.dataset.roleView?this:null}
 querySelector(selector){
   if(selector==='[data-role-view]')return this._byRoleView[0]??null;
   if(!this._bySelector.has(selector))this._bySelector.set(selector,new FakeNode(selector.replace(/[^a-z]/g,'')||'div'));
   return this._bySelector.get(selector);
 }
 querySelectorAll(selector){return selector==='[data-role-view]'?this._byRoleView.slice():[]}
 addEventListener(){}removeEventListener(){}
}
// Each iframe executes the actual host.ts exports with its own module state.
class HostedFrame{
 constructor(environment){
   this.environment=environment;this.disposed=false;this.presented='company';this.revision=0;
   this.received=[];this.emitted=[];this.exchanges=0;this.authListeners=new Set();
   const listeners=new Map();
   this.window={parent:{postMessage:item=>{
     this.emitted.push(item);queueMicrotask(()=>environment.toHost(item,this));
   }},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
   removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
   postMessage:item=>{
     environment.log('frame-message',{type:item.type,view:item.payload?.view});
     if(item.type==='navigation.change')this.received.push(item.payload.view);
     queueMicrotask(()=>{if(!this.disposed)for(const fn of listeners.get('message')||[])fn({data:item,origin:'app://cloudhosts',source:this.window.parent})});
   }};
   const module={exports:{}};
   const shared={exports:{}};
   vm.runInNewContext(sharedCode,{module:shared,exports:shared.exports});
   const transport={initializeWeb:async()=>{},webAuthenticated:()=>true,confirmHostedSession(){},
     onWebState:fn=>{this.authListeners.add(fn);return()=>this.authListeners.delete(fn)}};
   vm.runInNewContext(childCode,{module,exports:module.exports,window:this.window,
     document:{documentElement:{dataset:{}},visibilityState:'visible',hasFocus:()=>true},
     location:{origin:ORIGIN,search:'?aexus-host=cloudhosts'},URLSearchParams,Error,crypto:webcrypto,setTimeout,clearTimeout,
     fetch:async()=>{this.exchanges++;return {ok:true,json:async()=>({ok:true})}},
     require:specifier=>{
       if(specifier==='react')return {useSyncExternalStore(){}};
       if(specifier==='../../../shared/types')return shared.exports;
       if(specifier==='./transport')return transport;
       throw Error('unexpected child dependency '+specifier);
     }},{filename:childPath});
   this.bridge=module.exports;
 }
 begin(clientId){
   this.stopBridge=this.bridge.startHostedBridge({call:(method,args)=>{
     assert.equal(method,'view.select');
     return this.environment.select(this,args.id);
   }},clientId);
 }
 stop(){this.disposed=true;this.stopBridge?.()}
 apply(view){
   this.presented=view;this.revision++;
   this.bridge.syncHostedNavigation({kind:view,revision:this.revision});
 }
 expire(){for(const fn of this.authListeners)fn({checking:false,authenticated:false})}
}
function createEnvironment(){
 const logs=[],frames=[],held=[],panes=[],windowListeners=new Map(),documentListeners=new Map(),session=new Map();
 let holding=false;
 const listeners=(map,type)=>{if(!map.has(type))map.set(type,[]);return map.get(type)};
 const log=(event,details={})=>{logs.push({at:Date.now(),event,...details})};
 const toHost=(item,frame)=>{for(const handler of listeners(windowListeners,'message'))handler({data:item,origin:ORIGIN,source:frame.window})};
 const environment={log,toHost,frames,
   get held(){return held},
   hold(){holding=true},
   // Release one held Core selection so the release order is exactly the recorded one.
   releaseOne(){
     const entry=held.shift();
     if(!entry)return false;
     if(entry.error)entry.reject(Error(entry.error));else {entry.frame.apply(entry.view);entry.resolve()}
     return true;
   },
   select(frame,view){return holding?new Promise((resolve,reject)=>held.push({frame,view,resolve,reject})):Promise.resolve().then(()=>frame.apply(view))},
   async rpc(method){
     if(method==='roleboard.runtime')return {status:'ready',url:ENDPOINT,instanceId:INSTANCE};
     if(method==='roleboard.ticket')return {ticket:'ticket-1',expiresAt:Date.now()+20000};
     throw Error('unexpected rpc '+method);
   },
   // Every Company/Messages/Plan command the host actually put on the wire.
   navigationSent(){return logs.filter(row=>row.event==='frame-message'&&row.type==='navigation.change').map(row=>row.view)},
   quiesce(){return new Promise(resolve=>{let turns=0;const step=()=>{if(turns++>=5)return resolve();setTimeout(step,0)};step()})},
   window:null,document:null,
 };
 const windowLike={cloudHosts:undefined,parent:null,location:{origin:'app://cloudhosts',href:'app://cloudhosts/index.html'},
   focus(){},
   addEventListener(type,handler){listeners(windowListeners,type).push(handler)},
   removeEventListener(type,handler){if(windowListeners.has(type))windowListeners.set(type,listeners(windowListeners,type).filter(entry=>entry!==handler))}};
 windowLike.parent=windowLike;
 const documentLike={hidden:false,hasFocus:()=>true,
   addEventListener(type,handler){listeners(documentListeners,type).push(handler)},
   removeEventListener(type,handler){if(documentListeners.has(type))documentListeners.set(type,listeners(documentListeners,type).filter(entry=>entry!==handler))},
   createElement(tag){
     const element=new FakeNode(tag);
     if(element.tagName==='IFRAME'){
       element.child=new HostedFrame(environment);
       // The frame's window must be the same object the host posts to and the
       // object the bridge reports as event.source, or the host's own
       // `event.source===frame.contentWindow` check drops every frame message.
       element.contentWindow=element.child.window;
       element.onAppended=()=>setTimeout(()=>{if(!element.parentNode)return;element.child.begin(new URL(element.src).searchParams.get('client'));element.onload?.()},0);
       frames.push(element);
     }
     return element;
   }};
 environment.window=windowLike;environment.document=documentLike;
 environment.install=()=>{global.window=windowLike;global.document=documentLike;global.location=windowLike.location;
   global.sessionStorage={getItem:key=>session.has(key)?session.get(key):null,setItem:(key,value)=>session.set(key,String(value)),removeItem:key=>session.delete(key)};
   if(!global.crypto)global.crypto=webcrypto};
 // Teardown must stop every timer the host owns, including when a check fails.
 environment.restore=()=>{
   for(const pane of panes.splice(0)){try{pane.dispose()}catch{}}
   delete global.window;delete global.document;delete global.location;delete global.sessionStorage;
 };
 environment.track=pane=>{panes.push(pane);return pane};
 return environment;
}
// The outer host: the real Role Board pane over the real embed source.
function createPane(environment,load,{tab='plan',options={}}={}){
 const root=new FakeNode('div'),workspace={roleBoard:{tab}},saved=[],toasts=[];
 const pane=load.roleBoardPane(root,environment.rpc,text=>toasts.push(text),workspace,patch=>{saved.push(patch);return Promise.resolve()},options);
 environment.track(pane);
 return {root,pane,workspace,saved,toasts,
   get frame(){return root.querySelector('.aexus-embed-content').children.find(node=>node.tagName==='IFRAME')??null},
   get child(){return this.frame?.child??null},
   click(view){
     const button=root.querySelectorAll('[data-role-view]').find(entry=>entry.dataset.roleView===view);
     assert.ok(button,'no '+view+' tab to click');
     root.querySelector('nav').onclick({target:button});
   },
   activeTabs(){return root.querySelectorAll('[data-role-view]').filter(button=>button.classList.contains('active')).map(button=>button.dataset.roleView)}};
}
async function setup(t,tab='plan'){
 const load=await loadHost('actual-child'),environment=createEnvironment();environment.install();
 t.after(()=>environment.restore());
 environment.hold();
 const pane=createPane(environment,load,{tab});
 await environment.quiesce();
 return {environment,pane};
}
async function settle(environment){
 await environment.quiesce();
 // A test failure must be finite even if navigation accidentally loops.
 for(let i=0;i<20&&environment.held.length;i++){environment.releaseOne();await environment.quiesce()}
 assert.equal(environment.held.length,0,'navigation did not settle');
}
test('actual child: restored Plan then one Company click selects Company without a resend',async t=>{
 const {environment,pane}=await setup(t);
 assert.deepEqual(environment.navigationSent(),['plan']);
 assert.deepEqual(environment.held.map(item=>item.view),['plan']);
 pane.click('company');await environment.quiesce();
 assert.deepEqual(environment.navigationSent(),['plan','company']);
 assert.deepEqual(environment.held.map(item=>item.view),['plan'],'Company waits for the outstanding Core operation');
 environment.releaseOne();await environment.quiesce();
 assert.deepEqual(pane.activeTabs(),['company'],'the old completion never changes the latest outer selection');
 await settle(environment);
 assert.equal(pane.child.presented,'company');
 assert.deepEqual(pane.activeTabs(),['company']);
 assert.equal(pane.workspace.roleBoard.tab,'company');
 assert.deepEqual(environment.navigationSent(),['plan','company'],'exactly one message for the one click');
 assert.equal(environment.frames.length,1);
});
test('actual child: rapid Company/Messages/Plan coalesces pending commands and keeps the latest selection',async t=>{
 const {environment,pane}=await setup(t);
 pane.click('company');pane.click('messages');pane.click('plan');await environment.quiesce();
 assert.equal(environment.held.length,1,'Core operations do not overlap');
 environment.releaseOne();await environment.quiesce();
 assert.deepEqual(environment.held.map(item=>item.view),['plan'],'only the latest queued selection runs');
 await settle(environment);
 assert.equal(pane.child.presented,'plan');assert.deepEqual(pane.activeTabs(),['plan']);
 assert.deepEqual(environment.navigationSent(),['plan','company','messages','plan']);
 assert.deepEqual(pane.child.emitted.filter(item=>item.type==='navigation.change'&&item.payload.accepted).map(item=>item.payload.view),['plan']);
});
test('actual child: in-app routes update the outer tab once a host selection settles',async t=>{
 const {environment,pane}=await setup(t);await settle(environment);
 pane.click('company');await settle(environment);
 const sent=environment.navigationSent();
 pane.child.apply('messages');await environment.quiesce();
 assert.deepEqual(pane.activeTabs(),['messages']);assert.equal(pane.workspace.roleBoard.tab,'messages');
 pane.child.apply('plan');await environment.quiesce();
 assert.deepEqual(pane.activeTabs(),['plan']);
 assert.deepEqual(environment.navigationSent(),sent,'in-app navigation causes no echo command');
});
test('actual child: reload retains the browser client and only the replacement document receives selections',async t=>{
 const {environment,pane}=await setup(t);await settle(environment);
 for(const tab of ['company','messages','plan']){pane.click(tab);await settle(environment);assert.equal(pane.child.presented,tab)}
 const client=global.window.cloudHosts.roleBoard.clientId,old=pane.child,oldReceived=old.received.length;
 pane.pane.dispose();
 assert.equal(global.window.cloudHosts.roleBoard,undefined,'disposed diagnostics are removed');
 const next=createPane(environment,await loadHost('reload'),{tab:'plan'});await environment.quiesce();
 next.click('company');await settle(environment);
 assert.equal(next.child.presented,'company');assert.deepEqual(next.activeTabs(),['company']);
 assert.equal(global.window.cloudHosts.roleBoard.clientId,client);
 assert.equal(old.received.length,oldReceived);assert.equal(environment.frames.filter(frame=>frame.parentNode).length,1);
});
test('actual child: rejected Core selection reports the error and does not block the next selection',async t=>{
 const {environment,pane}=await setup(t);
 environment.held[0].error='selection refused';await settle(environment);
 assert.deepEqual(pane.toasts,['selection refused']);
 pane.click('messages');await settle(environment);
 assert.equal(pane.child.presented,'messages');assert.deepEqual(pane.activeTabs(),['messages']);
});
test('actual child: auth.required requests one fresh ticket without replaying navigation',async t=>{
 const {environment,pane}=await setup(t);await settle(environment);
 const sent=environment.navigationSent();assert.equal(pane.child.exchanges,1);
 await new Promise(resolve=>setTimeout(resolve,1050));
 pane.child.expire();pane.child.expire();await environment.quiesce();
 assert.equal(pane.child.exchanges,2,'one reauthorization exchange for repeated expiry notifications');
 assert.equal(global.window.cloudHosts.roleBoard.ready,true);
 assert.deepEqual(environment.navigationSent(),sent,'reauthorization preserves the running view');
});
