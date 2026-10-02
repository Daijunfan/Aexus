const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {promisify} = require('node:util');
const {execFile} = require('node:child_process');
const {startServer} = require('../dist-cli/server.cjs');
const {BackendClient} = require('../dist-cli/client.cjs');
const run = promisify(execFile);
async function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mn-authoring-')));
  const client = new BackendClient({workspace:root,autoStart:false});
  const server = await startServer(client.directory,root);
  t.after(async()=>{await server.close();fs.rmSync(root,{recursive:true,force:true})});
  return {root,call:client.call.bind(client)};
}
test('every supported block exposes actionable fields and validating table examples does not mutate',async t=>{
  const {call}=await fixture(t),schema=await call('schema',{method:'block.append',compact:true});
  for(const type of schema.blockTypes){
    assert.ok(schema.blockFields[type]?.example, type+' missing example');
    const example=schema.blockFields[type].example;
    const blocks=type==='column'?[{type:'columnList',children:[example]}]:[example];
    assert.equal((await call('block.validate',{blocks})).valid,true,type);
  }
  assert.equal(schema.icons,undefined);
  const before=await call('workspace.get');
  await assert.rejects(()=>call('block.validate',{blocks:[{type:'table',content:{rows:[{cells:[{type:'text',text:'bad'}]}]}}]}),{code:'INVALID_CONTENT'});
  assert.deepEqual(await call('workspace.get'),before);
  for(const topic of ['start','pages','blocks','databases','delegation','verify']) assert.ok((await call('guide',{topic})).markdown.length>100);
  await assert.rejects(()=>call('guide',{topic:'typo'}),{code:'INVALID_ARGUMENT'});
});
test('Markdown authoring produces real native rich blocks, preserves page hierarchy and rejects stale replacement',async t=>{
  const {root,call}=await fixture(t);
  const page=await call('page.create',{title:'Agent 技术分析',color:'white'});
  const child=await call('page.create',{title:'子分析',color:'white',parentId:page.id});
  const grandchild=await call('page.create',{title:'深层细节',color:'white',parentId:child.id});
  const markdown='## 入口与数据流\n\n共享 **Core**，调用 `handleRequest`。\n\n| 模块 | 职责 |\n| --- | --- |\n| Core | 业务 |\n| UI | 渲染 |\n\n```typescript\nawait handleRequest(request)\n```\n\n- 读取源码\n- [x] 回读页面\n';
  const before=await call('page.read-markdown',{pageId:page.id});
  const saved=await call('page.write-markdown',{pageId:page.id,markdown,expectedHash:before.hash});
  assert.ok(saved.blockCount>=6);
  const native=await call('page.get',{pageId:page.id});
  for(const type of ['heading','paragraph','table','codeBlock','bulletListItem','checkListItem'])assert.ok(native.blocks.some(block=>block.type===type),type);
  assert.equal((await call('page.get',{pageId:child.id})).parentId,page.id);
  assert.match((await call('page.read-markdown',{pageId:page.id})).markdown,/handleRequest/);
  await assert.rejects(()=>call('page.write-markdown',{pageId:page.id,markdown:'stale',expectedHash:before.hash}),{code:'CONFLICT'});
  assert.deepEqual((await call('page.get',{pageId:page.id})).blocks,native.blocks);
  await call('page.write-markdown',{pageId:child.id,markdown:'### 技术依据\n\n源码路径：src/main/server.ts'});
  await call('page.write-markdown',{pageId:grandchild.id,markdown:'具体错误处理流程'});
  await call('page.write-markdown',{pageId:page.id,markdown:'\n## 补充证据\n\n保留此前内容',mode:'append'});
  assert.match((await call('page.read-markdown',{pageId:page.id})).markdown,/handleRequest/);
  const db=await call('database.create',{title:'技术索引',color:'blue',parentId:page.id,view:'table'});
  await call('record.create',{databaseId:db.id,title:'Core',color:'white',blocks:[{type:'paragraph',content:'实际源码分析'}]});
  for(const type of ['board','gallery','list'])await call('view.create',{databaseId:db.id,type,name:type});
  const audit=await call('page.audit',{pageId:page.id});
  assert.equal(audit.maxDepth,3);assert.equal(audit.pageCount,5);assert.deepEqual(audit.emptyLeafPages,[]);
  assert.equal(audit.databases[0].views.length,4);assert.equal(audit.databases[0].recordCount,1);
  const location=await call('fs.path',{pageId:page.id});
  assert.ok(JSON.parse(fs.readFileSync(location.absolutePath)).page.blocks.some(b=>b.type==='table'));
  const cli=path.resolve('dist-cli/cli.cjs');
  for(const args of [['--workspace',root],['--workspace='+root]]){
    const reply=await run(process.execPath,[cli,...args,'page.audit',page.id]);
    assert.equal(JSON.parse(reply.stdout).pageCount,5,'dotted command through a workspace launcher');
  }
  await call('page.update',{pageId:page.id,changes:{locked:true}});
  await assert.rejects(()=>call('page.write-markdown',{pageId:page.id,markdown:'overwrite'}),{code:'PAGE_LOCKED'});
  await assert.rejects(()=>call('page.write-markdown',{pageId:child.id,markdown:'text',mode:'guess'}),{code:'INVALID_ARGUMENT'});
});

