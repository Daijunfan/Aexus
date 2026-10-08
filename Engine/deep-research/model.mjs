/** Research state and pure UI/control hooks. */
import { graphView, planProgress, applyPlan, nodesFromDimensions } from './graph.mjs';
import { wordCount } from './reports.mjs';

export const ENGINE_ID = 'deep-research';
export const ENGINE_VERSION = '2.0.0';
export const ENGINE_IDS = ['codex', 'claude', 'cline', 'pi'];
export const PHASES = { init: '初始化研究', scouting: '初步调研', planning: '规划调查路线', research: '执行研究计划', verification: '证据核验', synthesis: '知识整合', writing: '报告撰写', review: '质量审查', complete: '完成交付' };
const limit = (value, fallback, min, max, label) => {
  const number = value ?? fallback;
  if (!Number.isInteger(number) || number < min || number > max) throw Error(label + '限制 ' + min + '-' + max);
  return number;
};

export function create(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('研究输入必须是对象');
  const topic = String(input.topic || '').trim();
  if (topic.length < 10 || topic.length > 2000) throw Error('研究主题需要 10-2000 个字符');
  const scope = input.scope || 'comprehensive';
  if (!['quick', 'comprehensive', 'deep', 'academic'].includes(scope)) throw Error('研究范围无效');
  const languages = input.languages || ['zh-CN', 'en'];
  if (!Array.isArray(languages) || !languages.length || languages.some(l => typeof l !== 'string' || !l)) throw Error('至少指定一种语言');
  const materials = input.materials || [];
  if (!Array.isArray(materials) || materials.length > 10) throw Error('背景材料最多 10 份');
  for (const m of materials) if (!m || typeof m.name !== 'string' || typeof m.content !== 'string' || m.content.length > 200000) throw Error('材料需要 name 和 content，单份不超过 200,000 字符');
  let engines = input.engines;
  if (engines !== undefined) {
    if (!Array.isArray(engines) || !engines.length || engines.length > 5) throw Error('请选择 1-5 种已配置的原生 Agent');
    engines = engines.map(e => {
      const engine = typeof e === 'string' ? e : e.engine;
      if (!ENGINE_IDS.includes(engine)) throw Error('不支持的引擎: ' + engine);
      return { engine, ...(e.model ? { model: e.model } : {}) };
    });
  }
  const team = input.team || {};
  return {
    version: 2, phase: 'init',
    input: { topic, scope, maxSources: limit(input.maxSources, 80, 10, 1000, '来源预算'), languages, materials: materials.map(m => ({ ...m })), engines,
      autoApprove: input.autoApprove === true,
      team: { maxWorkers: limit(team.maxWorkers, 12, 2, 64, '员工预算'), maxManagers: limit(team.maxManagers, 4, 1, 16, 'Manager 预算'), maxConcurrency: limit(team.maxConcurrency, 4, 1, 32, '并发预算') },
      maxTasks: limit(input.maxTasks, 128, 4, 512, '任务预算'), maxReplans: limit(input.maxReplans, 3, 0, 20, '重规划预算') },
    engines, team: null, workers: [], tasks: {}, plan: null, planApproved: false, dimensions: [],
    graph: { version: 0, nodes: [] }, planRevisions: [], managerReviews: [], replans: 0,
    sources: [], findings: [], contradictions: [],
    knowledgeGraph: { entities: [], relationships: [] }, report: null, reportWorkerIds: [],
    visualization: { timeline: [] }, startedAt: Date.now()
  };
}

/** Additive migration preserves native worker/task identities and previously obtained evidence. */
export function upgradeState(state) {
  const needsEvidence = state.version !== 2 && state.phase !== 'complete' && state.sources.some(s => !s.acquisition);
  if (needsEvidence) {
    for (const source of state.sources) if (!source.acquisition) {
      source.acquisition = { status: 'discovered', excerpt: '', locator: '' }; source.verified = false;
    }
    state.historicalReport = state.report; state.report = null; state.review = null; state.synthesis = null;
    state.historicalFindings = state.findings; state.findings = [];
  }
  state.input.autoApprove ??= false;
  state.input.team ??= { maxWorkers: 12, maxManagers: 4, maxConcurrency: 4 };
  state.input.maxTasks ??= 128; state.input.maxReplans ??= 3;
  state.managerReviews ??= []; state.planRevisions ??= []; state.replans ??= 0; state.reportWorkerIds ??= [];
  state.visualization ??= { timeline: [] };
  state.visualization.timeline ??= [];
  state.graph ??= { version: 0, nodes: [] };
  if (!state.graph.nodes.length && state.plan && state.phase !== 'complete') {
    const approved = state.planApproved || state.phase !== 'planning';
    const team = state.workers.map((w, i) => ({ id: w.specId || w.role + '-' + i, role: w.role, label: w.label, managementRole: w.role === 'coordinator' ? 'manager' : 'employee', managerIds: [] }));
    applyPlan(state, { ...state.plan, team, nodes: nodesFromDimensions(state.dimensions || state.plan.dimensions || []) }, '恢复旧版研究计划');
    for (const node of state.graph.nodes) {
      if (state.tasks[node.id]?.status === 'completed') { node.status = 'completed'; node.taskKey = node.id; }
      if (node.kind === 'search' && state.dimensions.find(d => d.id === node.dimensionId)?.status === 'completed') node.status = 'completed';
      if (node.kind === 'verify' && state.sources.length && state.sources.every(s => s.verified)) node.status = 'completed';
      if (node.kind === 'synthesize' && state.synthesis) node.status = 'completed';
      if (node.kind === 'write' && state.report) node.status = 'completed';
      if (node.kind === 'review' && state.review?.verdict === 'pass') node.status = 'completed';
    }
    if (needsEvidence) for (const node of state.graph.nodes) {
      node.status = 'pending'; node.taskKey = node.id + '-evidence-v2';
      if (node.kind === 'search') node.payload = { ...node.payload, reacquire: true };
    }
    state.planApproved = approved;
  }
  state.version = 2;
  return state;
}

