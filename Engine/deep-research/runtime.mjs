/** Native-agent research execution, driven by the current plan's DAG. */
import { create, describe, respond, retry, upgradeState, MAX_AGENT_REPLY_CHARS } from './model.mjs';
import { provision, ask, cancel } from './agents.mjs';
import { normalizePlanResponse } from './schema.mjs';
import { applyPlan, readyNodes, planTeam } from './graph.mjs';
import { normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport, isIndependentSource } from './evidence.mjs';
import { acquireSources } from './source-read.mjs';
import { generateArtifacts } from './reports.mjs';

export { create, describe, respond, retry, cancel };

export async function pause(state, ctx) {
  const running = (state.graph?.nodes || []).filter(node => node.status === 'running');
  await cancel(state, ctx);
  for (const node of running) {
    node.status = 'pending';
  }
}

export function amend(state, update) {
  return respond(state, { action: 'revise', instructions: update.instructions });
}

export async function run(originalState, originalContext) {
  const state = upgradeState(originalState);
  let chain = Promise.resolve();
  const ctx = { ...originalContext, checkpoint: value => {
    const snapshot = structuredClone(value);
    chain = chain.then(() => originalContext.checkpoint(snapshot));
    return chain;
  } };
  ctx.signal.throwIfAborted();
  for (const task of Object.values(state.tasks)) if (task.receipt && task.prompt) {
    task.inputSourceIds ??= (JSON.parse(task.prompt.split('\n\n')[1]).payload.sources || []).map(source => source.id);
    delete task.prompt;
  }
  if (state.phase !== 'complete' && !state.independentEvidence && state.sources.some(s => !isIndependentSource(s))) {
    state.historicalReport ??= state.report; state.historicalFindings ??= state.findings;
    state.report = null; state.review = null; state.findings = [];
    for (const source of state.sources) if (!isIndependentSource(source)) {
      source.acquisition = {...source.acquisition, status: 'discovered', method: 'agent-reported'}; source.verified = false;
    }
    state.reacquireScout = !!state.scouting;
    for (const node of state.graph.nodes.filter(n => n.active !== false)) {
      if (node.kind === 'search' && node.status === 'completed') node.reacquire = true;
      if (['verify', 'synthesize', 'write', 'review'].includes(node.kind)) {
        node.status = 'pending'; node.taskKey = node.id + '-independent-v1'; delete node.inputSourceIds; delete node.result;
      }
    }
    if (state.graph.nodes.length && state.phase !== 'planning') state.phase = 'research';
  }
  state.independentEvidence = true;
  if (state.reacquireScout) {
    const candidates = state.tasks['initial-scout']?.result?.sources || state.sources.filter(s => state.scouting.sourceIds.includes(s.id));
    state.scouting.sourceIds = mergeSources(state, await acquireSources(state, candidates, {signal: ctx.signal, read: ctx.sourceReader}), {id: 'initial-scout'});
    delete state.reacquireScout; await ctx.checkpoint(state);
  }
  for (const node of state.graph.nodes.filter(n => n.active !== false && n.reacquire)) {
    const key = node.taskKey || node.id;
    const currentKey = key + (state.taskAttempts?.[key] ? '-retry-' + state.taskAttempts[key] : '');
    const candidates = state.tasks[currentKey]?.result?.sources || state.sources.filter(s => node.sourceIds?.includes(s.id) || node.dimensionId && s.dimensionIds?.includes(node.dimensionId));
    node.sourceIds = mergeSources(state, await acquireSources(state, candidates, {signal: ctx.signal, read: ctx.sourceReader}), node);
    delete node.reacquire; await ctx.checkpoint(state);
  }
  if (state.phase === 'complete') return state.artifacts?.length ? { status: 'completed', state, artifacts: state.artifacts } : finish(state, ctx);
  if (state.phase === 'init') {
    await provision(state, ctx); state.phase = 'scouting'; await ctx.checkpoint(state);
  }
  if (state.phase === 'scouting') {
    const result = await ask(state, ctx, 'initial-scout', 'coordinator', 'scout', {
      topic: state.input.topic, scope: state.input.scope, languages: state.input.languages,
      materials: state.input.materials, maxSources: Math.min(state.input.maxSources, 12)
    }, normalizeSources);
    const sourceIds = mergeSources(state, await acquireSources(state, result.sources, {signal: ctx.signal, read: ctx.sourceReader}), { id: 'initial-scout' });
    state.scouting = { gaps: result.gaps, sourceIds };
    state.phase = 'planning'; await ctx.checkpoint(state);
  }
  while (true) {
    ctx.signal.throwIfAborted();
    if (state.phase === 'planning') {
      if (!state.plan || state.revisionRequest) {
        const reason = state.revisionRequest?.instructions || '根据初步调研制定研究计划';
        const plan = await ask(state, ctx, 'research-plan-v' + ((state.graph?.version ?? 0) + 1), 'coordinator', 'plan', {
          topic: state.input.topic, scope: state.input.scope, materials: state.input.materials,
          languages: state.input.languages, budget: { maxSources: state.input.maxSources, ...state.input.team, maxTasks: state.input.maxTasks, maxAgentReplyChars: MAX_AGENT_REPLY_CHARS },
          sources: state.sources, gaps: state.scouting?.gaps || [], currentPlan: state.plan,
          completedNodes: state.graph?.nodes.filter(n => n.status === 'completed'), reason
        }, result => {
          const candidate = normalizePlanResponse(result);
          candidate.team = planTeam(candidate, state.input.team);
          // Validate the complete revision before caching a successful planner reply.
          applyPlan({...state, planRevisions: [], visualization: {timeline: []}}, candidate, reason);
          return candidate;
        });
        applyPlan(state, plan, reason); state.revisionRequest = null;
        await provision(state, ctx, plan.team);
        for (const manager of state.workers.filter(w => w.active !== false && w.managementRole === 'manager' && w.role !== 'coordinator')) {
          const opinion = await ask(state, ctx, 'manager-plan-' + manager.specId + '-v' + state.graph.version, manager.role, 'plan-review', { plan: state.plan, budget: state.input.team }, validateReview, { workerId: manager.id });
          state.managerReviews.push({ managerId: manager.id, planVersion: state.graph.version, ...opinion });
          if (opinion.verdict === 'revise') { state.planApproved = false; state.attention = { employeeId: manager.id, message: opinion.summary || 'Manager 建议修改研究计划' }; }
        }
        await ctx.checkpoint(state);
      }
      if (!state.planApproved) return { status: 'waiting', state };
      state.phase = 'research'; await ctx.checkpoint(state);
    }
    if (['verification', 'synthesis', 'writing', 'review'].includes(state.phase)) state.phase = 'research';
    if (state.phase !== 'research') throw Error('未知研究阶段: ' + state.phase);
    const active = state.graph.nodes.filter(n => n.active !== false);
    if (active.every(n => n.status === 'completed')) {
      if (!state.report) throw Error('当前计划没有产出报告');
      if (state.review?.verdict !== 'pass') { state.phase = 'review'; return { status: 'waiting', state }; }
      return finish(state, ctx);
    }
    await executeGraph(state, ctx);
    if (state.replanReason && state.replans < state.input.maxReplans) {
      state.replans++; state.revisionRequest = { instructions: state.replanReason, timestamp: Date.now() };
      state.replanReason = ''; state.phase = 'planning'; state.planApproved = false;
      await ctx.checkpoint(state);
    } else if (state.replanReason) { state.replanReason = ''; await ctx.checkpoint(state); }
  }
}

