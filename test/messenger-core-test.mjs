import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {fixtureCore} from './fixtures/headless-core.mjs'
const f=await fixtureCore(),ref=id=>'employee:'+id
const rpc=async(cmd,args={})=>{const r=await f.request(null,cmd,args);assert.ok(r.ok,r.error);return r.data}
try{
 await f.cli('group','add','Studio');const a=await f.create('Aster','Studio'),b=await f.create('Rowan','Studio'),g=await f.create('Governor','Studio','governor')
 fs.writeFileSync(path.join(f.control,a.id+'.reply.txt'),'A considered workspace. Read https://example.org/design for the full notes.')
 await f.cli('session','send','--employee',a.id,'--text','Find the original brief');await f.until(async()=>!(await f.status(a.id)).busy,'reply')
 const before=await f.cli('session','transcript',a.id),reply=before.items.find(item=>item.role==='assistant'),stateBefore=await f.cli('session','list'),receipt=(await f.status(a.id)).lastReply
 await f.cli('messenger','conversation','--conversations',JSON.stringify([ref(a.id),ref(b.id)]),'--patch','{"pinned":true,"favorite":true}')
 await f.cli('messenger','conversation','--conversations',JSON.stringify([ref(b.id)]),'--patch','{"archived":true,"unread":true}')
 let state=await f.cli('messenger','state');assert.equal(state.conversations[ref(a.id)].pinned,true);assert.equal(state.conversations[ref(b.id)].archived,true)
 const revision=state.revision;assert.equal((await f.request(null,'messenger.conversation',{conversations:[ref(a.id),'employee:missing'],patch:{archived:true}})).ok,false);assert.equal((await f.cli('messenger','state')).revision,revision,'bulk update preflights all targets before writing')
 await f.cli('messenger','message',ref(a.id),reply.id,'--patch','{"saved":true,"pinned":true,"reaction":"❤️"}')
 let found=await f.cli('messenger','search','--query','considered','--filter','saved');assert.equal(found.total,1);assert.equal(found.messages[0].id,reply.id);assert.equal(found.messages[0].preferences.reaction,'❤️')
 assert.equal((await f.cli('messenger','search','--filter','links')).total,1);assert.equal((await f.cli('messenger','search','--author','you')).total,1)
 await f.cli('messenger','draft',ref(a.id),'--data',JSON.stringify({text:'Persist this draft\n保留第二行',images:['.agents-attachments/test.png']}))
 const group=await f.cli('chat','create','--name','Design Review','--members',JSON.stringify([a.id,b.id]));const groupRef='group:'+group.id
 for(let i=0;i<105;i++)await rpc('chat.post',{kind:'message',id:group.id,text:`Review ${i}: ${i===0?'ORIGINAL_ANCHOR':'A useful update'}`,clientMessageId:'fixture-'+i})
 const old=await f.cli('messenger','search','--conversation',groupRef,'--query','ORIGINAL_ANCHOR');assert.equal(old.total,1,'search includes messages older than the first 100-row page')
 const page=await f.cli('messenger','search','--conversation',groupRef,'--limit','30');assert.equal(page.messages.length,30);assert.equal(page.total,105);assert.equal(page.hasMore,true)
 const next=await f.cli('messenger','search','--conversation',groupRef,'--offset','30','--limit','30');assert.ok(next.messages.every(item=>!page.messages.some(first=>first.id===item.id)))
 await f.cli('messenger','message',ref(a.id),reply.id,'--patch','{"hidden":true}');assert.equal((await f.cli('messenger','search','--filter','saved')).total,0)
 assert.deepEqual((await f.cli('session','transcript',a.id)).items,before.items,'personal actions never rewrite native conversation context')
 await f.cli('messenger','message',ref(a.id),reply.id,'--patch','{"hidden":false,"reaction":""}')
 for(const card of [a,g]){const token=await f.token(card.id);for(const cmd of ['messenger.state','messenger.search','messenger.conversation','messenger.message','messenger.draft'])assert.equal((await f.request(token,cmd,{})).ok,false,cmd+' is personal operator state, including against Governors')}
 assert.equal((await f.request(null,'messenger.message',{conversation:ref(a.id),id:'does-not-exist',patch:{saved:true}})).ok,false)
 assert.equal((await f.request(null,'messenger.conversation',{conversations:[ref(a.id)],patch:{engine:'codex'}})).ok,false)
 assert.deepEqual((await f.status(a.id)).lastReply,receipt,'searches and personal unread flags do not acknowledge real replies')
 await f.stop();await f.start();state=await f.cli('messenger','state');assert.equal(state.drafts[ref(a.id)].text,'Persist this draft\n保留第二行');assert.equal(state.conversations[ref(b.id)].archived,true);assert.equal((await f.cli('messenger','search','--filter','saved')).messages[0].id,reply.id)
 await f.cli('messenger','draft',ref(a.id),'--data','{"text":""}');assert.equal((await f.cli('messenger','state')).drafts[ref(a.id)],undefined)
 assert.deepEqual((await f.cli('session','list')).sessions.map(card=>[card.id,card.cwd,card.engine,card.nativeSession]),stateBefore.sessions.map(card=>[card.id,card.cwd,card.engine,card.nativeSession]))
 assert.deepEqual(await f.cli('terminal','list'),[])
 const dataFile=path.join(f.env.AGENTS_COMPANY_HOME,'messenger.json');fs.writeFileSync(dataFile,'corrupted');assert.equal((await f.request(null,'messenger.state',{})).ok,false);assert.equal(fs.readFileSync(dataFile,'utf8'),'corrupted')
 console.log('PASS Messenger Core/CLI: atomic bulk pin/favorite/archive/unread, saved/pinned/reactions/hidden messages, full-history typed search and pagination, durable scoped drafts, restart, operator-only state, unchanged native histories/receipts/identities, no implicit engines/terminals, corrupt state protection')
}finally{await f.close()}
