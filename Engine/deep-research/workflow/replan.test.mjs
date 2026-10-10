import test from 'node:test';
import assert from 'node:assert/strict';
import {appendReplanReason} from './replan.mjs';

test('parallel research branches contribute distinct replanning instructions', () => {
  const state = {};
  appendReplanReason(state, 'Review changed regulation');
  appendReplanReason(state, 'Find missing safety evidence');
  appendReplanReason(state, 'Review changed regulation');
  assert.equal(state.replanReason, 'Review changed regulation\n\nFind missing safety evidence');
});

test('replanning suggestions are bounded without losing previous checkpoint instructions', () => {
  const state = {replanReason: 'Original checkpoint instruction'};
  appendReplanReason(state, '  x'.repeat(5000));
  assert.ok(state.replanReason.startsWith('Original checkpoint instruction\n\n'));
  assert.ok(state.replanReason.length <= 4000);
  const saved = state.replanReason;
  appendReplanReason(state, '');
  appendReplanReason(state, null);
  assert.equal(state.replanReason, saved);
  state.replanReason = 'prior'.repeat(800);
  appendReplanReason(state, 'new');
  assert.equal(state.replanReason, 'prior'.repeat(800));
});
