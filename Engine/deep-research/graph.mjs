/** Pure plan validation, revision history and DAG scheduling. */
export const TASK_KINDS = ['search', 'verify', 'synthesize', 'write', 'review'];

const sameWork = (a, b) => JSON.stringify([a.kind, a.role, a.objective, a.dependencies, a.payload]) === JSON.stringify([b.kind, b.role, b.objective, b.dependencies, b.payload]);

export function normalizeNodes(nodes, maxTasks = 128) {
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > maxTasks) throw Error('计划必须包含 1-' + maxTasks + ' 个任务');
  const normalized = nodes.map((node, i) => {
    if (!node || typeof node !== 'object' || !TASK_KINDS.includes(node.kind)) throw Error('计划任务类型无效: ' + node?.kind);
    const id = String(node.id || 'task-' + i);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)) throw Error('计划任务 ID 无效: ' + id);
    const dependencies = node.dependencies ?? node.dependsOn ?? [];
    if (!Array.isArray(dependencies) || dependencies.some(id => typeof id !== 'string')) throw Error(id + ' 的依赖必须是 ID 数组');
    return {
      id, kind: node.kind, label: String(node.label || node.query || node.kind),
      role: String(node.role || ({ search: 'researcher', verify: 'verifier', synthesize: 'synthesizer', write: 'writer', review: 'coordinator' }[node.kind])),
      objective: String(node.objective || node.description || node.query || node.payload?.query || node.label || ''),
      dependencies: [...new Set(dependencies)],
      payload: node.payload && typeof node.payload === 'object' ? node.payload : (node.query ? { query: node.query } : {}),
      dimensionId: node.dimensionId || null,
      weight: typeof node.weight === 'number' && node.weight > 0 ? node.weight : 1,
      status: 'pending', active: true
    };
  });
  const byId = new Map(normalized.map(node => [node.id, node]));
  if (byId.size !== normalized.length) throw Error('计划任务 ID 不能重复');
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw Error('研究计划存在循环依赖: ' + id);
    const node = byId.get(id);
    if (!node) throw Error('研究计划引用了不存在的任务: ' + id);
    visiting.add(id);
    for (const dependency of node.dependencies) visit(dependency);
    visiting.delete(id); visited.add(id);
  }
  for (const node of normalized) visit(node.id);
  if (normalized.filter(node => node.kind === 'write').length !== 1 || normalized.filter(node => node.kind === 'review').length !== 1) throw Error('每版计划必须有一个最终报告撰写和一个独立审查任务');
  // Every final review must descend from a report; an early review cannot approve a later draft.
  const ancestors = id => {
    const all = new Set();
    const collect = key => { for (const dep of byId.get(key).dependencies) if (!all.has(dep)) { all.add(dep); collect(dep); } };
    collect(id); return [...all].map(key => byId.get(key));
  };
  for (const node of normalized.filter(node => node.kind === 'review')) {
    if (!ancestors(node.id).some(parent => parent.kind === 'write')) throw Error('审查任务必须依赖报告撰写任务');
  }
  const report = normalized.find(node => node.kind === 'write');
  const reportInputs = new Set(ancestors(report.id).map(node => node.id));
  const missing = normalized.filter(node => !['write', 'review'].includes(node.kind) && !reportInputs.has(node.id));
  if (missing.length) throw Error('最终报告依赖必须覆盖全部研究任务: ' + missing.map(node => node.id).join(', '));
  return normalized;
}

/** Compatibility for old dimension-only plans; new planners choose their own topology. */
export function nodesFromDimensions(dimensions) {
  const searches = dimensions.map(d => ({ id: 'research-' + d.id, kind: 'search', role: 'researcher', label: d.query, dimensionId: d.id, payload: { query: d.query }, dependencies: [] }));
  return [...searches,
    { id: 'verify-evidence', kind: 'verify', dependencies: searches.map(n => n.id) },
    { id: 'knowledge-synthesis', kind: 'synthesize', dependencies: ['verify-evidence'] },
    { id: 'report-writing', kind: 'write', dependencies: ['knowledge-synthesis'] },
    { id: 'quality-review', kind: 'review', dependencies: ['report-writing'] }
  ];
}

export function applyPlan(state, plan, reason) {
  const nodes = normalizeNodes(plan.nodes || nodesFromDimensions(plan.dimensions), state.input.maxTasks ?? 128);
  const previous = state.graph?.nodes ?? [];
  const oldById = new Map(previous.filter(n => n.active !== false).map(n => [n.id, n]));
  const version = (state.graph?.version ?? 0) + 1;
  const added = [], retained = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i], old = oldById.get(node.id);
    if (old && sameWork(old, node)) {
      nodes[i] = { ...old, label: node.label, active: true };
      retained.push(node.id);
    } else {
      if (old && ['running', 'completed'].includes(old.status)) throw Error('已开始的任务不能改写，请使用新 ID: ' + node.id);
      nodes[i].taskKey = node.id + '-v' + version;
      nodes[i].planVersion = version;
      added.push(node.id);
    }
  }
  const nextIds = new Set(nodes.map(n => n.id));
  const removed = previous.filter(n => n.active !== false && !nextIds.has(n.id));
  if (removed.some(n => n.status === 'running')) throw Error('重规划必须保留在途任务');
  const archived = previous.filter(n => n.active === false || !nextIds.has(n.id)).map(n => ({ ...n, active: false, status: n.status === 'completed' ? 'completed' : 'superseded' }));
  state.graph = { version, nodes: [...nodes, ...archived] };
  state.plan = { ...plan, version, nodes };
  state.dimensions = plan.dimensions || [];
  state.planRevisions ??= [];
  state.planRevisions.push({ version, at: Date.now(), reason: String(reason || '初始研究计划'), addedNodeIds: added, retainedNodeIds: retained, removedNodeIds: removed.map(n => n.id) });
  state.planApproved = Boolean(state.input.autoApprove);
  state.visualization.timeline.push({ timestamp: Date.now(), type: 'plan', agent: 'coordinator', description: reason || '研究计划已生成', data: { version, tasks: nodes.length } });
  return state;
}