export function describe(originalState) {
  const state = upgradeState(structuredClone(originalState));
  const domains = new Set(state.sources.map(s => { try { return new URL(s.url).hostname; } catch { return ''; } }).filter(Boolean));
  const plan = state.plan ? Object.fromEntries(Object.entries(state.plan).filter(([key]) => key !== 'nodes')) : null;
  return {
    topic: state.input.topic, phase: state.phase, phaseLabel: PHASES[state.phase] || state.phase, scope: state.input.scope,
    progress: { ...planProgress(state), sources: { collected: state.sources.length, max: state.input.maxSources, verified: state.sources.filter(s => s.verified).length, read: state.sources.filter(s => s.acquisition?.status === 'read').length, domains: domains.size }, findings: state.findings.length, contradictions: state.contradictions.length, entities: state.knowledgeGraph.entities.length },
    workers: state.workers.map(w => ({ ...w, status: Object.values(state.tasks).some(t => t.employeeId === w.id && ['running', 'approval'].includes(t.status)) ? 'working' : 'idle' })),
    tasks: Object.entries(state.tasks).map(([id, t]) => ({ id, role: t.role, label: t.label, status: t.status, employeeId: t.employeeId, messageId: t.receipt?.messageId, error: t.error, startedAt: t.startedAt, finishedAt: t.finishedAt })),
    plan, dimensions: state.dimensions, graph: graphView(state), planRevisions: state.planRevisions,
    sources: state.sources, findingsDetails: state.findings, contradictions: state.contradictions,
    knowledgeGraph: state.knowledgeGraph, timeline: state.visualization.timeline,
    report: state.report ? { title: state.report.title, sections: state.report.sections.length, citations: state.report.citations.length, wordCount: wordCount(state.report) } : null,
    deliverable: state.report, review: state.review, attention: state.attention, managerReviews: state.managerReviews,
    startedAt: state.startedAt, duration: Date.now() - state.startedAt
  };
}

export function respond(state, answer) {
  if (!answer || typeof answer !== 'object') throw Error('响应参数无效');
  upgradeState(state);
  if (answer.action === 'approve-plan' && state.phase === 'planning' && state.plan) { state.planApproved = true; state.phase = 'research'; return state; }
  if (answer.action === 'approve-synthesis' && state.phase === 'synthesis') { state.synthesisApproved = true; state.phase = 'research'; return state; }
  if (answer.action === 'approve-report' && state.report) { state.review = { verdict: 'pass', issues: [], summary: '用户已审阅报告' }; state.phase = 'research'; return state; }
  if (answer.action === 'revise') {
    if (typeof answer.instructions !== 'string' || !answer.instructions.trim()) throw Error('修订需要具体指示');
    state.revisionRequest = { instructions: answer.instructions.trim(), timestamp: Date.now() };
    state.revisionInstructions = answer.instructions.trim(); state.planApproved = false; state.phase = 'planning'; return state;
  }
  throw Error('当前阶段不支持操作: ' + answer.action);
}

export function retry(state) {
  upgradeState(state); state.attention = null;
  const fresh = new Set();
  for (const [key, task] of Object.entries(state.tasks)) if (['failed', 'cancelled'].includes(task.status)) {
    const logicalKey = task.logicalKey || key.replace(/-format-fix$/, '');
    const currentKey = logicalKey + (state.taskAttempts?.[logicalKey] ? '-retry-' + state.taskAttempts[logicalKey] : '');
    if (key !== currentKey && key !== currentKey + '-format-fix' || state.tasks[currentKey + '-format-fix']?.status === 'completed') continue;
    if (task.status === 'cancelled' || ['format', 'no-result'].includes(task.failureKind)) fresh.add(logicalKey);
    else { task.status = task.receipt ? 'running' : 'prepared'; task.deadline = Date.now() + 15 * 60 * 1000; delete task.error; delete task.failureKind; }
  }
  state.taskAttempts ??= {};
  for (const key of fresh) state.taskAttempts[key] = (state.taskAttempts[key] || 0) + 1;
  for (const node of state.graph.nodes) if (node.status === 'failed') {
    node.status = 'pending'; delete node.error;
  }
  return state;
}

export function parseAnswer(text, taskId) {
  if (typeof text !== 'string' || text.length > 500000) throw Error('Agent 回复大小无效');
  const block = text.trim().startsWith('{') ? null : text.match(/```(?:json)?\s*\n?([\s\S]*)\n?```/i);
  const raw = (block?.[1] || text).trim();
  let value;
  try { value = JSON.parse(raw); } catch { throw Error('Agent 没有返回完整 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Agent 回复格式无效');
  if (value.taskId !== taskId) throw Error('Agent 回复任务 ID 不匹配，期望: ' + taskId);
  return value;
}
