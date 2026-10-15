const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-plan-query-'));
process.env.CLOUD_HOSTS_HOME=home;
const agents=require('../src/agent-sessions.cjs'),prior=agents.sessions;
const people=['alpha','bravo'].map(id=>({id,name:'Agent '+id,engine:'codex',transport:'native',
 threadId:'thread-'+id,targetHostId:'local',engineHostId:'local',cwd:home,permission:'full',running:true,busy:false}));
agents.sessions=()=>structuredClone(people);
const company=require('../src/company.cjs'),plans=require('../src/plan-scheduler.cjs');
const mcp=require('../src/collaboration-mcp.cjs');
const shared=company.createTeam({name:'Release checks',memberIds:['alpha']});
const tomorrow=new Date(Date.now()+3*3600*1000).toISOString();
const fixture=(name,agentId,priority,tags)=>plans.create({name,priority,tags,
 action:{type:'agent',mode:'resume',agentId,text:'Test task '+name},rule:{kind:'once',at:tomorrow},
 enabled:false});
const first=fixture('Alpha checks','alpha','urgent',['verification','release']);
const second=fixture('Bravo checks','bravo','normal',['qa']);
const extra=fixture('Alpha notes','alpha','high',['release']);
const fake=id=>({role:people.find(row=>row.id===id),threadId:'thread-'+id,busy:true,dead:false,
 toolScope:{source:'private',agentId:id,turnId:'turn-'+id}});
let request=0;const api=(id,args)=>mcp.invoke(fake(id),'cloud_api',{command:'plan.query',args},'query-'+(++request));
after(async()=>{await plans.stop();agents.sessions=prior;fs.rmSync(home,{recursive:true,force:true})});

test('Plan query migrates Aexus facets, tagging, team and layout sorting over one store',()=>{
 const result=plans.query({filter:{team:shared.id,tags:['release']},sort:'priority',direction:'desc'});
 assert.deepEqual(result.rows.map(row=>row.name),['Alpha checks','Alpha notes']);
 assert.equal(result.total,2);
 assert.equal(result.counts.paused,2);
 assert.ok(result.facets.tags.includes('qa'));
 assert.equal(result.rows[0].employee.id,'alpha');
 assert.equal(result.rows[0].employee.team,'Release checks');
 assert.equal(result.rows[0].target.exists,true);
 assert.equal(result.rows[0].timing.kind,'once');
 assert.equal(result.rows[0].priority,'urgent');
 const page=plans.query({sort:'name',direction:'asc',limit:1,offset:1});
 assert.equal(page.rows[0].name,'Alpha notes');assert.equal(page.hasMore,true);assert.equal(page.total,3);
 assert.equal(plans.query({status:'paused'}).total,3);
 assert.equal(plans.query({filter:{states:['paused'],priorities:['urgent']}}).total,1);
 assert.equal(plans.query({filter:{search:'BRAVO'}}).rows[0].id,second.id);
});

test('Agent Plan query applies scope before aggregating counts, tags, facets or returning result rows',async()=>{
 const a=(await api('alpha',{filter:{employee:'self'},sort:'name'})).data;
 assert.deepEqual(a.rows.map(row=>row.id).sort(),[first.id,extra.id].sort());
 assert.equal(a.total,2);
 assert.equal(a.facets.tags.includes('qa'),false,'another Agent private Plan must not leak as a facet');
 assert.equal(a.rows.every(row=>row.action.agentId==='alpha'),true);
 const b=(await api('bravo',{filter:{employee:'self'}})).data;
 assert.deepEqual(b.rows.map(row=>row.id),[second.id]);
 assert.equal(b.facets.tags.includes('release'),false);
 const scan=(await api('bravo',{search:'release'})).data;
 assert.equal(scan.total,0,'cross-employee private search cannot reveal plan names');
});

test('strict native Plan tags and views reject untyped filters and duplicate or oversized tags',()=>{
 assert.throws(()=>fixture('Dupes','alpha','normal',['same','same']),/Duplicate Plan tag/);
 assert.throws(()=>fixture('Huge','alpha','normal',['long'.repeat(11)]),/Plan tag/);
 assert.throws(()=>plans.query({filter:{credential:'secret'}}),/Unknown Plan query filter/);
 assert.throws(()=>plans.query({filter:{states:['guardian']}}),/Invalid states/);
 assert.throws(()=>plans.query({filter:{employee:'self'}}),/authenticated Agent/);
 assert.throws(()=>plans.query({sort:'create-new-run'}),/Invalid Plan sort/);
 const update=plans.update({id:second.id,expectedRevision:1,patch:{tags:['v2'],priority:'urgent'}});
 assert.deepEqual(update.tags,['v2']);assert.equal(update.priority,'urgent');
 assert.equal(plans.query({filter:{tags:['qa']}}).total,0);
 assert.equal(plans.query({filter:{tags:['v2']}}).total,1);
});
