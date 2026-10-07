// Opt-in live acceptance: uses the installed engines and their existing provider settings.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { startServer } = require('../dist-cli/server.cjs');
const { BackendClient } = require('../dist-cli/client.cjs');
const engines = (process.env.MINI_NOTION_LIVE_ENGINES || 'claude,codex').split(',');
const directory = path.resolve('.local-data', `agent-live-${Date.now()}`);
const reports = [];
let server, client;
const call = (method, params) => client.call(method, params);
async function turn(root, text, files) {
  const before = await call('agent.status', { pageId: root.id });
  await call('agent.send', { pageId: root.id, text, files });
  let status;
  const deadline = Date.now() + 240000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    status = await call('agent.status', { pageId: root.id });
  } while (status.status === 'running' && Date.now() < deadline);
  assert.equal(status.status, 'idle', JSON.stringify(status));
  if (before.sessionId)
    assert.equal(status.sessionId, before.sessionId, 'must resume the same native session');
  const history = await call('agent.history', { pageId: root.id, limit: 10000 });
  assert.ok(
    history.some((message) => message.kind === 'activity'),
    'must actually use tools',
  );
  return {
    status,
    text: history.filter((message) => message.role === 'agent' && message.kind === 'text').at(-1)?.text,
    history,
  };
}
async function scenario(engine, name, fn) {
  if (process.env.MINI_NOTION_LIVE_CASE && !name.includes(process.env.MINI_NOTION_LIVE_CASE)) return;
  const start = Date.now();
  try {
    const evidence = await fn();
    reports.push({ engine, name, passed: true, seconds: (Date.now() - start) / 1000, evidence });
    console.log(`${engine}: ${name}: PASS`);
  } catch (error) {
    reports.push({ engine, name, passed: false, error: String(error), seconds: (Date.now() - start) / 1000 });
    console.log(`${engine}: ${name}: FAIL ${error.message}`);
  }
  fs.writeFileSync(path.join(directory, 'acceptance.json'), JSON.stringify({ directory, reports }, null, 2));
}
(async () => {
  fs.mkdirSync(directory, { recursive: true });
  server = await startServer(directory);
  client = new BackendClient({ directory, autoStart: false });
  await call('workspace.init', { empty: true, name: '真实 Agent 验收' });
  for (const [name, content] of [
    ['brief.txt', '项目：Local Notes。界面负责人小林，截止 2026-09-18；CLI 负责人小周，截止 2026-09-19。'],
    ['budget.csv', 'item,cost\nDesign,120\nCLI,80\n'],
  ])
    fs.writeFileSync(path.join(directory, name), content);
  for (const [name, color, label] of [
    ['red.png', '#cc3333', 'RED 17'],
    ['blue.png', '#3366cc', 'BLUE 29'],
  ])
    await sharp(
      Buffer.from(
        `<svg width="320" height="180"><rect width="320" height="180" fill="${color}"/><text x="30" y="100" fill="white" font-size="42" font-family="Arial">${label}</text></svg>`,
      ),
    )
      .png()
      .toFile(path.join(directory, name));
  await Promise.all(
    engines.map(async (engine) => {
      const root = await call('space.create', { title: `${engine} 验收`, engine });
      await scenario(engine, '创建页面与回读', async () => {
        const result = await turn(
          root,
          '这是隔离验收。请用 CLI 在主页面下创建标题为「验收纪要」的子页面，正文为「决定：周五发布。负责人：小林。」。回读确认并返回页面链接。不调用子 Agent。',
        );
        const pages = await call('page.list', { parentId: root.id });
        const page = pages.find((page) => page.title === '验收纪要');
        assert.ok(page);
        assert.match(JSON.stringify(await call('page.get', { pageId: page.id })), /周五发布/);
        return { pageId: page.id, sessionId: result.status.sessionId, reply: result.text };
      });
      await scenario(engine, '续接会话并编辑既有页面', async () => {
        const result = await turn(
          root,
          '继续编辑刚才的「验收纪要」：把负责人从小林改为小周，保留周五发布的决定，并追加一个待办块「检查 CLI 与 UI 同步」。不要创建重复页面，回读验证。',
        );
        const pages = (await call('page.list', { parentId: root.id })).filter(
          (page) => page.title === '验收纪要',
        );
        assert.equal(pages.length, 1);
        const page = await call('page.get', { pageId: pages[0].id });
        assert.match(JSON.stringify(page.blocks), /小周/);
        assert.match(JSON.stringify(page.blocks), /检查 CLI 与 UI 同步/);
        return { pageId: page.id, reply: result.text };
      });
      if (engine === 'claude') {
        await scenario(engine, '多文档转数据库与多视图', async () => {
          const result = await turn(
            root,
            '读取这两个附件，在主页面下创建「交付计划」数据库，创建界面和 CLI 两条任务，用文本属性记录负责人、日期属性记录各自截止日期、数字属性记录预算。提供表格、看板和日历三个视图。在主页面写总预算 200，并创建空间文件「交付摘要.md」写同样摘要。通过 CLI 回读验证。',
            ['brief.txt', 'budget.csv'].map((file) => path.join(directory, file)),
          );
          const db = (await call('page.list', { parentId: root.id })).find(
            (page) => page.title === '交付计划',
          );
          assert.ok(db);
          const definition = await call('database.get', { databaseId: db.id });
          const types = definition.views.map((view) => view.type);
          for (const type of ['table', 'board', 'calendar']) assert.ok(types.includes(type), type);
          const rows = await call('record.list', { databaseId: db.id });
          assert.equal(rows.length, 2);
          const owner = definition.columns.find((column) => column.type === 'text').id;
          const due = definition.columns.find((column) => column.type === 'date').id;
          const budget = definition.columns.find((column) => column.type === 'number').id;
          for (const [name, person, date, amount] of [
            ['界面', '小林', '2026-09-18', 120],
            ['CLI', '小周', '2026-09-19', 80],
          ]) {
            const row = rows.find((row) => row.title.includes(name));
            assert.ok(row);
            assert.equal(row.values[owner], person);
            assert.equal(row.values[due].start || row.values[due], date);
            assert.equal(row.values[budget], amount);
          }
          assert.match(JSON.stringify((await call('page.get', { pageId: root.id })).blocks), /200/);
          const file = (await call('file.list', { pageId: root.id })).find(
            (file) => file.name === '交付摘要.md',
          );
          assert.ok(file);
          assert.match((await call('file.read', { pageId: root.id, fileId: file.id })).content, /200/);
          return { databaseId: db.id, fileId: file.id, reply: result.text };
        });
        await scenario(engine, '纯附件消息', async () => {
          const result = await turn(root, '', [path.join(directory, 'budget.csv')]);
          const sent = result.history.filter((message) => message.role === 'user').at(-1);
          assert.equal(sent.text, '');
          assert.equal(sent.attachments.length, 1);
          assert.match(result.text, /200|120|80/);
          return { attachments: sent.attachments.map((file) => file.name), reply: result.text };
        });
      } else {
        await scenario(engine, '多图片和文本联合理解', async () => {
          const result = await turn(
            root,
            '读取两张图片里的英文颜色和数字，创建空间文件「图片识别.txt」，分别写出两组颜色与数字，并写出数字之和。使用 CLI 创建文件并回读。',
            ['red.png', 'blue.png'].map((file) => path.join(directory, file)),
          );
          const file = (await call('file.list', { pageId: root.id })).find(
            (file) => file.name === '图片识别.txt',
          );
          assert.ok(file);
          const content = (await call('file.read', { pageId: root.id, fileId: file.id })).content;
          assert.match(content, /17/);
          assert.match(content, /29/);
          assert.match(content, /46/);
          return { fileId: file.id, content, reply: result.text };
        });
      }
      await scenario(engine, '锁定页面失败不能虚报完成', async () => {
        const page = (await call('page.list', { parentId: root.id })).find(
          (page) => page.title === '验收纪要',
        );
        assert.ok(page);
        await call('page.update', { pageId: page.id, locked: true });
        const before = await call('page.get', { pageId: page.id });
        const result = await turn(
          root,
          '把「验收纪要」的正文替换成「不应写入」。不要解锁页面。如果 CLI 拒绝写入，请如实报告，不能声称完成。',
        );
        assert.deepEqual((await call('page.get', { pageId: page.id })).blocks, before.blocks);
        assert.match(result.text, /锁|拒绝|无法|不能|未/);
        return { pageId: page.id, reply: result.text };
      });
    }),
  );
  console.log(
    JSON.stringify({
      directory,
      passed: reports.filter((report) => report.passed).length,
      failed: reports.filter((report) => !report.passed).length,
    }),
  );
  process.exitCode = reports.some((report) => !report.passed) ? 1 : 0;
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await server?.close();
  });
