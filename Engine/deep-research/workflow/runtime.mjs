/** Native-agent research execution, driven by the current plan's DAG. */
import { create, describe as describeDomain, respond, retry, fork, upgradeState, MAX_AGENT_REPLY_CHARS } from '../model.mjs';
import { provision, ask, cancel } from '../agents.mjs';
import { normalizePlanResponse } from '../schema.mjs';
import { applyPlan, planTeam } from '../graph.mjs';
import { selectDispatches } from './scheduler.mjs';
import { executionQueue } from './progress.mjs';
import { appendReplanReason } from './replan.mjs';
import { attributeVerification } from './verification-context.mjs';
import { createSourceAcquisitionCoordinator } from './source-budget.mjs';
import { cacheSourceReader } from '../retrieval/source-cache.mjs';
import { canonicalUrl, normalizeSources, mergeSources, normalizeVerification, mergeVerification, validateReport, isIndependentSource } from '../evidence.mjs';
import { acquireSources, previewSource, readSource } from '../source-read.mjs';
import { generateArtifacts } from '../reports.mjs';

export { create, respond, retry, fork, cancel };

export function describe(state) {
  const summary = describeDomain(state);
  summary.progress.queue = executionQueue(state);
  return summary;
}

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

function replayCandidates(sources) {
  return sources.flatMap(source => {
    if (source.acquisition?.excerpt || !source.acquisition?.excerpts?.length) return [source];
    const candidates = source.acquisition.excerpts.filter(proof => typeof proof.excerpt === 'string' && proof.excerpt).map(proof => ({
      ...source, acquisition: {...source.acquisition, excerpt: proof.excerpt, locator: proof.locator || ''}
    }));
    return candidates.length ? candidates : [source];
  });
}

