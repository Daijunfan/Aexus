// Minimal regression for the Single Host Roles pane: role person cards from
// the hosted Role Board roster only, never native Coding Agent sessions.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const ROOT=path.resolve(__dirname,'..');
let roleHostPane;
before(async()=>{roleHostPane=(await import(pathToFileURL(path.join(ROOT,'ui/role-host.js')).href)).roleHostPane});
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
after(()=>{delete globalThis.document});
// The tiny DOM surface roleHostPane actually uses.
class FakeNode{
 constructor(){this._innerHTML='';this._textContent='';this.onclick=null;this.disabled=false;}
 set innerHTML(value){this._innerHTML=String(value)}
 get innerHTML(){return this._innerHTML}
 set textContent(value){this._textContent=String(value)}
 get textContent(){return this._textContent}
 replaceChildren(){this._innerHTML='';this._textContent=''}
 closest(){return null}
}
function root(){
 const status=new FakeNode(),list=new FakeNode(),refresh=new FakeNode(),manage=new FakeNode();
 const node={querySelector:selector=>({'.role-host-status':status,'.role-host-list':list,'[data-role-refresh]':refresh,'[data-role-manage]':manage}[selector])};
 return {node,status,list,refresh,manage};
}
function employee(overrides={}){
 return {source:'aexus',stableId:'role-1',id:'role-1',hostId:'host-a',hostMissing:false,directory:'/srv/app',
  name:'QA Reviewer',team:'QA',engine:'codex',managementRole:'governor',kind:'worker',
  initialization:{status:'ready'},running:true,busy:false,sessionId:'sess-1',...overrides};
}
test('Roles pane renders the host-bound role person card, not Agent sessions',async t=>{
 globalThis.document={hidden:false};
 const {node,status,list}=root();const opened=[];
 const pane=roleHostPane(node,{id:'host-a',name:'GPU Server'},async method=>{
  assert.equal(method,'roleboard.roster');
  return {source:'aexus',employees:[employee()]};
 },id=>opened.push(id));
 t.after(()=>pane.dispose());
 await tick();
 assert.equal(status.textContent,'');
 assert.ok(list.innerHTML.includes('data-role-id="role-1"'),'card is keyed by role id');
 assert.ok(list.innerHTML.includes('data-open-role="role-1"'),'card opens the original role');
 assert.ok(list.innerHTML.includes('QA Reviewer'),'card shows the role title');
 assert.ok(list.innerHTML.includes('Governor'),'card shows the management role');
 assert.ok(list.innerHTML.includes('Codex'),'card shows the engine name');
 assert.ok(list.innerHTML.includes('Online'),'card shows the running status');
 assert.ok(list.innerHTML.includes('/srv/app'),'card shows the working directory');
 assert.ok(list.innerHTML.includes('GPU Server'),'card shows the source host');
 assert.ok(!list.innerHTML.includes('data-session'),'no Agent Board session card is mixed in');
});
test('Roles pane shows the empty state only when no role is bound to the host',async t=>{
 globalThis.document={hidden:false};
 const {node,status,list}=root();
 const pane=roleHostPane(node,{id:'host-b',name:'Other Server'},async()=>({source:'aexus',employees:[employee()]}),()=>{});
 t.after(()=>pane.dispose());
 await tick();
 assert.equal(status.textContent,'No roles on this host.');
 assert.equal(list.innerHTML,'');
});
test('Cards and the manage button delegate to the original Role Board path',async t=>{
 globalThis.document={hidden:false};
 const {node,list,manage}=root();const opened=[];
 const pane=roleHostPane(node,{id:'host-a',name:'GPU Server'},async()=>({source:'aexus',employees:[employee({initialization:{status:'failed'},running:false,busy:false})]}),id=>opened.push(id));
 t.after(()=>pane.dispose());
 await tick();
 assert.ok(list.innerHTML.includes('Needs attention'),'failed initialization surfaces as attention');
 const button={dataset:{openRole:'role-1'},closest:selector=>selector==='[data-open-role]'?button:null};
 list.onclick({target:button});
 assert.deepEqual(opened,['role-1']);
 manage.onclick();
 assert.deepEqual(opened,['role-1',undefined]);
});
