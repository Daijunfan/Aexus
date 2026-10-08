/** Multi-agent collaboration for deep research. Only uses ContractClient, never imports Infra internals. */
import { ENGINE_IDS, RESEARCH_ROLES, parseAnswer } from './model.mjs';

/**
 * Delay utility that respects abort signals
 */
export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? Error('已取消'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Provision research team and workers
 */
export async function provision(state, ctx) {
  const call = (name, args) => ctx.client.invoke(name, args);
  ctx.signal.throwIfAborted();

  // Check engines availability
  if (!state.engines) {
    const available = [];
    for (const engine of ENGINE_IDS) {
      ctx.signal.throwIfAborted();
      let info;
      try {
        info = await call('engine.check', { engine });
      } catch (error) {
        state.engineDiagnostics ??= [];
        state.engineDiagnostics.push({ engine, error: error.message });
        continue;
      }
      if (info?.ready) available.push({ engine });
    }

    if (!available.length) {
      throw Error('没有已就绪的 Coding Agent。请先到 Infra 配置一种引擎。');
    }

    state.engines = available;
    await ctx.checkpoint(state);
  } else {
    // Verify all specified engines are ready
    for (const spec of state.engines) {
      const info = await call('engine.check', { engine: spec.engine });
      if (!info?.ready) {
        throw Error(spec.engine + ' 尚未就绪，请在 Infra 完成配置。');
      }
    }
  }

  // Create research team
  state.team ??= 'Research-' + ctx.id;
  await ctx.checkpoint(state);

  const groups = await call('group.list', {});
  if (!groups.includes(state.team)) {
    await call('group.add', { name: state.team, mode: 'build' });
  }

  // Create workers for each role
  for (let i = 0; i < RESEARCH_ROLES.length; i++) {
    const spec = RESEARCH_ROLES[i];
    const selected = state.engines[i % state.engines.length];
    const title = 'DR-' + spec.role + '-' + ctx.id.slice(-12);

    // Skip if already created
    const known = state.workers.find(w => w.role === spec.role);
    if (known) continue;

    state.pendingHire = { role: spec.role, title, team: state.team, engine: selected.engine };
    await ctx.checkpoint(state);

    const result = await call('session.list', {});
    const matches = (result.sessions ?? []).filter(
      c => !c.deleting && c.group === state.team && c.title === title
    );

    if (matches.length > 1 || (matches.length === 1 && matches[0].engine !== selected.engine)) {
      throw Error('研究员工身份冲突，拒绝重建或替换原员工');
    }

    const employee = matches[0] ?? await call('card.create', {
      title,
      group: state.team,
      engine: selected.engine,
      managementRole: 'employee',
      kind: 'worker',
      permissionMode: 'default',
      profession: 'Deep Research / ' + spec.label,
      ...(selected.model ? { model: selected.model } : {})
    });

    if (!employee?.id) {
      throw Error('Infra 没有返回实际员工 ID');
    }

    state.workers.push({
      ...spec,
      id: employee.id,
      title,
      engine: employee.engine ?? selected.engine
    });
    state.pendingHire = null;
    await ctx.checkpoint(state);
  }

  // Wait for all workers to be ready
  for (const worker of state.workers) {
    const until = Date.now() + 180000; // 3 minutes
    while (true) {
      ctx.signal.throwIfAborted();
      const status = (await call('session.status', { employee: worker.id }))[0];

      if (!status) {
        throw Error('研究员工已被移除，请在 Infra 处理原身份');
      }

      if (status.initialization?.status === 'failed') {
        throw Error(worker.label + ' 初始化失败：' + status.initialization.error);
      }

      if (!status.initialization || status.initialization.status === 'ready') {
        break;
      }

      if (Date.now() > until) {
        throw Error('员工初始化尚未完成，已保留原员工，请稍后恢复工作流');
      }

      await delay(350, ctx.signal);
    }
  }
}

/**
 * Get transcript text from agent task
 */
function textOf(item) {
  return item?.role === 'assistant'
    ? (item.blocks ?? []).filter(b => b.kind === 'text').map(b => b.text ?? '').join('\n')
    : '';
}

/**
 * Find task in transcript
 */
async function transcriptTask(client, task) {
  const record = await client.invoke('session.transcript', {
    employee: task.employeeId,
    thinking: false
  });

  const items = record.shown ?? record.items ?? [];
  const index = items.findIndex(i =>
    i.role === 'user' &&
    (task.receipt?.messageId && i.outbound?.taskId === task.receipt.messageId ||
     i.text === task.prompt)
  );

  if (index < 0) return null;

  const next = items.findIndex((item, n) => n > index && item.role === 'user');
  const range = items.slice(index + 1, next < 0 ? undefined : next);
  const texts = range.map(textOf).filter(Boolean);

  return {
    messageId: items[index].outbound?.taskId,
    text: texts.at(-1) ?? null
  };
}

/**
 * Execute a research task with an agent
 */
async function execute(state, ctx, key, worker, kind, payload, validate) {
  let task = state.tasks[key];

  // Return if already completed
  if (task?.status === 'completed') return task.result;

  // Initialize task
  if (!task) {
    const taskId = ctx.id + '/' + key;
    task = state.tasks[key] = {
      taskId,
      role: worker.role,
      label: getTaskLabel(kind),
      employeeId: worker.id,
      engine: worker.engine,
      status: 'prepared',
      startedAt: Date.now(),
      deadline: Date.now() + 15 * 60 * 1000 // 15 minutes
    };
    task.prompt = buildPrompt(state, taskId, kind, payload);
    await ctx.checkpoint(state);
  }

  const call = (name, args) => ctx.client.invoke(name, args);

  try {
    // Send task if not yet sent
    if (!task.receipt) {
      const status = (await call('session.status', { employee: worker.id }))[0];
      if (!status) throw Error('研究员工已删除');

      if (status.busy) {
        const owned = await transcriptTask(ctx.client, task);
        if (owned?.messageId === status.currentTask?.messageId) {
          task.receipt = { messageId: owned.messageId };
        } else {
          throw Error('该员工正在执行另一项工作，稍后恢复');
        }
      }

      if (!task.receipt) {
        task.receipt = await call('session.send', {
          employee: worker.id,
          text: task.prompt,
          clientMessageId: task.taskId
        });
      }

      if (!task.receipt?.messageId) {
        throw Error('消息接收结果不完整');
      }

      task.status = 'running';
      delete task.error;
      await ctx.checkpoint(state);
    }

    // Poll for completion
    let idleSince = 0;
    while (true) {
      ctx.signal.throwIfAborted();

      const status = (await call('session.status', { employee: worker.id }))[0];
      if (!status) throw Error('研究员工已删除');

      // Handle approval state
      if (status.waitingApproval) {
        if (task.status !== 'approval') {
          task.status = 'approval';
          state.attention = {
            employeeId: worker.id,
            message: worker.label + ' 需要 Infra 审批'
          };
          await ctx.checkpoint(state);
        }
      } else if (task.status === 'approval') {
        task.status = 'running';
        state.attention = null;
        await ctx.checkpoint(state);
      }

      // Check for completion
      if (!status.busy && !status.acknowledging && !status.waitingApproval) {
        const transcript = await transcriptTask(ctx.client, task);

        if (transcript?.text) {
          let result;
          try {
            result = validate(parseAnswer(transcript.text, task.taskId));
          } catch (error) {
            task.failureKind = 'format';
            throw error;
          }

          task.status = 'completed';
          task.result = result;
          task.finishedAt = Date.now();
          state.attention = null;
          await ctx.checkpoint(state);
          return result;
        }

        idleSince ||= Date.now();
        if (Date.now() - idleSince > 2500) {
          task.failureKind = 'no-result';
          throw Error('员工执行已结束，但没有对应的完整 JSON 结果');
        }
      } else {
        idleSince = 0;
      }

      if (Date.now() > task.deadline) {
        task.failureKind = 'timeout';
        throw Error('等待员工超时；原请求已保存，恢复会继续跟踪');
      }

      await delay(450, ctx.signal);
    }
  } catch (error) {
    if (!ctx.signal.aborted) {
      task.status = 'failed';
      task.error = error.message;
      task.failureKind ??= 'transport';
      await ctx.checkpoint(state);
    }
    throw error;
  }
}

/**
 * Ask a research agent to perform a task
 */
export async function ask(state, ctx, key, role, kind, payload, validate) {
  const worker = state.workers.find(w => w.role === role);
  if (!worker) throw Error('研究角色尚未就绪: ' + role);

  try {
    return await execute(state, ctx, key, worker, kind, payload, validate);
  } catch (error) {
    ctx.signal.throwIfAborted();

    // Retry with format correction if it's a format error
    if (state.tasks[key]?.failureKind !== 'format') throw error;

    return execute(state, ctx, key + '-format-fix', worker, kind, {
      ...payload,
      formatCorrection: error.message,
      previousInstruction: '保留事实，修正结构；不要解释修复过程，只返回完整 JSON。'
    }, validate);
  }
}

/**
 * Cancel all research tasks
 */
export async function cancel(state, ctx) {
  const failures = [];

  for (const task of Object.values(state.tasks)) {
    if (task.status === 'completed') continue;

    try {
      const status = (await ctx.client.invoke('session.status', {
        employee: task.employeeId
      }))[0];

      if (!status) continue;

      let messageId = task.receipt?.messageId;
      if (!messageId) {
        messageId = (await transcriptTask(ctx.client, task))?.messageId;
      }
      if (!messageId) continue;

      if (status.busy && status.currentTask?.messageId === messageId) {
        await ctx.client.invoke('session.interrupt', {
          employee: task.employeeId,
          expectedMessageId: messageId
        });
      } else if (task.receipt?.queued) {
        await ctx.client.invoke('session.dequeue', {
          employee: task.employeeId,
          messageId
        });
      }
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length) {
    throw Error('研究已停止，但部分任务取消未确认：' + failures.join('；'));
  }
}

// Helper functions

function getTaskLabel(kind) {
  const labels = {
    plan: '规划研究路线',
    search: '搜索来源',
    extract: '提取信息',
    verify: '验证证据',
    synthesize: '知识整合',
    write: '撰写报告',
    review: '质量审查'
  };
  return labels[kind] || kind;
}

function buildPrompt(state, taskId, kind, payload) {
  const base = [
    '[AEXUS_DEEP_RESEARCH_TASK]',
    JSON.stringify({ taskId, kind, payload }),
    '你是 Deep Research 引擎的研究员工，协作与权限由 Aexus Infra 管理。',
    '',
    '首次启动时，必须先通过 documentation 工具读取：',
    '1. operation: "identity" - 你的员工身份和角色定义',
    '2. operation: "index" - 共享工具 API 索引',
    '',
    '本任务需要分析材料并返回 JSON，不要生成脚本、HTML 或调用模型/文件/终端工具。',
    '只使用用户明确提供的材料和你通过工具获得的验证信息。',
    '所有来源必须可验证，引用必须准确，不得编造数据。'
  ];

  // Add task-specific instructions based on kind
  const instructions = getTaskInstructions(kind, payload);

  return [...base, '', instructions, '', 'taskId 必须原样返回。'].join('\n');
}

function getTaskInstructions(kind, payload) {
  const templates = {
    plan: `分析研究主题，规划调查维度和关键问题。

返回 JSON 格式：
{
  "taskId": "原样返回接收到的 taskId",
  "dimensions": [
    {
      "query": "具体的调查问题（字符串）",
      "rationale": "为什么这个维度重要"
    }
  ],
  "strategy": "研究策略说明",
  "estimatedTime": 预计时间（分钟数）
}

注意：dimensions 必须是数组，每个元素的 query 必须是字符串，不能是对象。`,

    search: `搜索相关来源，评估可信度，提取关键信息。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "sources": [
    {
      "type": "web",
      "title": "来源标题",
      "url": "完整URL",
      "snippet": "关键摘要"
    }
  ]
}`,

    extract: `从来源中提取事实、数据、论点，保持准确性。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "findings": [
    {
      "claim": "发现的事实或论点",
      "evidence": "支持证据",
      "sourceId": "来源ID"
    }
  ]
}`,

    verify: `交叉验证信息，检测矛盾，评估证据强度。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "verified": [
    {
      "findingId": "发现ID",
      "status": "confirmed|disputed|uncertain",
      "confidence": 0.0-1.0,
      "notes": "验证说明"
    }
  ]
}`,

    synthesize: `整合发现，构建知识图谱，发现模式和联系。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "synthesis": {
    "keyThemes": ["主题1", "主题2"],
    "connections": [
      {
        "from": "概念A",
        "to": "概念B",
        "relationship": "关系类型"
      }
    ],
    "insights": ["洞察1", "洞察2"]
  }
}`,

    write: `组织叙事，撰写清晰报告，管理引用。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "report": {
    "title": "报告标题",
    "sections": [
      {
        "heading": "章节标题",
        "content": "正文内容",
        "citations": ["source-id-1", "source-id-2"]
      }
    ]
  }
}`,

    review: `审查报告质量、准确性、完整性。

返回 JSON 格式：
{
  "taskId": "原样返回",
  "verdict": "pass|revise",
  "issues": [
    {
      "severity": "critical|warning|note",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ]
}`
  };

  return templates[kind] || '执行研究任务并返回 JSON 结果。';
}
