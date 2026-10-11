import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAssistant } from '../src/plugin/assistant';
import { assistantCommands } from '../src/core/assistantCommands';

test('selection assistant uses declared host operations with the exact target and retry key', async () => {
  const calls: any[] = [];
  const host = async (request: any) => { calls.push(request); return { sent: true, messageId: 'task-1' }; };
  assert.equal(assistantCommands.length, 3);
  assert.deepEqual(await requestAssistant(host, 'assistant.send', { employeeId: 'writer', text: 'Explain selection', clientMessageId: 'one-click' }), { sent: true, messageId: 'task-1' });
  assert.deepEqual(calls, [{ cmd: 'session.send', args: { employee: 'writer', text: 'Explain selection', clientMessageId: 'one-click' } }]);
  await assert.rejects(requestAssistant(undefined, 'assistant.list', {}), /Agents Company/);
  await assert.rejects(requestAssistant(host, 'assistant.send', { employeeId: 'writer', text: '', clientMessageId: 'empty' }), /不能为空/);
  assert.equal(calls.length, 1);
});

test('selection assistant reads only the exact outbound turn, excluding thinking and later messages', async () => {
  const calls: any[] = [];
  const host = async (request: any) => {
    calls.push(request);
    if (request.cmd === 'session.info') return { busy: true, currentTask: { messageId: 'later' } };
    return { shown: [
      { role: 'assistant', blocks: [{ kind: 'text', text: 'old' }] },
      { role: 'user', outbound: { taskId: 'mine' } },
      { role: 'assistant', blocks: [{ kind: 'thinking', text: 'private' }, { kind: 'text', text: 'my answer' }] },
      { role: 'user', outbound: { taskId: 'later' } },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'unrelated' }] },
    ] };
  };
  const response = await requestAssistant(host, 'assistant.read', { employeeId: 'writer', messageId: 'mine' });
  assert.equal(response.text, 'my answer'); assert.equal(response.done, true);
  assert.ok(calls.every(c => c.args.employee === 'writer'));
  await assert.rejects(requestAssistant(host, 'assistant.read', { employeeId: 'writer', messageId: 'missing' }), /当前会话/);
});

test('selection assistant lists display metadata without leaking credentials or starting sessions', async () => {
  const calls: any[] = [];
  const response = await requestAssistant(async request => {
    calls.push(request);
    if (request.cmd === 'session.list') return { sessions: [{ id: 'writer', cwd: '/work', token: 'private' }] };
    return [{ id: 'writer', title: 'Writer', engine: 'codex', kind: 'worker', busy: false, initialization: { status: 'ready' } }, { id: 'chat', kind: 'chatter' }];
  }, 'assistant.list', {});
  assert.deepEqual(response, [{ id: 'writer', title: 'Writer', engine: 'codex', cwd: '/work', busy: false, ready: true }]);
  assert.deepEqual(calls, [{ cmd: 'session.status' }, { cmd: 'session.list' }]);
});