export async function run(originalState, originalContext) {
  const state = upgradeState(originalState);
  const cached = cacheSourceReader(originalContext.sourceReader || readSource);
  // Explicitly scoped pages keep the same original response from pre-reading
  // through later quote verification, even if planning exceeds cache TTL.
  const scopedReads = new Map();
  const allowedUrls = new Set(state.input.sourceUrls || []);
  const sourceReader = (url, options = {}) => {
    options.signal?.throwIfAborted();
    const key = canonicalUrl(url);
    if (!allowedUrls.has(key)) return cached(url, options);
    if (!scopedReads.has(key)) scopedReads.set(key, cached(url, options).catch(error => {
      scopedReads.delete(key);
      throw error;
    }));
    return scopedReads.get(key);
  };
  let chain = Promise.resolve();
  const ctx = { ...originalContext, sourceReader, checkpoint: value => {
    const snapshot = structuredClone(value);
    chain = chain.then(() => originalContext.checkpoint(snapshot));
    return chain;
  } };
  const budgetSkips = new Map();
  ctx.budgetSkips = budgetSkips;
  const collectSources = createSourceAcquisitionCoordinator(state, async (candidates, node) =>
    mergeSources(state, await acquireSources(state, candidates, {signal: ctx.signal, read: ctx.sourceReader}), node),
    ctx.signal, (node, count) => budgetSkips.set(node.id, (budgetSkips.get(node.id) || 0) + count));
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
    const candidates = state.tasks['initial-scout']?.result?.sources || replayCandidates(state.sources.filter(s => state.scouting.sourceIds.includes(s.id)));
    state.scouting.sourceIds = await collectSources(candidates, {id: 'initial-scout'});
    delete state.reacquireScout; await ctx.checkpoint(state);
  }
  for (const node of state.graph.nodes.filter(n => n.active !== false && n.reacquire)) {
    const key = node.taskKey || node.id;
    const currentKey = key + (state.taskAttempts?.[key] ? '-retry-' + state.taskAttempts[key] : '');
    const candidates = state.tasks[currentKey]?.result?.sources || replayCandidates(state.sources.filter(s => node.sourceIds?.includes(s.id) || node.dimensionId && s.dimensionIds?.includes(node.dimensionId)));
    node.sourceIds = await collectSources(candidates, node);
    delete node.reacquire; await ctx.checkpoint(state);
  }
  if (state.phase === 'complete') return state.artifacts?.length ? { status: 'completed', state, artifacts: state.artifacts } : finish(state, ctx);
  if (state.phase === 'init') {
    await provision(state, ctx); state.phase = 'scouting'; await ctx.checkpoint(state);
  }
  if (state.phase === 'scouting') {
    if (state.input.sourceUrls?.length && !state.scouting?.previews) {
      const limit = Math.min(12000, Math.floor(60000 / state.input.sourceUrls.length));
      const loaded = await Promise.allSettled(state.input.sourceUrls.map(url => previewSource(url, {signal: ctx.signal, read: ctx.sourceReader, limit})));
      ctx.signal.throwIfAborted();
      const previews = loaded.map((result, index) => result.status === 'fulfilled' ? result.value : {url: state.input.sourceUrls[index], error: result.reason.message});
      state.scouting = {previews}; await ctx.checkpoint(state);
    }
    const result = await ask(state, ctx, 'initial-scout', 'coordinator', 'scout', {
      topic: state.input.topic, scope: state.input.scope, languages: state.input.languages,
      materials: state.input.materials, maxSources: Math.min(state.input.maxSources, 12),
      sourcePreviews: state.scouting?.previews
    }, normalizeSources);
    const sourceIds = await collectSources(result.sources, { id: 'initial-scout' });
    state.scouting = { gaps: result.gaps, sourceIds, ...(state.scouting?.previews ? {previews: state.scouting.previews} : {}) };
    state.phase = 'planning'; await ctx.checkpoint(state);
  }
  while (true) {
    ctx.signal.throwIfAborted();
    if (state.phase === 'planning') {
      if (!state.plan || state.revisionRequest) {
        const reason = state.revisionRequest?.instructions || '根据初步调研制定研究计划';
        const plan = await ask(state, ctx, 'research-plan-v' + ((state.graph?.version ?? 0) + 1), 'coordinator', 'plan', {
          topic: state.input.topic, scope: state.input.scope, materials: state.input.materials,
          languages: state.input.languages, sourceUrls: state.input.sourceUrls, sourcePreviews: state.scouting?.previews, budget: { maxSources: state.input.maxSources, ...state.input.team, maxTasks: state.input.maxTasks, maxAgentReplyChars: MAX_AGENT_REPLY_CHARS, ...(state.input.scope === 'quick' ? {targetAgentReplyChars: 10000} : {}) },
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
    await executeGraph(state, ctx, collectSources);
    if (state.replanReason && state.replans < state.input.maxReplans) {
      state.replans++; state.revisionRequest = { instructions: state.replanReason, timestamp: Date.now() };
      state.replanReason = ''; state.phase = 'planning'; state.planApproved = false;
      await ctx.checkpoint(state);
    } else if (state.replanReason) { state.replanReason = ''; await ctx.checkpoint(state); }
  }
}

/** Complete-driven pool; employee reservations prevent stalled resumptions. */
async function executeGraph(state, ctx, collectSources) {
  const running = new Map();
  const activeNodes = state.graph.nodes.filter(node => node.active !== false);
  const byId = new Map(activeNodes.map(node => [node.id, node]));
  let failure;
  try {
    while (true) {
      ctx.signal.throwIfAborted();
      if (!failure && !state.replanReason) {
        for (const {node, workerId} of selectDispatches(state, running, ctx.workerLeases)) {
          const promise = executeNode(state, ctx, node, workerId, collectSources, byId, activeNodes).then(() => ({id: node.id}), error => ({id: node.id, error}));
          running.set(node.id, {promise, workerId});
        }
      }
      if (!running.size) {
        if (failure) throw failure;
        if (state.replanReason || state.graph.nodes.filter(n => n.active !== false).every(n => n.status === 'completed')) return;
        const failed = state.graph.nodes.find(n => n.status === 'failed' && n.active !== false);
        throw Error(failed?.error || '研究计划没有可执行节点');
      }
      const finished = await Promise.race(Array.from(running.values(), item => item.promise));
      running.delete(finished.id);
      if (finished.error) failure ||= finished.error;
    }
  } catch (error) { throw failure || error; }
  finally { await Promise.all(Array.from(running.values(), item => item.promise)); }
}

async function executeNode(state, ctx, node, workerId, collectSources, byId, activeNodes) {
  const dimension = state.dimensions.find(d => d.id === node.dimensionId);
  const ancestors = new Set(), stack = [...node.dependencies];
  while (stack.length) {
    const id = stack.pop(), parent = byId.get(id);
    if (!parent || ancestors.has(id)) continue;
    ancestors.add(id);
    stack.push(...parent.dependencies);
  }
  const dependencyNodes = activeNodes.filter(parent => ancestors.has(parent.id));
  if (!node.inputSourceIds) {
    const key = node.taskKey || node.id;
    const currentKey = key + (state.taskAttempts?.[key] ? '-retry-' + state.taskAttempts[key] : '');
    const saved = state.tasks[currentKey + '-format-fix'] || state.tasks[currentKey];
    if (saved) node.inputSourceIds = saved.inputSourceIds || (JSON.parse(saved.prompt.split('\n\n')[1]).payload.sources || []).map(s => s.id);
    else {
      const available = new Set([...(state.scouting?.sourceIds || []), ...dependencyNodes.flatMap(n => n.sourceIds || [])]);
      node.inputSourceIds = state.sources.filter(s => available.has(s.id) && (!node.payload.sourceIds || node.payload.sourceIds.includes(s.id))).map(s => s.id);
    }
  }
  const inputSourceIds = new Set(node.inputSourceIds);
  const relevant = state.sources.filter(s => inputSourceIds.has(s.id) && (node.kind !== 'verify' || isIndependentSource(s))).map(({snippet, summary, ...source}) => source);
  await ctx.checkpoint(state);
  const payload = {
    ...node.payload,
    topic: state.input.topic, scope: state.input.scope, languages: state.input.languages, sourceUrls: state.input.sourceUrls,
    ...(node.kind === 'write' && state.input.scope === 'quick' ? {targetReplyChars: 10000} : {}),
    objective: node.objective, query: node.payload.query || node.objective || dimension?.query || node.label,
    maxSources: Math.max(0, state.input.maxSources - state.sources.length),
    ...(node.kind === 'search' ? {existingSources: state.sources.map(s => ({id: s.id, url: s.url}))} : {}),
    sources: relevant, findings: state.findings.filter(f => f.sourceIds.some(id => inputSourceIds.has(id))), contradictions: state.contradictions.filter(c => c.sources.every(id => inputSourceIds.has(id))),
    synthesis: dependencyNodes.filter(n => n.kind === 'synthesize').map(n => n.result), report: state.report, plan: state.plan,
    ...(node.kind === 'synthesize' ? {evidenceLinkGuidance: '仅把 payload.findings 中已有明确已核验原文支持的 finding.id 加到相应 entities 和 relationships 的 findingIds 数组；无法证明的概念或关系请使用空数组，禁止自造 ID。'} : {}),
    dependencyResults: dependencyNodes.map(n => ({ id: n.id, kind: n.kind, summary: n.resultSummary, sourceIds: n.sourceIds })),
    revisionInstructions: state.revisionInstructions || ''
  };
  if (node.kind === 'search') {
    if (state.scouting?.previews) {
      const targets = new Set((node.payload.targetUrls || []).map(canonicalUrl));
      payload.sourcePreviews = targets.size ? state.scouting.previews.filter(preview => targets.has(preview.url)) : state.scouting.previews;
    }
    delete payload.sources; delete payload.report; delete payload.plan;
    payload.findings = payload.findings.map(({ claim, sourceIds, confidence }) => ({ claim, sourceIds, confidence }));
  }
  try {
    const validate = { search: normalizeSources, verify: result => normalizeVerification(result, relevant), synthesize: validateSynthesis, write: result => validateReport(result, state), review: validateReview }[node.kind];
    const result = node.kind === 'verify' && !relevant.length ? [] : await ask(state, ctx, node.taskKey || node.id, node.role, node.kind, payload, validate, { nodeId: node.id, workerId, excludeWorkerIds: node.kind === 'review' ? state.reportWorkerIds : [] });
    ctx.signal.throwIfAborted();
    node.employeeId ||= state.tasks[node.taskKey || node.id]?.employeeId;
    const worker = state.workers.find(w => w.id === node.employeeId); node.managerIds = worker?.managerIds || [];
    if (node.kind === 'search') {
      node.sourceIds = await collectSources(result.sources, node);
      const budgetLimited = ctx.budgetSkips.get(node.id) || 0;
      node.resultSummary = `${node.sourceIds.length} 个来源；${result.gaps.length} 项未解问题` + (budgetLimited ? `；${budgetLimited} 条候选来源受预算限制` : '');
      if (dimension) { dimension.status = 'completed'; dimension.sourcesFound = node.sourceIds.length; }
      appendReplanReason(state, result.replanReason);
    } else if (node.kind === 'verify') {
      mergeVerification(state, result);
      attributeVerification(state, result, node, relevant);
      node.sourceIds = result.map(r => r.sourceId); node.resultSummary = result.length + ' 个来源已核验';
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
        appendReplanReason(state, result.issues.map(i => i.description + ' ' + i.suggestion).join('\n') || result.summary || '审查要求修订报告');
      }
    }
    ctx.signal.throwIfAborted();
    node.startedAt ||= Date.now(); node.status = 'completed'; node.finishedAt = Date.now(); delete node.error;
    // Once the canonical evidence, synthesis or draft is checkpointed with the
    // completed node, retaining another native reply duplicates large payloads.
    if (['verify', 'synthesize', 'write'].includes(node.kind)) {
      const key = node.taskKey || node.id;
      const attempt = state.taskAttempts?.[key] || 0;
      const current = key + (attempt ? '-retry-' + attempt : '');
      for (const name of [current, current + '-format-fix']) {
        if (state.tasks[name]?.status === 'completed') delete state.tasks[name].result;
      }
    }
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
  if (value.relationships !== undefined && !Array.isArray(value.relationships)) throw Error('综合结果 relationships 必须是数组');
  if (value.insights !== undefined && !Array.isArray(value.insights)) throw Error('综合结果 insights 必须是数组');
  return { entities: value.entities, relationships: value.relationships || [], insights: (value.insights || []).map(String) };
}
function validateReview(result) {
  if (!['pass', 'revise'].includes(result?.verdict)) throw Error('审查必须返回 verdict: pass 或 revise');
  const issues = (result.issues || []).map(i => ({ severity: i.severity || 'warning', description: String(i.description || ''), suggestion: String(i.suggestion || '') }));
  const blocked = result.verdict === 'pass' && issues.some(issue => issue.severity !== 'note');
  return { verdict: blocked ? 'revise' : result.verdict, summary: (blocked ? '审阅列出需修订问题，暂不交付。' : '') + String(result.summary || ''), issues };
}
async function finish(state, ctx) {
  if (state.scouting) delete state.scouting.previews;
  const artifacts = generateArtifacts(state); state.phase = 'complete'; state.finishedAt ||= Date.now();
  await ctx.checkpoint(state); return { status: 'completed', state, artifacts };
}
