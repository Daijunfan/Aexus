/** Deep Research domain model and state management. */

export const ENGINE_ID = 'deep-research';
export const ENGINE_VERSION = '2.0.0';
// Use engines that successfully handle documentation tool initialization
// codex, cline, pi all pass initialization; claude (with DeepSeek API) fails
export const ENGINE_IDS = ['codex', 'cline', 'pi'];

// Research phases
export const PHASES = {
  'init': '初始化研究',
  'planning': '规划调查路线',
  'research': '多维度深度研究',
  'verification': '证据交叉验证',
  'synthesis': '知识整合',
  'writing': '报告撰写',
  'review': '质量审查',
  'complete': '完成交付'
};

// Agent roles for research
export const RESEARCH_ROLES = [
  { role: 'coordinator', label: '研究协调员', description: '分解问题，规划路线，整合发现' },
  { role: 'researcher', label: '深度研究员', description: '搜索、阅读、理解来源，提取信息' },
  { role: 'verifier', label: '证据核验员', description: '交叉验证信息，检测矛盾，评估可信度' },
  { role: 'synthesizer', label: '知识综合员', description: '构建知识图谱，发现联系，生成洞察' },
  { role: 'writer', label: '报告撰写员', description: '组织叙事，撰写报告，管理引用' }
];

/**
 * Create initial research state from user input
 */
export function create(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Error('研究输入必须是对象');
  }

  const topic = String(input.topic || '').trim();
  if (!topic || topic.length < 10 || topic.length > 2000) {
    throw Error('研究主题需要 10-2000 个字符');
  }

  const scope = input.scope || 'comprehensive';
  if (!['comprehensive', 'quick', 'deep', 'academic'].includes(scope)) {
    throw Error('研究范围必须是: comprehensive, quick, deep, academic');
  }

  const maxSources = input.maxSources || 50;
  if (!Number.isInteger(maxSources) || maxSources < 10 || maxSources > 200) {
    throw Error('来源数量限制 10-200');
  }

  const languages = input.languages || ['zh-CN', 'en'];
  if (!Array.isArray(languages) || languages.length === 0) {
    throw Error('至少指定一种语言');
  }

  // Background materials
  const materials = input.materials || [];
  if (!Array.isArray(materials) || materials.length > 10) {
    throw Error('背景材料最多 10 份');
  }

  for (const m of materials) {
    if (!m || typeof m.name !== 'string' || typeof m.content !== 'string') {
      throw Error('材料需要 name 和 content');
    }
    if (m.content.length > 200000) {
      throw Error('单份材料不超过 200,000 字符');
    }
  }

  // Engine selection
  let engines = input.engines;
  if (engines !== undefined) {
    if (!Array.isArray(engines) || engines.length === 0 || engines.length > 5) {
      throw Error('请选择 1-5 种已配置的 Coding Agent');
    }
    engines = engines.map(e => {
      const engine = typeof e === 'string' ? e : e.engine;
      if (!ENGINE_IDS.includes(engine)) {
        throw Error('不支持的引擎: ' + engine);
      }
      return { engine, ...(e.model ? { model: e.model } : {}) };
    });
  }

  return {
    version: 1,
    phase: 'init',
    input: {
      topic,
      scope,
      maxSources,
      languages,
      materials: materials.map(m => ({ name: m.name, content: m.content })),
      engines
    },

    // Research state
    team: null,
    workers: [],
    tasks: {},

    // Research plan
    plan: null,
    dimensions: [], // 研究维度

    // Sources
    sources: [],
    sourceNetwork: { nodes: [], edges: [] },

    // Knowledge graph
    knowledgeGraph: {
      entities: [],
      relationships: []
    },

    // Findings
    findings: [],
    contradictions: [],

    // Report
    report: null,

    // Visualization data
    visualization: {
      timeline: [],
      progressTree: [],
      evidenceChain: []
    },

    // Metadata
    startedAt: Date.now(),
    checkpoints: []
  };
}

/**
 * Describe research state for UI display
 */
