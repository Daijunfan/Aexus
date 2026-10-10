import test from 'node:test';
import assert from 'node:assert/strict';
import {create, run} from '../runtime.mjs';
import {selectDispatches} from './scheduler.mjs';

const worker = (id, role = 'researcher') => ({id, role, active: true, engine: 'pi', managerIds: []});
const node = (id, dependencies = [], extra = {}) => ({
  id, kind: 'search', role: 'researcher', active: true, status: 'pending',
  dependencies, payload: {query: id}, ...extra
});
const stateFor = (nodes, workers, concurrency = 2) => {
  const state = create({topic: 'Worker reservation and DAG progress', team: {maxConcurrency: concurrency}});
  state.graph = {version: 1, nodes};
  state.workers = workers;
  state.phase = 'research';
  return state;
};

test('newly unlocked descendants advance before unrelated root backlog', () => {
  const state = stateFor([
    node('root-one'), node('root-two'), node('parent', [], {status: 'completed'}),
    node('followup', ['parent'])
  ], [worker('one')], 1);
  assert.deepEqual(selectDispatches(state, new Map()).map(item => item.node.id), ['followup']);
  // A recoverable accepted task always wins over a newly unlocked task.
  state.tasks['root-one'] = {status: 'prepared', employeeId: 'one'};
  assert.deepEqual(selectDispatches(state, new Map()).map(item => item.node.id), ['root-one']);
});

test('an accepted or prepared task reserves its original employee before fresh work', () => {
  const fresh = node('fresh'), resumed = node('resumed', [], {taskKey: 'resumed-v1', status: 'running'});
  const state = stateFor([fresh, resumed], [worker('one'), worker('two')]);
  state.tasks['resumed-v1'] = {status: 'prepared', employeeId: 'one'};
  const before = JSON.stringify(state);
  const chosen = selectDispatches(state, new Map());
  assert.deepEqual(chosen.map(({node, workerId}) => [node.id, workerId]), [
    ['resumed', 'one'], ['fresh', 'two']
  ]);
  assert.equal(JSON.stringify(state), before, 'Selection cannot mutate persisted workflow state');
});

test('employee reservations respect running work, leases, dependencies and concurrency budget', () => {
  const busy = node('busy', [], {status: 'running'});
  const fresh = node('fresh');
  const blocked = node('blocked', ['busy']);
  const ignored = node('archived', [], {active: false});
  const state = stateFor([busy, fresh, blocked, ignored], [worker('one'), worker('two'), worker('three')]);
  const inFlight = new Map([['busy', {workerId: 'one'}]]);
  assert.deepEqual(selectDispatches(state, inFlight, new Set(['two'])).map(({node, workerId}) => [node.id, workerId]), [
    ['fresh', 'three']
  ]);
  assert.deepEqual(selectDispatches(state, inFlight, new Set(['two', 'three'])), []);
  state.input.team.maxConcurrency = 1;
  assert.deepEqual(selectDispatches(state, inFlight), []);
});

test('an unavailable pinned worker does not occupy capacity needed by another branch', () => {
  const reserved = node('reserved', [], {taskKey: 'reserved-v1', status: 'running'});
  const unrelated = node('unrelated');
  const state = stateFor([reserved, unrelated], [worker('one'), worker('two')]);
  state.tasks['reserved-v1'] = {status: 'prepared', employeeId: 'one'};
  assert.deepEqual(selectDispatches(state, new Map(), new Set(['one'])).map(({node, workerId}) => [node.id, workerId]), [
    ['unrelated', 'two']
  ]);
});

test('an independent reviewer cannot be assigned to the report author', () => {
  const review = node('review', [], {kind: 'review', role: 'coordinator'});
  const state = stateFor([review], [worker('author', 'coordinator'), worker('reviewer', 'coordinator')]);
  state.reportWorkerIds = ['author'];
  assert.deepEqual(selectDispatches(state, new Map()).map(({node, workerId}) => [node.id, workerId]), [
    ['review', 'reviewer']
  ]);
});

test('review without any independent author reports the actual blocker', () => {
  const review = node('review', [], {kind: 'review', role: 'coordinator'});
  const state = stateFor([review], [worker('author', 'coordinator')]);
  state.reportWorkerIds = ['author'];
  assert.throws(() => selectDispatches(state, new Map()), /没有独立可用的研究审查员工/);
});

