const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
const prompt = args[args.indexOf('-p') + 1] || '';
const cli = (...args) => JSON.parse(execFileSync('mininotion', args, { encoding: 'utf8' }));
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const root = Object.keys(cli('workspace', 'get').spaces)[0];
emit({ type: 'system', subtype: 'init', session_id: 'ui-session' });
if (prompt.includes('FAIL')) {
  emit({ type: 'result', is_error: true, result: '验收用：提供商暂时不可用' });
  process.exit(0);
}
const page = cli('page', 'create', '--title', 'Agent 整理的项目', '--parent-id', root);
cli('block', 'append', page.id, '--text', '主流程已通过 CLI 完成');
const file = cli(
  'file',
  'create',
  root,
  '--name',
  'summary.md',
  '--content',
  '项目摘要：由 Agent 通过 CLI 创建。',
);
emit({
  type: 'assistant',
  message: {
    content: [
      { type: 'tool_use', id: 'tool-ui', name: 'Bash', input: { command: 'mininotion page get ' + page.id } },
    ],
  },
});
emit({
  type: 'user',
  message: {
    content: [
      { type: 'tool_result', tool_use_id: 'tool-ui', content: JSON.stringify(cli('page', 'get', page.id)) },
    ],
  },
});
setTimeout(() => {
  emit({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'text',
          text: `## 已整理好\n\n已保存 **项目页面** 和摘要文件。\n\n- [项目页面](mininotion://page/${page.id})\n- [摘要文件](mininotion://space/${root}/file/${file.id})\n\n| 内容 | 状态 |\n| --- | --- |\n| 页面 | 已保存 |\n| 文件 | 已保存 |\n\n\`\`\`text\n可回读、可继续编辑\n\`\`\``,
        },
      ],
    },
  });
  process.stdout.write(JSON.stringify({ type: 'result', session_id: 'ui-session', is_error: false }));
}, 400);
