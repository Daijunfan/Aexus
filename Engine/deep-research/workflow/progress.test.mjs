import test from 'node:test';
import assert from 'node:assert/strict';
import {create, describe} from '../runtime.mjs';
import {applyPlan} from '../graph.mjs';

test('public progress separates runnable work, dependent work and native approvals', () => {
  const state = create({topic: 'Describe the actual research queue'});
  applyPlan(state, {nodes: [
    {id: 'a', kind: 'search', role: 'researcher', dependencies: []},
    {id: 'b', kind: 'search', role: 'researcher', dependencies: ['a']},
    {id: 'c', kind: 'verify', role: 'verifier', dependencies: ['b']},
    {id: 'write', kind: 'write', role: 'writer', dependencies: ['c']},
    {id: 'review', kind: 'review', role: 'coordinator', dependencies: ['write']}
  ]}, 'Queue projection');
  state.phase = 'research';
  state.tasks = {native: {status: 'approval'}};
  assert.deepEqual(describe(state).progress.queue, {ready: 1, waitingDependencies: 4, approvals: 1});
  state.graph.nodes[0].status = 'completed';
  assert.deepEqual(describe(state).progress.queue, {ready: 1, waitingDependencies: 3, approvals: 1});
  state.graph.nodes[1].status = 'running';
  assert.deepEqual(describe(state).progress.queue, {ready: 0, waitingDependencies: 3, approvals: 1});
});

test('planning and completed work do not report runnable tasks', () => {
  const state = create({topic: 'Avoid an actionable queue before plan approval'});
  applyPlan(state, {nodes: [
    {id: 'write', kind: 'write', dependencies: []},
    {id: 'review', kind: 'review', dependencies: ['write']}
  ]}, 'Draft');
  state.phase = 'planning';
  assert.deepEqual(describe(state).progress.queue, {ready: 0, waitingDependencies: 0, approvals: 0});
  state.phase = 'complete';
  state.graph.nodes.forEach(node => { node.status = 'completed'; });
  assert.deepEqual(describe(state).progress.queue, {ready: 0, waitingDependencies: 0, approvals: 0});
});

test('queue projection keeps persisted DAG and user data immutable', () => {
  const state = create({topic: 'No persistence duplication'});
  state.graph.nodes = [{id: 'old', status: 'pending', active: false, dependencies: []}];
  const snapshot = JSON.stringify(state);
  assert.deepEqual(describe(state).progress.queue, {ready: 0, waitingDependencies: 0, approvals: 0});
  assert.equal(JSON.stringify(state), snapshot);
});
