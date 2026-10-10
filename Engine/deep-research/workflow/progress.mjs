/** Small, truthful queue counters derived from the checkpoint DAG. */
export function executionQueue(state) {
  const nodes = (state.graph?.nodes || []).filter(node => node.active !== false);
  const completed = new Set(nodes.filter(node => node.status === 'completed').map(node => node.id));
  let ready = 0, waitingDependencies = 0;
  if (state.phase === 'research') for (const node of nodes) {
    if (node.status !== 'pending') continue;
    if (node.dependencies.every(id => completed.has(id))) ready++;
    else waitingDependencies++;
  }
  const approvals = Object.values(state.tasks || {}).filter(task => task.status === 'approval').length;
  return {ready, waitingDependencies, approvals};
}
