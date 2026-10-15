const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-session-journal-'));
process.env.CLOUD_HOSTS_HOME=root;
const journal=require('../src/session-journal.cjs');
const role={id:'session-review',threadId:'native-thread-42',targetHostId:'local',engineHostId:'local'};
after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('readonly history does not create files or start native processes',()=>{
 assert.deepEqual(journal.history({sessionId:role.id}).events,[]);
 assert.equal(fs.existsSync(path.join(root,'session-events')),false);
 assert.deepEqual(journal.summaries(),[]);
});
test('persistent native transcript captures user text, final answer, turn state, and deduplicates replay',()=>{
 journal.accepted(role,'turn-one','Run current tests; report failures.');
 journal.observe(role,{method:'turn/started',params:{threadId:role.threadId,turn:{id:'turn-one'}}});
 journal.observe(role,{method:'item/completed',params:{threadId:role.threadId,turnId:'turn-one',item:{id:'answer-one',type:'agentMessage',text:'One test failed.'}}});
 journal.observe(role,{method:'item/completed',params:{threadId:role.threadId,turnId:'turn-one',item:{id:'answer-one',type:'agentMessage',text:'One test failed.'}}});
 journal.observe(role,{method:'turn/completed',params:{threadId:role.threadId,turn:{id:'turn-one',status:'completed'}}});
 const rows=journal.history({sessionId:role.id}).events;
 assert.deepEqual(rows.map(event=>event.kind),['user','turn','assistant','turn']);
 assert.equal(rows[0].text,'Run current tests; report failures.');
 assert.equal(rows[2].text,'One test failed.');
 assert.equal(rows[3].status,'completed');
 assert.ok(rows.every(event=>event.nativeThreadId===role.threadId&&event.turnId==='turn-one'));
 assert.deepEqual(journal.history({sessionId:role.id,search:'failed'}).events.map(e=>e.kind),['assistant']);
 assert.equal(journal.history({sessionId:role.id,limit:2}).nextBefore,3);
 assert.deepEqual(journal.history({sessionId:role.id,before:3}).events.map(e=>e.sequence),[1,2]);
 const entry=fs.statSync(path.join(root,'session-events','session-review.jsonl'));
 assert.equal(entry.mode&0o777,0o600);
});
test('Codex thread/resume imports already-existing messages without model calls or duplicate rows',()=>{
 const thread={id:role.threadId,turns:[{id:'historic-turn',items:[
  {id:'prompt-old',type:'userMessage',content:[{type:'text',text:'Earlier prompt'}]},
  {id:'reply-old',type:'agentMessage',text:'Earlier native response'}
 ]}]};
 journal.imported(role,thread);journal.imported(role,thread);
 const rows=journal.history({sessionId:role.id}).events;
 assert.equal(rows.filter(e=>e.text==='Earlier native response').length,1);
 assert.equal(rows.filter(e=>e.text==='Earlier prompt').length,1);
 const s=journal.summaries().find(x=>x.sessionId===role.id);
 assert.equal(s.preview,'Earlier native response');
 assert.equal(s.count,6);
});
test('native approval observation stores only status, never secret approval params',()=>{
 journal.observe(role,{id:123,method:'item/commandExecution/requestApproval',params:{threadId:role.threadId,secret:'credential-do-not-store'}});
 const row=journal.history({sessionId:role.id}).events.at(-1);
 assert.equal(row.kind,'approval');assert.equal(row.status,'pending');
 assert.ok(!fs.readFileSync(path.join(root,'session-events','session-review.jsonl'),'utf8').includes('credential-do-not-store'));
});
test('invalid session paths, oversized messages, and symlink journal inputs are rejected',()=>{
 assert.throws(()=>journal.history({sessionId:'../secret'}),/Invalid|Select/);
 assert.throws(()=>journal.append({sessionId:'bad/id',kind:'user',text:'x'}),/Invalid/);
 assert.throws(()=>journal.append({sessionId:role.id,kind:'user',text:'x'.repeat(140000)}),/128 KiB/);
 const path_=path.join(root,'session-events','linked.jsonl');fs.symlinkSync('/dev/null',path_);
 assert.throws(()=>journal.history({sessionId:'linked'}),/symlink/);
});
test('read-only Messages API returns journal without opening or activating an engine',async()=>{
 const core=require('../src/core.cjs');
 const output=await core.dispatch('messages.nativeHistory',{sessionId:role.id,limit:3});
 assert.equal(output.events.length,3);
 assert.equal(output.readOnly,true);
 assert.ok((await core.dispatch('messages.sessions')).some(row=>row.sessionId===role.id));
});