export function describe(state) {
  return {
    topic: state.input.topic,
    phase: state.phase,
    phaseLabel: PHASES[state.phase] || state.phase,
    scope: state.input.scope,

    // Progress
    progress: {
      sources: {
        collected: state.sources.length,
        max: state.input.maxSources,
        verified: state.sources.filter(s => s.verified).length
      },
      findings: state.findings.length,
      contradictions: state.contradictions.length,
      entities: state.knowledgeGraph.entities.length
    },

    // Workers
    workers: state.workers.map(w => ({
      id: w.id,
      role: w.role,
      label: w.label,
      engine: w.engine,
      status: getWorkerStatus(state, w.id)
    })),

    // Tasks
    tasks: Object.entries(state.tasks).map(([id, t]) => ({
      id,
      role: t.role,
      label: t.label,
      status: t.status,
      error: t.error,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt
    })),

    // Research plan
    plan: state.plan,
    dimensions: state.dimensions,

    // Visualization
    sourceNetwork: state.sourceNetwork,
    knowledgeGraph: state.knowledgeGraph,
    timeline: state.visualization.timeline,

    // Report
    report: state.report ? {
      title: state.report.title,
      sections: state.report.sections.length,
      citations: state.report.citations.length,
      wordCount: estimateWordCount(state.report)
    } : null,

    // Metadata
    startedAt: state.startedAt,
    duration: Date.now() - state.startedAt,
    checkpoints: state.checkpoints.length
  };
}

/**
 * Handle user response/interaction
 */
export function respond(state, answer) {
  if (!answer || typeof answer !== 'object') {
    throw Error('响应参数无效');
  }

  const action = answer.action;

  if (state.phase === 'planning' && action === 'approve-plan') {
    if (!state.plan) {
      throw Error('研究计划尚未生成');
    }
    state.phase = 'research';
    return state;
  }

  if (state.phase === 'synthesis' && action === 'approve-synthesis') {
    state.phase = 'writing';
    return state;
  }

  if (state.phase === 'review' && action === 'approve-report') {
    state.phase = 'complete';
    return state;
  }

  if (action === 'revise') {
    if (!answer.instructions) {
      throw Error('修订需要具体指示');
    }
    state.revisionRequest = {
      instructions: answer.instructions,
      timestamp: Date.now()
    };
    return state;
  }

  throw Error('未知操作: ' + action);
}

/**
 * Retry failed tasks
 */
export function retry(state) {
  for (const task of Object.values(state.tasks)) {
    if (task.status === 'failed') {
      task.status = task.receipt ? 'running' : 'prepared';
      task.deadline = Date.now() + 15 * 60 * 1000; // 15 minutes
      delete task.error;
      delete task.failureKind;
    }
  }
  return state;
}

// Helper functions

function getWorkerStatus(state, workerId) {
  const workerTasks = Object.values(state.tasks).filter(t => t.employeeId === workerId);
  if (workerTasks.some(t => t.status === 'running')) return 'working';
  if (workerTasks.some(t => t.status === 'failed')) return 'failed';
  if (workerTasks.every(t => t.status === 'completed')) return 'completed';
  return 'idle';
}

function estimateWordCount(report) {
  if (!report || !report.sections) return 0;
  let total = 0;
  for (const section of report.sections) {
    if (section.content) {
      // Simple word count estimation
      total += section.content.split(/\s+/).length;
    }
  }
  return total;
}

/**
 * Parse JSON response from agent
 */
export function parseAnswer(text, taskId) {
  if (typeof text !== 'string' || text.length > 500000) {
    throw Error('Agent 回复大小无效');
  }

  let raw = text.trim();

  // Try to extract JSON from markdown code blocks
  if (raw.includes('```')) {
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
    if (codeBlockMatch) {
      raw = codeBlockMatch[1].trim();
    }
  }

  // Try to find JSON object in the text (starts with { and ends with })
  if (!raw.startsWith('{')) {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      raw = jsonMatch[0];
    }
  }

  // Clean up common issues
  raw = raw
    .replace(/^[^{]*/, '')  // Remove text before first {
    .replace(/[^}]*$/, '')  // Remove text after last }
    .trim();

  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    // Try to provide more helpful error messages
    const preview = raw.substring(0, 200);
    throw Error(`Agent 没有返回完整 JSON。响应预览: ${preview}...`);
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Error('Agent 回复格式无效');
  }

  if (value.taskId !== taskId) {
    throw Error(`Agent 回复任务 ID 不匹配。期望: ${taskId}，收到: ${value.taskId}`);
  }

  return value;
}