/** Complete-driven pool lets a short branch unlock its descendants immediately. */
async function executeGraph(state, ctx) {
  const running = new Map();
  let failure;
  try {
    while (true) {
      ctx.signal.throwIfAborted();
      if (!failure && !state.replanReason) {
        const ready = readyNodes(state).filter(node => !running.has(node.id));
        for (const node of ready.slice(0, Math.max(0, state.input.team.maxConcurrency - running.size))) {
          const promise = executeNode(state, ctx, node).then(() => ({ id: node.id }), error => ({ id: node.id, error }));
          running.set(node.id, promise);
        }
      }
      if (!running.size) {
        if (failure) throw failure;
        if (state.replanReason || state.graph.nodes.filter(n => n.active !== false).every(n => n.status === 'completed')) return;
        const failed = state.graph.nodes.find(n => n.status === 'failed' && n.active !== false);
        throw Error(failed?.error || '研究计划没有可执行节点');
      }
      const finished = await Promise.race(running.values());
      running.delete(finished.id);
      if (finished.error) failure ||= finished.error;
    }
  } catch (error) { throw failure || error; }
  finally { await Promise.all(running.values()); }
}

async function executeNode(state, ctx, node) {
  node.status = 'running'; node.startedAt ||= Date.now();
  const dimension = state.dimensions.find(d => d.id === node.dimensionId);
  if (dimension) dimension.status = 'running';
  const ancestors = new Set();
  const visit = id => { const parent = state.graph.nodes.find(n => n.id === id && n.active !== false); if (parent && !ancestors.has(id)) { ancestors.add(id); parent.dependencies.forEach(visit); } };
  node.dependencies.forEach(visit);
  if (!node.inputSourceIds) {
    const key = node.taskKey || node.id;
    const currentKey = key + (state.taskAttempts?.[key] ? '-retry-' + state.taskAttempts[key] : '');
    const saved = state.tasks[currentKey + '-format-fix'] || state.tasks[currentKey];
    if (saved) node.inputSourceIds = saved.inputSourceIds || (JSON.parse(saved.prompt.split('\n\n')[1]).payload.sources || []).map(s => s.id);
    else {
      const available = new Set([...(state.scouting?.sourceIds || []), ...state.graph.nodes.filter(n => ancestors.has(n.id)).flatMap(n => n.sourceIds || [])]);
      node.inputSourceIds = state.sources.filter(s => available.has(s.id) && (!node.payload.sourceIds || node.payload.sourceIds.includes(s.id)) && (node.kind !== 'verify' || !s.verified)).map(s => s.id);
    }
  }
  const relevant = state.sources.filter(s => node.inputSourceIds.includes(s.id) && (node.kind !== 'verify' || isIndependentSource(s)));
  await ctx.checkpoint(state);
  const payload = {
    ...node.payload,
    topic: state.input.topic, scope: state.input.scope, languages: state.input.languages,
    objective: node.objective, query: node.payload.query || node.objective || dimension?.query || node.label,
    maxSources: Math.max(0, state.input.maxSources - state.sources.length),
    existingSources: state.sources.map(s => ({ id: s.id, url: s.url })),
    sources: relevant, findings: state.findings.filter(f => f.sourceIds.some(id => node.inputSourceIds.includes(id))), contradictions: state.contradictions.filter(c => c.sources.every(id => node.inputSourceIds.includes(id))),
    synthesis: state.graph.nodes.filter(n => ancestors.has(n.id) && n.kind === 'synthesize').map(n => n.result), report: state.report, plan: state.plan,
    dependencyResults: state.graph.nodes.filter(n => ancestors.has(n.id)).map(n => ({ id: n.id, kind: n.kind, summary: n.resultSummary, sourceIds: n.sourceIds })),
    revisionInstructions: state.revisionInstructions || ''
  };
  if (node.kind === 'search') {
    delete payload.sources; delete payload.report; delete payload.plan;
    payload.findings = payload.findings.map(({ claim, sourceIds, confidence }) => ({ claim, sourceIds, confidence }));
  }
  try {
    const validate = { search: normalizeSources, verify: result => normalizeVerification(result, relevant), synthesize: validateSynthesis, write: result => validateReport(result, state), review: validateReview }[node.kind];
    const result = node.kind === 'verify' && !relevant.length ? [] : await ask(state, ctx, node.taskKey || node.id, node.role, node.kind, payload, validate, { nodeId: node.id, excludeWorkerIds: node.kind === 'review' ? state.reportWorkerIds : [] });
    ctx.signal.throwIfAborted();
    node.employeeId ||= state.tasks[node.taskKey || node.id]?.employeeId;
    const worker = state.workers.find(w => w.id === node.employeeId); node.managerIds = worker?.managerIds || [];
    if (node.kind === 'search') {
      node.sourceIds = mergeSources(state, await acquireSources(state, result.sources, {signal: ctx.signal, read: ctx.sourceReader}), node); node.resultSummary = `${node.sourceIds.length} 个来源；${result.gaps.length} 项未解问题`;
      if (dimension) { dimension.status = 'completed'; dimension.sourcesFound = node.sourceIds.length; }
      if (result.replanReason) state.replanReason = result.replanReason;
    } else if (node.kind === 'verify') {
      mergeVerification(state, result); node.sourceIds = result.map(r => r.sourceId); node.resultSummary = result.length + ' 个来源已核验';
    } else if (node.kind === 'synthesize') {
      node.result = result;
      const analyses = state.graph.nodes.filter(n => n.active !== false && n.kind === 'synthesize' && n.result).map(n => n.result);
      state.knowledgeGraph = { entities: analyses.flatMap(r => r.entities), relationships: analyses.flatMap(r => r.relationships) };
      node.resultSummary = result.insights.length + ' 项综合洞察';
    } else if (node.kind === 'write') {
      node.result = result; state.report = result; state.reportWorkerIds = [...new Set([...state.reportWorkerIds, node.employeeId].filter(Boolean))]; state.review = null;
      node.resultSummary = result.sections.length + ' 章报告，' + result.citations.length + ' 个引用';
    } else {
      state.review = result; node.resultSummary = result.summary;
      if (worker?.managementRole === 'manager') state.managerReviews.push({ managerId: worker.id, planVersion: state.graph.version, stage: 'final', ...result });
      if (result.verdict === 'revise') {
        state.attention = { employeeId: node.employeeId, message: result.summary || '报告需要修订' };
        state.replanReason = result.issues.map(i => i.description + ' ' + i.suggestion).join('\n') || result.summary || '审查要求修订报告';
      }
    }
    ctx.signal.throwIfAborted();
    node.status = 'completed'; node.finishedAt = Date.now(); delete node.error;
    state.visualization.timeline.push({ timestamp: Date.now(), type: node.kind, agent: node.role, description: node.label, data: { nodeId: node.id, summary: node.resultSummary } });
    await ctx.checkpoint(state);
  } catch (error) {
    if (!ctx.signal.aborted) { node.status = 'failed'; node.error = error.message; await ctx.checkpoint(state); }
    throw error;
  }
}

function validateSynthesis(result) {
  const value = result?.synthesis || result;
  if (!Array.isArray(value?.entities)) throw Error('综合结果必须包含 entities 数组');
  return { entities: value.entities, relationships: value.relationships || [], insights: (value.insights || []).map(String) };
}
function validateReview(result) {
  if (!['pass', 'revise'].includes(result?.verdict)) throw Error('审查必须返回 verdict: pass 或 revise');
  return { verdict: result.verdict, summary: String(result.summary || ''), issues: (result.issues || []).map(i => ({ severity: i.severity || 'warning', description: String(i.description || ''), suggestion: String(i.suggestion || '') })) };
}
async function finish(state, ctx) {
  const artifacts = generateArtifacts(state); state.phase = 'complete'; state.finishedAt ||= Date.now();
  await ctx.checkpoint(state); return { status: 'completed', state, artifacts };
}
