import test from 'node:test';
import assert from 'node:assert/strict';
import { engines } from '../src/backend/agent/engine.ts';

const claude = engines.claude;
const codex = engines.codex;

test('claude init carries the session id', () => {
  const events = claude.parse(
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 'abc-1', tools: ['Bash'] }),
  );
  assert.deepEqual(events, [{ type: 'session', id: 'abc-1' }]);
});

test('claude assistant text and tool_use become text and activity events', () => {
  assert.deepEqual(
    claude.parse(
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '你好' }] } }),
    ),
    [{ type: 'text', text: '你好' }],
  );
  const [activity] = claude.parse(
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] },
    }),
  );
  assert.equal(activity.type, 'activity');
  assert.equal((activity as any).name, 'Bash');
  assert.equal((activity as any).status, 'running');
  assert.equal((activity as any).id, 't1');
});

test('claude tool_result completes an activity and records errors', () => {
  const [done] = claude.parse(
    JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] },
    }),
  );
  assert.equal((done as any).status, 'done');
  assert.equal((done as any).id, 't1');
  const [failed] = claude.parse(
    JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'boom', is_error: true }] },
    }),
  );
  assert.equal((failed as any).status, 'error');
});

test('claude result reports usage and errors', () => {
  const events = claude.parse(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      session_id: 'abc-1',
      is_error: false,
      num_turns: 3,
      total_cost_usd: 0.02,
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  );
  assert.ok(events.some((event) => event.type === 'session' && event.id === 'abc-1'));
  assert.ok(events.some((event) => event.type === 'result' && event.isError === false));
  const usage: any = events.find((event) => event.type === 'usage');
  assert.equal(usage.input, 10);
  assert.equal(usage.output, 5);
  assert.equal(usage.turns, 3);
  assert.equal(usage.costUsd, 0.02);
});

test('codex thread and item events map onto the same vocabulary', () => {
  assert.deepEqual(codex.parse(JSON.stringify({ type: 'thread.started', thread_id: 'th-1' })), [
    { type: 'session', id: 'th-1' },
  ]);
  const [activity] = codex.parse(
    JSON.stringify({
      type: 'item.started',
      item: { id: 'i1', type: 'command_execution', command: 'mininotion page list' },
    }),
  );
  assert.equal((activity as any).name, 'shell');
  assert.equal((activity as any).status, 'running');
  const [done] = codex.parse(
    JSON.stringify({
      type: 'item.completed',
      item: { id: 'i1', type: 'command_execution', command: 'mininotion page list', status: 'completed' },
    }),
  );
  assert.equal((done as any).status, 'done');
  const [message] = codex.parse(
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '完成' } }),
  );
  assert.deepEqual(message, { type: 'text', text: '完成' });
});

test('codex turn completion yields usage and a result', () => {
  const events = codex.parse(
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 7, output_tokens: 2 } }),
  );
  assert.ok(events.some((event) => event.type === 'result'));
  const usage: any = events.find((event) => event.type === 'usage');
  assert.equal(usage.input, 7);
});

test('malformed and unknown lines never throw', () => {
  for (const line of ['not json', '{}', '{"type":"unknown.thing"}', '{"type":"assistant"}', ''])
    assert.doesNotThrow(() => claude.parse(line));
  for (const line of ['[', 'null', '{"type":"item.completed"}']) assert.doesNotThrow(() => codex.parse(line));
  assert.deepEqual(claude.parse('not json'), []);
});

test('claude args scope the agent to the space and withhold file writes', () => {
  const args = claude.args({
    prompt: '整理页面',
    systemPrompt: '你是助手',
    spaceDir: '/data/spaces/p1',
    cwd: '/data/spaces/p1',
  });
  assert.ok(args.includes('--output-format'));
  assert.ok(args.includes('stream-json'));
  assert.ok(args.includes('--append-system-prompt'));
  const tools = args[args.indexOf('--allowed-tools') + 1];
  assert.ok(!tools.includes('Write'));
  assert.ok(!tools.includes('Edit'));
  assert.ok(tools.includes('Bash'));
  assert.ok(args.includes('--add-dir'));
});

test('claude resumes an existing session and codex resumes a thread', () => {
  const claudeArgs = claude.args({
    prompt: 'p',
    sessionId: 's1',
    systemPrompt: 's',
    spaceDir: '/d',
    cwd: '/d',
  });
  assert.deepEqual(claudeArgs.slice(-2), ['--resume', 's1']);
  const codexArgs = codex.args({
    prompt: 'p',
    sessionId: 't1',
    systemPrompt: 's',
    spaceDir: '/d',
    cwd: '/d',
  });
  assert.ok(codexArgs.includes('resume'));
  assert.ok(codexArgs.includes('t1'));
});

test('Codex recoverable item errors are notices; only turn failure is fatal', () => {
  const [notice] = codex.parse(
    JSON.stringify({
      type: 'item.completed',
      item: {
        id: 'warning',
        type: 'error',
        message: 'Model metadata not found. Defaulting to fallback metadata.',
      },
    }),
  );
  assert.equal(notice.type, 'activity');
  assert.equal((notice as any).name, 'notice');
  assert.deepEqual(
    codex.parse(JSON.stringify({ type: 'turn.failed', error: { message: 'Authentication failed' } })),
    [{ type: 'error', message: 'Authentication failed' }],
  );
});

test('Codex receives workspace instructions and every image on both initial and resumed turns', () => {
  for (const sessionId of [undefined, 'existing-thread']) {
    const args = codex.args({
      prompt: '',
      sessionId,
      systemPrompt: 'Use the exact CLI',
      images: ['/a.png', '/b.png'],
      spaceDir: '/space',
      cwd: '/space',
    });
    assert.match(args.at(-1)!, /Use the exact CLI/);
    assert.equal(args.filter((arg) => arg === '--image').length, 2);
    assert.ok(args.includes('/a.png') && args.includes('/b.png'));
    assert.ok(args.includes('allow_login_shell=false'));
  }
});
