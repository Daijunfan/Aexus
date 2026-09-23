const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const exec = promisify(execFile);

async function fixture(t, engine = 'claude') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-agent-test-'));
  const script = path.join(directory, 'engine.cjs');
  fs.writeFileSync(
    script,
    `
const {execFileSync}=require('node:child_process');
const args=process.argv.slice(2), claude=args.includes('-p');
const prompt=claude?args[args.indexOf('-p')+1]:args.at(-1);
const out=(data)=>process.stdout.write(JSON.stringify(data)+'\\n');
const session=claude?args[args.indexOf('--resume')+1]:args[args.indexOf('resume')+1];
const mode=prompt.match(/TEST:(\\w+)/)?.[1] || 'normal';
const id='session-'+(claude?'claude':'codex');
const cli=(...args)=>JSON.parse(execFileSync('mininotion',args,{encoding:'utf8'}));
if(mode==='slow') { out({type:'assistant',message:{content:[{type:'text',text:'停止前已收到的文本'}]}}); setInterval(()=>{},1000); }
else if(mode==='failed') { out(claude?{type:'result',is_error:true,result:'提供商拒绝请求'}:{type:'turn.failed',error:{message:'提供商拒绝请求'}}); }
else if(mode==='silent') { process.stderr.write('只写诊断信息'); }
else {
 out(claude?{type:'system',subtype:'init',session_id:id}:{type:'thread.started',thread_id:id});
 const context=cli('workspace','get');
 const root=Object.keys(context.spaces)[0];
 const created=cli('page','create','--parent-id',root,'--title','真实 CLI 创建');
 cli('block','append',created.id,'--text','通过工具执行并持久化');
 const result=cli('page','get',created.id);
 const input={command:'mininotion page get '+created.id};
 out(claude?{type:'assistant',message:{content:[{type:'tool_use',id:'t1',name:'Bash',input}]}}:{type:'item.started',item:{id:'t1',type:'command_execution',command:input.command}});
 out(claude?{type:'user',message:{content:[{type:'tool_result',tool_use_id:'t1',content:JSON.stringify(result)}]}}:{type:'item.completed',item:{id:'t1',type:'command_execution',command:input.command,status:'completed',exit_code:0,aggregated_output:JSON.stringify(result)}});
 const text='## 完成\\n\\n**页面已保存** · [打开页面](mininotion://page/'+created.id+')\\n\\n| 项目 | 状态 |\\n| --- | --- |\\n| CLI | 完成 |';
 out(claude?{type:'assistant',message:{content:[{type:'text',text}]}}:{type:'item.completed',item:{type:'agent_message',text}});
 const final=JSON.stringify(claude?{type:'result',is_error:false,session_id:id,usage:{input_tokens:10,output_tokens:8}}:{type:'turn.completed',usage:{input_tokens:10,output_tokens:8}});
 process.stdout.write(final); // Deliberately omit the trailing newline.
}
`,
  );
  const variable = `MINI_NOTION_AGENT_${engine.toUpperCase()}`;
  const previous = process.env[variable];
  process.env[variable] = `${process.execPath} ${script}`;
  const server = await startServer(directory);
  const client = new BackendClient({ directory, autoStart: false });
  const call = client.call.bind(client);
  await call('workspace.init', { empty: true });
  const root = await call('space.create', { title: '测试空间', engine });
  t.after(async () => {
    await server.close();
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, server, client, call, root, script };
}
async function complete(call, pageId) {
  for (let i = 0; i < 200; i++) {
    const status = await call('agent.status', { pageId });
    if (status.status !== 'running') return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Agent did not finish');
}

for (const engine of ['claude', 'codex'])
  test(`${engine}: actual CLI edits, rapid activity completion, final tail, full history and same-session resume`, async (t) => {
    const { call, root } = await fixture(t, engine);
    await call('agent.start', { pageId: root.id, prompt: 'TEST:normal' });
    const status = await complete(call, root.id);
    assert.equal(status.status, 'idle');
    assert.equal(status.sessionId, `session-${engine}`);
    const history = await call('agent.history', { pageId: root.id });
    const activities = history.filter((message) => message.kind === 'activity');
    assert.equal(activities.length, 1);
    assert.equal(activities[0].activity.status, 'done');
    assert.match(activities[0].activity.summary, /mininotion/);
    assert.match(activities[0].activity.output, /通过工具执行并持久化/);
    assert.match(history.at(-1).text, /页面已保存/);
    assert.equal((await call('page.list', { parentId: root.id })).length, 1);
    assert.ok((await call('agent.history', { pageId: root.id, raw: true })).length >= 5);
    await call('agent.send', { pageId: root.id, text: 'TEST:normal' });
    assert.equal((await complete(call, root.id)).sessionId, status.sessionId);
    assert.equal((await call('page.list', { parentId: root.id })).length, 2);
  });

for (const engine of ['claude', 'codex'])
  test(`${engine}: error event with exit zero is failure, stderr is not assistant text`, async (t) => {
    const { call, root } = await fixture(t, engine);
    await call('agent.start', { pageId: root.id, prompt: 'TEST:failed' });
    assert.equal((await complete(call, root.id)).status, 'error');
    await call('agent.send', { pageId: root.id, text: 'TEST:silent' });
    const result = await complete(call, root.id);
    assert.equal(result.status, 'error');
    assert.match(result.error, /诊断/);
    assert.ok(
      !(await call('agent.history', { pageId: root.id })).some((message) => message.role === 'agent'),
    );
  });

test('attachment-only API sends persist several files and images before starting, reject foreign files and empty sends', async (t) => {
  const { call, root, directory } = await fixture(t);
  const names = ['note.txt', '数据.csv', 'photo.png', 'other.png'];
  const files = names.map((name) => {
    const file = path.join(directory, name);
    fs.writeFileSync(file, 'attachment ' + name);
    return file;
  });
  await assert.rejects(call('agent.start', { pageId: root.id }), { code: 'EMPTY_MESSAGE' });
  await assert.rejects(call('agent.send', { pageId: root.id, text: 123 }), { code: 'INVALID_ARGUMENT' });
  await call('agent.start', { pageId: root.id, files });
  assert.equal((await complete(call, root.id)).status, 'idle');
  const message = (await call('agent.history', { pageId: root.id }))[0];
  assert.equal(message.text, '');
  assert.equal(message.attachments.length, 4);
  for (const file of message.attachments) {
    assert.equal(
      (await call('file.read', { pageId: root.id, fileId: file.id })).content,
      'attachment ' + file.name,
    );
    assert.ok(fs.existsSync(path.join(directory, file.url.slice('asset://local/'.length))));
  }
  const another = await call('space.create', { title: '外部' });
  await assert.rejects(call('agent.send', { pageId: another.id, fileIds: [message.attachments[0].id] }), {
    code: 'FILE_NOT_FOUND',
  });
  await call('agent.send', { pageId: root.id, text: 'TEST:normal', fileIds: [message.attachments[0].id] });
  assert.equal((await complete(call, root.id)).status, 'idle');
  assert.equal((await call('file.list', { pageId: root.id })).length, 4);
});

test('CLI supports attachment-only sends, complete discoverable file operations and physical bytes after moving', async (t) => {
  const { call, root, directory } = await fixture(t);
  const run = async (...args) =>
    JSON.parse(
      (await exec(process.execPath, [path.resolve('dist-cli/cli.cjs'), '--data-dir', directory, ...args]))
        .stdout,
    );
  const file = await run('file', 'create', root.id, '--name', 'result.md', '--content', '结果');
  const folder = await run('folder', 'create', root.id, '--name', '资料');
  await run('file', 'move', root.id, file.id, '--folder-id', folder.id);
  await run('file', 'rename', root.id, file.id, '--name', '完成.md');
  await run('file', 'write-content', root.id, file.id, '--content', '新结果');
  assert.equal((await run('file', 'read', root.id, file.id)).content, '新结果');
  await run('agent', 'send', root.id, '--file-ids', JSON.stringify([file.id]));
  assert.equal((await complete(call, root.id)).status, 'idle');
  await run('space', 'remove-file', root.id, file.id);
  assert.equal((await call('file.list', { pageId: root.id })).length, 0);
  await call('history.undo', { pageId: root.id });
  assert.equal((await call('file.read', { pageId: root.id, fileId: file.id })).content, '新结果');
});

test('stop flushes received text, rejects overlapping sends and does not fabricate success', async (t) => {
  const { call, root } = await fixture(t);
  await call('agent.start', { pageId: root.id, prompt: 'TEST:slow' });
  await assert.rejects(call('agent.send', { pageId: root.id, text: 'again' }), { code: 'AGENT_BUSY' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  await call('agent.stop', { pageId: root.id });
  assert.equal((await complete(call, root.id)).status, 'stopped');
  assert.ok(
    (await call('agent.history', { pageId: root.id })).some(
      (message) => message.text === '停止前已收到的文本',
    ),
  );
});

test('uploads validate folders, retain duplicate names, and backups include root files, nested files and transcripts', async (t) => {
  const { call, root, directory, client } = await fixture(t);
  await assert.rejects(
    call('file.create', { pageId: root.id, folderId: 'missing', name: 'x', content: '' }),
    { code: 'FOLDER_NOT_FOUND' },
  );
  const one = await client.uploadToSpace(root.id, null, '报告.txt', Buffer.from('正文'));
  const two = await client.uploadToSpace(root.id, null, '报告.txt', Buffer.from('副本'));
  assert.notEqual(one.id, two.id);
  assert.notEqual(one.url, two.url);
  assert.equal(one.name, '报告.txt');
  const folder = await call('folder.create', { pageId: root.id, name: 'nested' });
  const three = await call('file.create', {
    pageId: root.id,
    folderId: folder.id,
    name: 'no-extension',
    content: 'nested',
  });
  await call('agent.send', { pageId: root.id, fileIds: [one.id] });
  await complete(call, root.id);
  const zip = path.join(directory, 'backup.mininotion');
  await call('backup.export', { path: zip });
  fs.rmSync(path.join(directory, 'spaces'), { recursive: true });
  fs.rmSync(path.join(directory, 'agents'), { recursive: true });
  await call('backup.restore', { path: zip, confirm: true });
  for (const [file, content] of [
    [one, '正文'],
    [two, '副本'],
    [three, 'nested'],
  ])
    assert.equal((await call('file.read', { pageId: root.id, fileId: file.id })).content, content);
  assert.ok((await call('agent.history', { pageId: root.id })).length >= 3);
});

test('duplicated spaces get independent file bytes, preserve engine and do not share session identity', async (t) => {
  const { call, root } = await fixture(t, 'codex');
  const file = await call('file.create', { pageId: root.id, name: '独立文件.md', content: 'original' });
  await call('block.append', {
    pageId: root.id,
    blocks: [{ type: 'file', props: { url: file.url, name: file.name } }],
  });
  const copy = await call('page.duplicate', { pageId: root.id });
  const copied = (await call('file.list', { pageId: copy.id }))[0];
  assert.notEqual(copied.url, file.url);
  assert.notEqual(copied.id, file.id);
  await call('file.write-content', { pageId: copy.id, fileId: copied.id, content: 'copy only' });
  assert.equal((await call('file.read', { pageId: root.id, fileId: file.id })).content, 'original');
  assert.equal((await call('file.read', { pageId: copy.id, fileId: copied.id })).content, 'copy only');
  assert.equal((await call('space.get', { pageId: copy.id })).space.engine, 'codex');
  assert.ok(JSON.stringify((await call('page.get', { pageId: copy.id })).blocks).includes(copied.url));
});

test('legacy space asset URLs migrate on restart and recent running state is interrupted without losing session', async (t) => {
  const { call, root, directory, server } = await fixture(t);
  const file = await call('file.create', { pageId: root.id, name: 'legacy.txt', content: 'legacy bytes' });
  await server.close();
  const data = JSON.parse(fs.readFileSync(path.join(directory, 'workspace.json'), 'utf8'));
  data.pages.find((page) => page.id === root.id).files[0].url = `asset://local/${path.basename(file.url)}`;
  Object.assign(data.spaces[root.id].agent, {
    status: 'running',
    startedAt: Date.now(),
    sessionId: 'preserved-session',
  });
  fs.writeFileSync(path.join(directory, 'workspace.json'), JSON.stringify(data));
  const restarted = await startServer(directory);
  try {
    const client = new BackendClient({ directory, autoStart: false });
    const status = await client.call('agent.status', { pageId: root.id });
    assert.equal(status.status, 'error');
    assert.equal(status.sessionId, 'preserved-session');
    assert.equal(
      (await client.call('file.read', { pageId: root.id, fileId: file.id })).content,
      'legacy bytes',
    );
    assert.equal((await client.call('file.get', { pageId: root.id, fileId: file.id })).url, file.url);
  } finally {
    await restarted.close();
  }
});

test('long transcripts upsert activities without losing messages beyond the workspace tail', async (t) => {
  const { call, root, server } = await fixture(t);
  const messages = Array.from({ length: 130 }, (_, index) => ({
    id: `m-${index}`,
    role: index % 2 ? 'agent' : 'user',
    kind: 'text',
    text: `消息 ${index}`,
    at: index,
  }));
  server.service.storage.appendAgentLog(root.id, messages);
  await server.service.request(
    { jsonrpc: '2.0', id: 'seed', method: 'agent.append', params: { pageId: root.id, messages } },
    true,
  );
  assert.equal((await call('space.get', { pageId: root.id })).space.agent.messages.length, 50);
  assert.equal((await call('agent.history', { pageId: root.id, limit: 200 })).length, 130);
  assert.equal((await call('agent.history', { pageId: root.id, limit: 200 }))[0].text, '消息 0');
  await assert.rejects(call('agent.state', { pageId: root.id, changes: { status: 'idle' } }), {
    code: 'METHOD_NOT_FOUND',
  });
});

test('schema method names can be invoked directly in the CLI without confusing schema arguments', async (t) => {
  const { root, directory } = await fixture(t);
  const run = async (...args) =>
    JSON.parse(
      (await exec(process.execPath, [path.resolve('dist-cli/cli.cjs'), '--data-dir', directory, ...args]))
        .stdout,
    );
  assert.equal((await run('schema', 'block.append')).method, 'block.append');
  await run('block.append', root.id, '--text', 'dotted CLI works');
  assert.match(JSON.stringify((await run('page.get', root.id)).blocks), /dotted CLI works/);
});

test('CLI resolves attachment paths relative to the caller rather than the background service', async (t) => {
  const { root, directory, call } = await fixture(t);
  const cwd = path.join(directory, 'caller');
  fs.mkdirSync(cwd);
  fs.writeFileSync(path.join(cwd, 'from-cwd.txt'), 'caller content');
  await exec(
    process.execPath,
    [
      path.resolve('dist-cli/cli.cjs'),
      '--data-dir',
      directory,
      'agent',
      'send',
      root.id,
      '--files',
      '["from-cwd.txt"]',
    ],
    { cwd },
  );
  assert.equal((await complete(call, root.id)).status, 'idle');
  const file = (await call('file.list', { pageId: root.id }))[0];
  assert.equal((await call('file.read', { pageId: root.id, fileId: file.id })).content, 'caller content');
});
