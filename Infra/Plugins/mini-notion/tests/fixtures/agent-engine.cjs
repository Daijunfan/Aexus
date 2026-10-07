// Deterministic Claude streaming SDK / Codex App Server peer. Never calls a model.
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createInterface } = require('node:readline');
const args = process.argv.slice(2),
  codex = args.includes('app-server');
const profile = process.env.MINI_NOTION_FIXTURE_PROFILE || 'ui';
const session =
  process.env.MINI_NOTION_FIXTURE_SESSION ||
  (profile === 'ui' ? 'ui-session' : `session-${codex ? 'codex' : 'claude'}`);
const emit = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const cli = (...args) => JSON.parse(execFileSync('mininotion', args, { encoding: 'utf8' }));
let turn = '',
  activeInput = '',
  sequence = 0;
const notify = (method, params) => emit({ method, params });
const assistant = (content) =>
  emit({
    type: 'assistant',
    uuid: randomUUID(),
    session_id: session,
    parent_tool_use_id: null,
    message: {
      id: `message-${sequence++}`,
      type: 'message',
      role: 'assistant',
      model: 'fixture',
      content,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 8 },
    },
  });
function finish(error, interrupted = false, text = '') {
  if (codex) {
    notify('thread/tokenUsage/updated', {
      threadId: session,
      tokenUsage: { total: { inputTokens: 10, outputTokens: 8 }, last: { totalTokens: 18 } },
    });
    notify('turn/completed', {
      threadId: session,
      turn: {
        id: turn,
        status: error ? 'failed' : interrupted ? 'interrupted' : 'completed',
        ...(error ? { error: { message: error } } : {}),
      },
    });
  } else
    emit({
      type: 'result',
      subtype: error ? 'error_during_execution' : 'success',
      is_error: !!error,
      result: error || text,
      errors: error ? [error] : [],
      session_id: session,
      uuid: randomUUID(),
      user_message_uuid: activeInput,
      duration_ms: 1,
      duration_api_ms: 0,
      num_turns: 1,
      total_cost_usd: 0,
      usage: {
        input_tokens: 10,
        output_tokens: 8,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
    });
}
function work(prompt) {
  const mode = prompt.match(/TEST:(\w+)/)?.[1] || (prompt.includes('FAIL') ? 'failed' : 'normal');
  if (mode === 'silent') {
    process.stderr.write('只写诊断信息\n');
    process.exit(0);
  }
  if (mode === 'failed') {
    finish(profile === 'ui' ? '验收用：提供商暂时不可用' : '提供商拒绝请求');
    return;
  }
  if (mode === 'slow') {
    if (codex)
      notify('item/agentMessage/delta', {
        threadId: session,
        turnId: turn,
        itemId: 'slow',
        delta: '停止前已收到的文本',
      });
    else assistant([{ type: 'text', text: '停止前已收到的文本' }]);
    return;
  }
  if (profile === 'transcript') {
    const texts = JSON.parse(process.env.MINI_NOTION_FIXTURE_TEXTS || '[]');
    texts.forEach((text, index) => setTimeout(() => assistant([{ type: 'text', text }]), 40 * (index + 1)));
    setTimeout(
      () =>
        assistant([
          {
            type: 'tool_use',
            id: 'transcript-tool',
            name: 'Bash',
            input: { command: 'mininotion page list' },
          },
        ]),
      40 + texts.length * 40,
    );
    setTimeout(
      () =>
        emit({
          type: 'user',
          uuid: randomUUID(),
          session_id: session,
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'transcript-tool', content: '{"pages":[]}' }],
          },
        }),
      80 + texts.length * 40,
    );
    setTimeout(() => finish(), 120 + texts.length * 40);
    return;
  }
  try {
    const context = cli('workspace', 'get'),
      root = Object.keys(context.spaces)[0];
    const page = cli(
      'page',
      'create',
      '--color',
      'white',
      '--parent-id',
      root,
      '--title',
      profile === 'ui' ? 'Agent 整理的项目' : '真实 CLI 创建',
    );
    cli(
      'block',
      'append',
      page.id,
      '--text',
      profile === 'ui' ? '主流程已通过 CLI 完成' : '通过工具执行并持久化',
    );
    const output = JSON.stringify(cli('page', 'get', page.id)),
      command = 'mininotion page get ' + page.id,
      tool = `tool-${sequence++}`;
    if (codex) {
      notify('item/started', {
        threadId: session,
        turnId: turn,
        item: { id: tool, type: 'commandExecution', command, status: 'inProgress' },
      });
      notify('item/completed', {
        threadId: session,
        turnId: turn,
        item: {
          id: tool,
          type: 'commandExecution',
          command,
          status: 'completed',
          exitCode: 0,
          aggregatedOutput: output,
        },
      });
    } else {
      assistant([{ type: 'tool_use', id: tool, name: 'Bash', input: { command } }]);
      emit({
        type: 'user',
        uuid: randomUUID(),
        session_id: session,
        parent_tool_use_id: null,
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tool, content: output }] },
      });
    }
    let text = `## 完成\n\n**页面已保存** · [打开页面](mininotion://page/${page.id})\n\n| 项目 | 状态 |\n| --- | --- |\n| CLI | 完成 |`;
    if (profile === 'ui') {
      const file = cli(
        'file',
        'create',
        root,
        '--name',
        'summary.md',
        '--content',
        '项目摘要：由 Agent 通过 CLI 创建。',
      );
      text = `## 已整理好\n\n已保存 **项目页面** 和摘要文件。\n\n- [项目页面](mininotion://page/${page.id})\n- [摘要文件](mininotion://space/${root}/file/${file.id})\n\n| 内容 | 状态 |\n| --- | --- |\n| 页面 | 已保存 |\n| 文件 | 已保存 |\n\n\`\`\`text\n可回读、可继续编辑\n\`\`\``;
    }
    if (codex)
      notify('item/completed', {
        threadId: session,
        turnId: turn,
        item: { id: `answer-${sequence++}`, type: 'agentMessage', text },
      });
    else assistant([{ type: 'text', text }]);
    finish(undefined, false, text);
  } catch (error) {
    finish(String(error.message));
  }
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (codex) {
    const reply = (result) => emit({ id: message.id, result });
    if (message.method === 'initialize') return reply({ userAgent: 'mininotion-fixture' });
    if (message.method === 'model/list')
      return reply({
        data: [{ id: 'fixture', model: 'fixture', displayName: 'Fixture', isDefault: true }],
        nextCursor: null,
      });
    if (message.method === 'skills/list') return reply({ data: [] });
    if (['thread/start', 'thread/resume', 'thread/fork'].includes(message.method))
      return reply({ thread: { id: session }, model: 'fixture' });
    if (message.method === 'turn/start') {
      turn = randomUUID();
      reply({ turn: { id: turn, status: 'inProgress' } });
      notify('turn/started', { threadId: session, turn: { id: turn, status: 'inProgress' } });
      setImmediate(() => work((message.params.input || []).map((item) => item.text || '').join('\n')));
      return;
    }
    if (message.method === 'turn/interrupt') {
      reply({});
      finish(undefined, true);
      return;
    }
    if (message.id !== undefined) reply({});
  } else if (message.type === 'control_request') {
    const subtype = message.request.subtype;
    emit({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: message.request_id,
        response:
          subtype === 'initialize'
            ? {
                commands: [],
                models: [],
                agents: [],
                output_style: 'default',
                available_output_styles: ['default'],
                account: {},
              }
            : {},
      },
    });
    if (subtype === 'initialize')
      emit({
        type: 'system',
        subtype: 'init',
        uuid: randomUUID(),
        session_id: session,
        tools: [],
        model: 'fixture',
        cwd: process.cwd(),
        permissionMode: 'acceptEdits',
        slash_commands: [],
      });
    if (subtype === 'interrupt') finish(undefined, true);
  } else if (message.type === 'user') {
    activeInput = message.uuid;
    work((message.message.content || []).map((item) => item.text || '').join('\n'));
  }
});