export function planTeam(plan, budget) {
  let team = plan.team;
  if (!team?.length) {
    // Legacy plans request only the capacity needed by their actual tasks.
    const counts = new Map();
    for (const node of plan.nodes || nodesFromDimensions(plan.dimensions)) {
      const role = node.role || ({ search: 'researcher', verify: 'verifier', synthesize: 'synthesizer', write: 'writer', review: 'coordinator' }[node.kind]);
      counts.set(role, (counts.get(role) || 0) + 1);
    }
    team = [{ id: 'coordinator', role: 'coordinator', managementRole: 'manager', label: '研究协调员' }];
    for (const [role, count] of counts) if (role !== 'coordinator') for (let i = 0; i < Math.min(count, budget.maxConcurrency); i++) team.push({ id: role + '-' + i, role, label: role, managerIds: ['coordinator'] });
  }
  const normalized = team.map((spec, i) => ({ id: String(spec.id || spec.role + '-' + i), role: String(spec.role || 'researcher'), label: String(spec.label || spec.role || '研究员'), managementRole: spec.managementRole === 'manager' || spec.role === 'coordinator' ? 'manager' : 'employee', managerIds: spec.managerIds || [] }));
  if (!normalized.some(s => s.role === 'coordinator')) normalized.unshift({ id: 'coordinator', role: 'coordinator', label: '研究协调员', managementRole: 'manager', managerIds: [] });
  if (normalized.length > budget.maxWorkers || normalized.filter(s => s.managementRole === 'manager').length > budget.maxManagers) throw Error('规划团队超过员工或 Manager 预算');
  const byId = new Map(normalized.map(s => [s.id, s]));
  if (byId.size !== normalized.length) throw Error('员工配置 ID 不能重复');
  for (const spec of normalized) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(spec.id) || !Array.isArray(spec.managerIds)) throw Error('员工配置无效');
    for (const id of spec.managerIds) if (id === spec.id || byId.get(id)?.managementRole !== 'manager') throw Error('员工引用了无效 Manager: ' + id);
  }
  const visiting = new Set(), visited = new Set();
  const visit = id => {
    if (visiting.has(id)) throw Error('Manager 关系不能形成循环');
    if (visited.has(id)) return;
    visiting.add(id); byId.get(id).managerIds.forEach(visit); visiting.delete(id); visited.add(id);
  };
  normalized.forEach(spec => visit(spec.id));
  const roles = new Set(normalized.map(s => s.role));
  for (const node of plan.nodes || nodesFromDimensions(plan.dimensions)) if (!roles.has(node.role || ({ search: 'researcher', verify: 'verifier', synthesize: 'synthesizer', write: 'writer', review: 'coordinator' }[node.kind]))) throw Error('计划任务没有对应员工: ' + node.role);
  return normalized;
}

export function readyNodes(state) {
  const nodes = state.graph.nodes.filter(n => n.active !== false);
  const completed = new Set(nodes.filter(n => n.status === 'completed').map(n => n.id));
  return nodes.filter(n => ['pending', 'running'].includes(n.status) && n.dependencies.every(id => completed.has(id)));
}

export function graphView(state) {
  const nodes = (state.graph?.nodes ?? []).map(n => {
    const key = n.taskKey || n.id;
    const currentKey = key + (state.taskAttempts?.[key] ? '-retry-' + state.taskAttempts[key] : '');
    const task = state.tasks?.[currentKey + '-format-fix'] || state.tasks?.[currentKey];
    const employeeId = n.employeeId || task?.employeeId;
    const worker = state.workers?.find(w => w.id === employeeId);
    return { ...n, dependsOn: n.dependencies, employeeId, ownerId: employeeId, managerIds: n.managerIds || worker?.managerIds || [], taskId: task?.taskId, messageId: task?.receipt?.messageId, ...(n.kind === 'review' && task?.result ? { result: task.result } : {}) };
  });
  return { version: state.graph?.version ?? 0, nodes, edges: nodes.filter(n => n.active !== false).flatMap(n => n.dependencies.map(from => ({ from, to: n.id }))) };
}

export function planProgress(state) {
  const nodes = (state.graph?.nodes ?? []).filter(n => n.active !== false);
  const completed = nodes.filter(n => n.status === 'completed').length;
  const running = nodes.filter(n => n.status === 'running').length;
  const failed = nodes.filter(n => n.status === 'failed').length;
  const known = nodes.length > 0 && !['init', 'scouting', 'planning'].includes(state.phase);
  const totalWeight = nodes.reduce((sum, n) => sum + n.weight, 0);
  const doneWeight = nodes.filter(n => n.status === 'completed').reduce((sum, n) => sum + n.weight, 0);
  return {
    mode: known ? 'determinate' : 'indeterminate',
    percent: known ? (state.phase === 'complete' ? 100 : Math.min(99, Math.floor(doneWeight / totalWeight * 100))) : null,
    total: known ? nodes.length : null, totalTasks: known ? nodes.length : null,
    completed, completedTasks: completed, running, activeTasks: running, failed,
    planVersion: state.graph?.version ?? 0, scopeMayChange: state.phase !== 'complete'
  };
}