test('technical documentation can quote asset protocol syntax without treating code or prose as attachments',async t=>{
  const {call}=await fixture(t);
  const page=await call('page.create',{title:'协议技术分析',color:'white'});
  const markdown='## 附件协议\n\n字面示例：`asset://local/<attachment-id>`。\n\n```text\nasset://local/\nasset://local/attachments/<id>\n```\n';
  const saved=await call('page.write-markdown',{pageId:page.id,markdown});
  const read=await call('page.read-markdown',{pageId:page.id});
  assert.equal(saved.hash,read.hash);
  assert.match(read.markdown,/asset:\/\/local\//);
  assert.equal((await call('page.get',{pageId:page.id})).title,page.title);
});

test('code language aliases and unsupported fences cannot make native documents unrenderable',async t=>{
 const {call}=await fixture(t);
 const page=await call('page.create',{title:'语言兼容',color:'white'});
 const markdown='```js\nconst a = 1;\n```\n\n```bash\necho hello\n```\n\n```mermaid\ngraph TD; A-->B;\n```';
 await call('page.write-markdown',{pageId:page.id,markdown});
 const blocks=(await call('page.get',{pageId:page.id})).blocks.filter(block=>block.type==='codeBlock');
 assert.deepEqual(blocks.map(block=>block.props.language),['javascript','shellscript','text']);
 assert.equal(blocks[2].props.originalLanguage,'mermaid');
 assert.match(JSON.stringify(blocks[2].content),/graph TD/);
 const normalized=await call('block.validate',{blocks:[{type:'codeBlock',props:{language:'ts'},content:'const n: number = 1'}]});
 assert.equal(normalized.blocks[0].props.language,'typescript');
});

test('legacy table discriminators and optional text styles are normalized before renderer use',async t=>{
 const {call}=await fixture(t);
 const p=await call('page.create',{title:'旧表格',color:'white'});
 const location=await call('fs.path',{pageId:p.id});
 const file=JSON.parse(fs.readFileSync(location.absolutePath,'utf8'));
 file.page.blocks=[{id:'legacy-table',type:'table',content:{rows:[{cells:[[{type:'text',text:'旧表格正文'}],['行内字符串']]}]}}];
 fs.writeFileSync(location.absolutePath,JSON.stringify(file));
 const read=await call('page.get',{pageId:p.id});
 assert.equal(read.blocks[0].content.type,'tableContent');
 assert.deepEqual(read.blocks[0].content.rows[0].cells[0][0].styles,{});
 assert.equal(read.blocks[0].content.rows[0].cells[1][0].type,'text');
 assert.equal((await call('block.validate',{blocks:file.page.blocks})).valid,true);
 await assert.rejects(()=>call('block.validate',{blocks:[{type:'table',content:{type:'wrong',rows:[]}}]}),{code:'INVALID_TABLE'});
});
