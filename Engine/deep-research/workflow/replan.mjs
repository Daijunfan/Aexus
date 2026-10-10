/** Preserve concurrent branch requests without inflating the persisted plan state. */
const PER_SUGGESTION = 1200;
const TOTAL = 4000;

export function appendReplanReason(state, suggestion) {
  const text = typeof suggestion === 'string' ? suggestion.trim().slice(0, PER_SUGGESTION) : '';
  if (!text) return;
  const prior = String(state.replanReason || '').trim().slice(0, TOTAL);
  if (prior.split('\n\n').includes(text)) return;
  const remaining = TOTAL - prior.length - (prior ? 2 : 0);
  if (remaining <= 0) return;
  state.replanReason = prior ? prior + '\n\n' + text.slice(0, remaining) : text;
}