test('a missing active task role surfaces a specific scheduling blocker', () => {
  const state = stateFor([node('missing-role')], [worker('writer', 'writer')]);
  assert.throws(() => selectDispatches(state, new Map()), /缺少活跃的 researcher 员工: missing-role/);
});

test('a missing previous employee produces an actionable recovery failure', () => {
  const resumed = node('resumed', [], {taskKey: 'resumed-v1', status: 'running'});
  const state = stateFor([resumed], [worker('replacement')]);
  state.tasks['resumed-v1'] = {status: 'prepared', employeeId: 'retired'};
  assert.throws(() => selectDispatches(state, new Map()), /恢复任务的所属员工已退出当前团队.*retired/);
});

test('real runtime dispatch binds concurrent native sends to distinct reserved employees', async () => {
  const fresh = node('fresh', [], {taskKey: 'fresh-v1'});
  const resumed = node('resumed', [], {taskKey: 'resumed-v1', status: 'running'});
  const state = stateFor([fresh, resumed], [worker('one'), worker('two')]);
  const existingPayload = {taskId: 'wf_owner/resumed-v1', kind: 'search', payload: {sources: [], query: 'resumed'}};
  state.tasks['resumed-v1'] = {
    taskId: existingPayload.taskId, role: 'researcher', label: 'search',
    employeeId: 'one', status: 'prepared', inputSourceIds: [],
    prompt: '[AEXUS_DEEP_RESEARCH_TASK]\n\n' + JSON.stringify(existingPayload)
  };
  const controller = new AbortController(), sent = [], busy = new Set();
  const context = {
    id: 'wf_owner',
    signal: controller.signal,
    checkpoint: async () => {},
    client: {invoke: async (command, args) => {
      if (command === 'session.status') return [{busy: busy.has(args.employee)}];
      if (command === 'session.send') {
        const instruction = JSON.parse(args.text.split('\n\n')[1]);
        busy.add(args.employee);
        sent.push({employeeId: args.employee, taskId: instruction.taskId});
        if (sent.length === 2) controller.abort(Error('Both native sends were reserved'));
        return {messageId: instruction.taskId};
      }
      throw Error('Unexpected call: ' + command);
    }}
  };
  await assert.rejects(run(state, context), /Both native sends were reserved/);
  assert.deepEqual(sent, [
    {employeeId: 'one', taskId: 'wf_owner/resumed-v1'},
    {employeeId: 'two', taskId: 'wf_owner/fresh-v1'}
  ]);
});

test('large mixed DAG reserves unique active employees and never schedules unfinished dependencies', () => {
  const completed = Array.from({length: 32}, (_, i) => node('done-' + i, [], {status: 'completed'}));
  const runnable = Array.from({length: 512}, (_, i) => node('branch-' + i, ['done-' + (i % 32)]));
  const dependent = Array.from({length: 48}, (_, i) => node('blocked-' + i, ['branch-' + i]));
  const workers = Array.from({length: 64}, (_, i) => worker('researcher-' + i));
  const state = stateFor([...runnable, ...dependent, ...completed], workers, 24);
  const running = new Map([['branch-0', {workerId: 'researcher-0'}],
    ['branch-1', {workerId: 'researcher-1'}]]);
  const leases = new Set(['researcher-2', 'researcher-3']);
  state.tasks['branch-8'] = {status: 'prepared', employeeId: 'researcher-8'};
  state.tasks['branch-9'] = {status: 'running', employeeId: 'researcher-9'};
  const before = JSON.stringify(state);
  const choices = selectDispatches(state, running, leases);
  assert.equal(choices.length, 22);
  assert.deepEqual(choices.slice(0, 2).map(item => item.node.id), ['branch-8', 'branch-9']);
  assert.equal(new Set(choices.map(item => item.workerId)).size, 22);
  const notAvailable = new Set(['researcher-0','researcher-1','researcher-2','researcher-3']);
  assert.ok(choices.every(({node: item,workerId}) =>
    !notAvailable.has(workerId) && item.dependencies.every(dep =>
      state.graph.nodes.find(node => node.id === dep)?.status === 'completed')));
  assert.ok(choices.every(item => !running.has(item.node.id)));
  assert.equal(JSON.stringify(state), before);
});
