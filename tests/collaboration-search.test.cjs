const {test,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const home=fs.mkdtempSync(path.join(os.tmpdir(),'cloudhosts-group-search-'));
process.env.CLOUD_HOSTS_HOME=home;
const groups=require('../src/collaboration.cjs');
const core=require('../src/core.cjs');
after(()=>fs.rmSync(home,{recursive:true,force:true}));

test('archived history remains fully readable and paginated in correct sequence',()=>{
 const group=groups.create({name:'Large history',memberIds:[]});
 for(let i=0;i<227;i++)groups.post({id:group.id,kind:'note',text:'message-'+String(i).padStart(3,'0')});
 let before,all=[];
 do{
  const page=groups.messages({id:group.id,before,limit:37});
  all.unshift(...page.messages);
  before=page.nextBefore;
 }while(before!==null);
 assert.equal(all.length,227);
 assert.equal(all[0].text,'message-000');
 assert.equal(all.at(-1).text,'message-226');
 assert.deepEqual([...new Set(all.map(item=>item.id))].length,227);
 groups.archive({id:group.id});
 assert.equal(groups.messages({id:group.id,limit:20}).messages.at(-1).text,'message-226');
});

test('search matches Chinese words, attachment names, author and literal LIKE wildcard characters',async()=>{
 const group=groups.create({name:'Project archive',memberIds:[]});
 const other=groups.create({name:'Private archive',memberIds:[]});
 groups.post({id:other.id,kind:'note',text:'uniquely-separated private text'});
 groups.post({id:group.id,kind:'note',text:'版本完成 _ 10% ready'});
 groups.post({id:group.id,kind:'note',text:'测试：原生 Agent 稳定'});
 groups.post({id:group.id,kind:'note',text:'not relevant'});
 const attachment=require('../src/station.cjs').create('xylophone-public.csv','file',null,'123');
 groups.post({id:group.id,kind:'note',text:'meeting attachment',files:[attachment.id]});
 assert.equal((await core.dispatch('messages.search',{id:group.id,query:'测试'})).messages.length,1);
 assert.equal(groups.search({id:group.id,query:'10%'}).messages[0].text,'版本完成 _ 10% ready');
 assert.equal(groups.search({id:group.id,query:'_'}).messages.length,1);
 assert.equal(groups.search({id:group.id,query:'xylophone'}).messages[0].text,'meeting attachment');
 assert.equal(groups.search({id:group.id,query:'You'}).messages.length,4);
 assert.equal(groups.search({id:group.id,query:'uniquely-separated'}).messages.length,0);
 assert.throws(()=>groups.search({id:group.id,query:''}),/Search must/);
 assert.throws(()=>groups.search({id:group.id,query:'x'.repeat(161)}),/Search must/);
});

test('search cursor isolates records from later inserts and returns complete stable pages',()=>{
 const group=groups.create({name:'Target archive',memberIds:[]});
 for(let i=0;i<114;i++)groups.post({id:group.id,kind:'note',text:'sprint report #'+i});
 let page=groups.search({id:group.id,query:'sprint report',limit:37});
 assert.equal(page.messages.length,37);
 assert.ok(page.nextBefore);
 const first=page.messages.at(-1).sequence;
 groups.post({id:group.id,kind:'note',text:'sprint report #late'});
 const second=groups.search({id:group.id,query:'sprint report',before:page.nextBefore,limit:37});
 assert.equal(second.messages.length,37);
 assert.ok(second.messages.at(-1).sequence<first);
 assert.equal(second.messages[0].sequence,page.nextBefore-37);
});
