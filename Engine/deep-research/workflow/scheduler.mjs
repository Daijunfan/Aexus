/** Worker-aware dispatch over the domain DAG. No Infra calls or persistent state. */
import {readyNodes} from '../graph.mjs';

/**
 * Reserve actual employees before starting concurrent work. In-flight native
 * tasks retain their owner on restart, so recovered work must claim its owner
 * before unassigned tasks can occupy that conversation.
 */
export function selectDispatches(state, running, leased = new Set()) {
  const slots = Math.max(0, state.input.team.maxConcurrency - running.size);
  if (!slots) return [];

  const unavailable = new Set(leased);
  for (const item of running.values()) unavailable.add(item.workerId);
  const active = new Map(state.workers.filter(worker => worker.active !== false).map(worker => [worker.id, worker]));
  const idle = new Map([...active].filter(([id]) => !unavailable.has(id)));
  const activeRoles = new Set([...active.values()].map(worker => worker.role));
  const byRole = new Map();
  for (const worker of idle.values()) {
    if (!byRole.has(worker.role)) byRole.set(worker.role, []);
    byRole.get(worker.role).push(worker);
  }

  const pinned = [], unlockedDescendants = [], rootTasks = [];
  for (const node of readyNodes(state)) {
    if (running.has(node.id)) continue;
    const base = node.taskKey || node.id;
    const attempt = state.taskAttempts?.[base] || 0;
    const key = base + (attempt ? '-retry-' + attempt : '');
    const owner = (state.tasks?.[key] || state.tasks?.[key + '-format-fix'])?.employeeId;
    (owner ? pinned : node.dependencies.length ? unlockedDescendants : rootTasks).push({node, owner});
  }

  // Stable plan order within each priority: recovered work, unlocked
  // descendants, then unrelated roots. Avoid sorting every dispatch tick.
  const selected = [];
  const reportAuthors = new Set(state.reportWorkerIds || []);
  for (const {node, owner} of [...pinned, ...unlockedDescendants, ...rootTasks]) {
    if (selected.length >= slots) break;
    if (!activeRoles.has(node.role)) throw Error('研究任务缺少活跃的 ' + node.role + ' 员工: ' + node.id);
    if (owner && (!active.has(owner) || active.get(owner).role !== node.role)) {
      throw Error('恢复任务的所属员工已退出当前团队，请保留原员工或使用新任务 ID: ' + owner);
    }
    if (node.kind === 'review' && (owner ? reportAuthors.has(owner) : ![...active.values()].some(worker => worker.role === node.role && !reportAuthors.has(worker.id)))) {
      throw Error('没有独立可用的研究审查员工: ' + node.role);
    }
    const eligible = worker => idle.has(worker.id) && (node.kind !== 'review' || !reportAuthors.has(worker.id));
    const worker = owner ? idle.get(owner) : (byRole.get(node.role) || []).find(eligible);
    if (!worker || worker.role !== node.role || !eligible(worker)) continue;
    idle.delete(worker.id);
    selected.push({node, workerId: worker.id});
  }
  return selected;
}
