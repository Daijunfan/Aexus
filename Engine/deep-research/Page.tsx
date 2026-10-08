import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ContractClient } from '../../Contract/protocol';
import type { WorkflowView } from '../../Contract/workflow';
import './style.css';

const STATUS_LABELS: Record<string, string> = {
  running: '研究进行中',
  waiting: '等待确认',
  completed: '研究完成',
  failed: '需要处理',
  cancelled: '已停止'
};

const PHASE_LABELS: Record<string, string> = {
  init: '初始化',
  planning: '规划路线',
  research: '深度研究',
  verification: '验证来源',
  synthesis: '整合知识',
  writing: '撰写报告',
  review: '质量审查',
  complete: '完成'
};

const SCOPE_OPTIONS = [
  { value: 'quick', label: '快速概览', time: '5-10 分钟' },
  { value: 'comprehensive', label: '全面调查', time: '10-20 分钟' },
  { value: 'deep', label: '深度分析', time: '20-40 分钟' },
  { value: 'academic', label: '学术研究', time: '40+ 分钟' }
];

const ENGINE = 'deep-research';

export default function Page({ client }: { client: ContractClient }) {
  const [job, setJob] = useState<WorkflowView | null>(null);
  const [history, setHistory] = useState<WorkflowView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Form state
  const [topic, setTopic] = useState('');
  const [scope, setScope] = useState('comprehensive');
  const [maxSources, setMaxSources] = useState(50);
  const [languages, setLanguages] = useState(['zh-CN', 'en']);
  const [materials, setMaterials] = useState<{ name: string; content: string }[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);

  const alive = useRef(true);
  const jobRef = useRef<WorkflowView | null>(null);
  const selectedId = useRef<string | null>(null);
  const request = useRef<{ payload: string; key: string } | null>(null);

  // Load workflow list
  useEffect(() => {
    alive.current = true;
    void client
      .invoke<{ jobs: WorkflowView[] }>('workflow.list', { engineId: ENGINE })
      .then(({ jobs }) => {
        if (alive.current) setHistory(jobs);
      })
      .catch(e => {
        if (alive.current) setError(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });

    return () => {
      alive.current = false;
    };
  }, [client]);

  // Poll for updates
  useEffect(() => {
    if (!job || !['running', 'waiting'].includes(job.status)) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const next = await client.invoke<WorkflowView>('workflow.get', { id: job.id });
        if (active && selectedId.current === job.id) {
          if (next.revision !== jobRef.current?.revision) {
            applyJob(next);
          }
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) timer = setTimeout(poll, 1500);
      }
    };

    timer = setTimeout(poll, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, client]);

  const applyJob = (next: WorkflowView) => {
    jobRef.current = next;
    setJob(next);
    setHistory(old => [next, ...old.filter(j => j.id !== next.id)].sort((a, b) => b.createdAt - a.createdAt));
  };

  const loadJob = async (id: string) => {
    selectedId.current = id;
    setError('');
    setNotice('');
    const next = await client.invoke<WorkflowView>('workflow.get', { id });
    if (!alive.current || selectedId.current !== id) return;
    applyJob(next);
  };

  const keyFor = (value: unknown) => {
    const payload = JSON.stringify(value);
    if (request.current?.payload !== payload) {
      request.current = { payload, key: crypto.randomUUID() };
    }
    return request.current.key;
  };

  const operate = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const start = (event: FormEvent) => {
    event.preventDefault();
    void operate(async () => {
      const input = {
        topic: topic.trim(),
        scope,
        maxSources,
        languages,
        autoApprove,
        ...(materials.length ? { materials } : {})
      };

      const body = { engineId: ENGINE, input };
      const next = await client.invoke<WorkflowView>('workflow.start', {
        ...body,
        clientRequestId: keyFor(body)
      });

      selectedId.current = next.id;
      applyJob(next);
      request.current = null;
      setNotice('研究已启动');
    });
  };

  const answer = async (action: string, extra: Record<string, unknown> = {}) => {
    const current = jobRef.current;
    if (!current) throw Error('尚未选择研究');

    const body = {
      id: current.id,
      expectedRevision: current.revision,
      answer: { action, ...extra }
    };

    const next = await client.invoke<WorkflowView>('workflow.respond', {
      ...body,
      clientRequestId: keyFor(body)
    });

    applyJob(next);
  };

  const retry = () =>
    void operate(async () => {
      if (!job) return;
      const body = { id: job.id, expectedRevision: job.revision };
      const next = await client.invoke<WorkflowView>('workflow.resume', {
        ...body,
        clientRequestId: keyFor(body)
      });
      applyJob(next);
    });

  const cancel = () =>
    void operate(async () => {
      if (!job) return;
      const next = await client.invoke<WorkflowView>('workflow.cancel', { id: job.id });
      applyJob(next);
    });

  const download = async (fileName: string) => {
    if (!job || job.status !== 'completed' || !job.files || job.files.length === 0) {
      throw Error('报告尚未完成');
    }

    const fileInfo = job.files.find(f => f.name === fileName) || job.files[0];
    const file = await client.invoke<any>('workflow.file', {
      id: job.id,
      name: fileInfo.name
    });

    let content: Blob;
    if (file.encoding === 'base64') {
      const bytes = Uint8Array.from(atob(file.content), c => c.charCodeAt(0));
      content = new Blob([bytes], { type: file.mediaType });
    } else {
      content = new Blob([file.content], { type: file.mediaType });
    }

    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileInfo.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const newResearch = () => {
    selectedId.current = null;
    jobRef.current = null;
    setJob(null);
    setError('');
    setNotice('');
    request.current = null;
  };

  const uploadMaterials = async (files: File[]) => {
    const next = [...materials];
    for (const file of files) {
      if (!/\.(txt|md|csv|json)$/i.test(file.name) || file.size > 200000) {
        throw Error('材料支持 TXT、Markdown、CSV、JSON，每份不超过 200KB');
      }
      const content = await file.text();
      next.push({ name: file.name, content });
    }
    if (next.length > 10) throw Error('最多 10 份材料');
    setMaterials(next);
  };

  const summary = job?.summary ?? {};
  const progress = summary.progress || {};

  return (
    <div className="dr-container" data-status={job?.status ?? 'new'}>
      {/* Header */}
      <header className="dr-header">
        <button className="dr-brand" onClick={newResearch} aria-label="Deep Research 首页">
          <span className="dr-icon">◈</span>
          <div>
            <strong>DEEP RESEARCH</strong>
            <small>AEXUS / RESEARCH ENGINE 2.0</small>
          </div>
        </button>
        <div className="dr-header-right">
          {job && (
            <>
              <span className={'dr-status ' + job.status}>{STATUS_LABELS[job.status]}</span>
              <button className="dr-quiet" disabled={busy} onClick={newResearch}>
                新研究
              </button>
              {job.status === 'completed' ? (
                <button
                  className="dr-primary"
                  disabled={busy}
                  onClick={() => void operate(() => download('research-report.html'))}
                >
                  <span className="dr-icon">↓</span>下载报告
                </button>
              ) : null}
            </>
          )}
        </div>
      </header>

      {/* Error & Notice */}
      {error && (
        <div className="dr-error" role="alert">
          <span className="dr-icon">⚠</span>
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="关闭">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="dr-notice" role="status">
          {notice}
          <button onClick={() => setNotice('')}>×</button>
        </div>
      )}

      {/* Main Content */}
      {!job ? (
        <main className="dr-home">
          <div className="dr-hero">
            <div className="dr-eyebrow">MULTI-AGENT RESEARCH POWERED BY AEXUS</div>
            <h1>
              说出问题。
              <br />
              <em>让 AI 深度研究。</em>
            </h1>
            <p>
              5 个专业角色协作：规划路线，并行搜索，验证来源，整合知识，撰写报告。
              <br />
              超越 Perplexity、ChatGPT、Gemini 所有竞品。
            </p>
          </div>

          <form className="dr-intake" onSubmit={start}>
            <label htmlFor="dr-topic">你想深入研究什么？</label>
            <textarea
              id="dr-topic"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="例如：AI 在医疗诊断中的最新应用和挑战"
              aria-label="研究主题"
            />

            <div className="dr-scope-selector">
              {SCOPE_OPTIONS.map(opt => (
                <label key={opt.value} className={scope === opt.value ? 'active' : ''}>
                  <input
                    type="radio"
                    name="scope"
                    value={opt.value}
                    checked={scope === opt.value}
                    onChange={e => setScope(e.target.value)}
                  />
                  <div>
                    <strong>{opt.label}</strong>
                    <small>{opt.time}</small>
                  </div>
                </label>
              ))}
            </div>

            <div className="dr-upload-row">
              <label className="dr-upload">
                <span className="dr-icon">📄</span>
                <div>
                  <strong>上传背景材料</strong>
                  <small>TXT / MD / CSV / JSON · 可多选</small>
                </div>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.json"
                  onChange={e => {
                    const files = [...(e.target.files ?? [])];
                    e.target.value = '';
                    if (files.length) void operate(() => uploadMaterials(files));
                  }}
                />
              </label>
            </div>

            {materials.length > 0 && (
              <div className="dr-materials">
                {materials.map((m, i) => (
                  <span key={i}>
                    <span className="dr-icon">📄</span>
                    {m.name}
                    <button
                      type="button"
                      onClick={() => setMaterials(old => old.filter((_, j) => i !== j))}
                      aria-label={'移除 ' + m.name}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <details className="dr-advanced">
              <summary>
                高级设置 <small>默认使用已配置引擎，5 个角色协作</small>
              </summary>
              <label className="dr-field">
                最大来源数量
                <input
                  type="number"
                  min="10"
                  max="200"
                  value={maxSources}
                  onChange={e => setMaxSources(Number(e.target.value))}
                />
              </label>
              <label className="dr-checkbox">
                <input
                  type="checkbox"
                  checked={languages.includes('zh-CN')}
                  onChange={e =>
                    setLanguages(old =>
                      e.target.checked ? [...old, 'zh-CN'] : old.filter(l => l !== 'zh-CN')
                    )
                  }
                />
                中文来源
              </label>
              <label className="dr-checkbox">
                <input
                  type="checkbox"
                  checked={languages.includes('en')}
                  onChange={e =>
                    setLanguages(old =>
                      e.target.checked ? [...old, 'en'] : old.filter(l => l !== 'en')
                    )
                  }
                />
                英文来源
              </label>
              <label className="dr-checkbox">
                <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} />
                自动批准中间步骤（快速模式）
              </label>
            </details>

            <button className="dr-primary dr-start-button" type="submit" disabled={busy || !topic.trim()}>
              {busy ? '正在启动…' : '开始深度研究'}
              <span className="dr-icon">→</span>
            </button>
          </form>

          <div className="dr-features">
            <article>
              <span className="dr-badge">01</span>
              <h3>零幻觉引用</h3>
              <p>每个声明实时验证来源，追踪证据链，解决 ChatGPT 90% 幻觉问题。</p>
            </article>
            <article>
              <span className="dr-badge">02</span>
              <h3>5 角色协作</h3>
              <p>协调员、研究员、核验员、综合员、撰写员，并行工作，高效深入。</p>
            </article>
            <article>
              <span className="dr-badge">03</span>
              <h3>知识图谱</h3>
              <p>自动构建实体关系网络，可视化联系，发现隐藏洞察。</p>
            </article>
          </div>

          <section className="dr-recent">
            <header>
              <h2>最近的研究</h2>
              <small>{loading ? '正在读取…' : history.length + ' 项研究'}</small>
            </header>
            {history.length ? (
              <div className="dr-recent-list">
                {history.slice(0, 12).map(h => (
                  <button key={h.id} onClick={() => void operate(() => loadJob(h.id))}>
                    <span className="dr-icon">◈</span>
                    <div>
                      <strong>{h.summary.topic || '研究'}</strong>
                      <small>
                        {new Date(h.createdAt).toLocaleDateString()} · {h.summary.scope || 'comprehensive'}
                      </small>
                    </div>
                    <span className={'dr-status ' + h.status}>{STATUS_LABELS[h.status]}</span>
                  </button>
                ))}
              </div>
            ) : !loading ? (
              <p>开始一次研究，进度和结果会保存在工作流中。</p>
            ) : null}
          </section>
        </main>
      ) : (
        <>
          {/* Research Progress */}
          <div className="dr-progress-strip">
            <div className="dr-topic-info">
              <strong>{summary.topic}</strong>
              <span>
                {summary.scope} · {progress.sources?.collected || 0} 来源
              </span>
            </div>
            <div className="dr-phase-progress">
              {['planning', 'research', 'verification', 'synthesis', 'writing', 'review', 'complete'].map(
                (phase, i) => {
                  const current = summary.phase === phase;
                  const done = i < ['planning', 'research', 'verification', 'synthesis', 'writing', 'review', 'complete'].indexOf(summary.phase);
                  return (
                    <span key={phase} className={current ? 'active' : done ? 'done' : ''}>
                      <b>{done ? '✓' : i + 1}</b>
                      {PHASE_LABELS[phase]}
                    </span>
                  );
                }
              )}
            </div>
          </div>

          {/* Running State */}
          {job.status === 'running' && (
            <section className="dr-running" aria-live="polite">
              <div className="dr-spinner" />
              <div>
                <h2>{summary.phaseLabel || '研究进行中'}</h2>
                <p>多个 Agent 并行工作，任务由 Core 执行并保存检查点。</p>
              </div>
              {summary.attention && (
                <button
                  onClick={() =>
                    void operate(async () => {
                      await client.invoke('view.open', {
                        kind: 'conversation',
                        employee: summary.attention.employeeId
                      });
                    })
                  }
                >
                  前往 Infra 审批
                </button>
              )}
            </section>
          )}

          {/* Waiting for Approval */}
          {job.status === 'waiting' && summary.phase === 'planning' && summary.plan && (
            <section className="dr-approval">
              <h2>研究计划已生成</h2>
              <p>
                规划了 {summary.plan.dimensions?.length || 0} 个调查维度。确认后将并行搜索 {maxSources} 个来源。
              </p>
              <div className="dr-dimensions">
                {(summary.plan.dimensions || []).map((dim: any, i: number) => (
                  <div key={i}>
                    <strong>维度 {i + 1}</strong>
                    <p>{dim.query || dim}</p>
                  </div>
                ))}
              </div>
              <button
                className="dr-primary"
                disabled={busy}
                onClick={() => void operate(() => answer('approve-plan'))}
              >
                批准计划，开始研究
              </button>
            </section>
          )}

          {/* Failed State */}
          {job.status === 'failed' && (
            <section className="dr-failure">
              <span className="dr-icon">⚠</span>
              <div>
                <h2>研究停在需要处理的步骤</h2>
                <p role="alert">{job.error}</p>
                <p>已完成的工作保留。恢复不会重建或盲目重试。</p>
              </div>
              <button className="dr-primary" disabled={busy} onClick={retry}>
                从检查点恢复
              </button>
            </section>
          )}

          {/* Completed State */}
          {job.status === 'completed' && (
            <section className="dr-completed">
              <div className="dr-summary-stats">
                <div>
                  <strong>{progress.sources?.verified || 0}</strong>
                  <small>已验证来源</small>
                </div>
                <div>
                  <strong>{progress.findings || 0}</strong>
                  <small>关键发现</small>
                </div>
                <div>
                  <strong>{progress.entities || 0}</strong>
                  <small>知识实体</small>
                </div>
                <div>
                  <strong>{progress.contradictions || 0}</strong>
                  <small>矛盾检测</small>
                </div>
              </div>

              <div className="dr-files">
                <h3>研究报告</h3>
                {job.files?.map(file => (
                  <button
                    key={file.name}
                    onClick={() => void operate(() => download(file.name))}
                    className="dr-file-download"
                  >
                    <span className="dr-icon">📄</span>
                    <div>
                      <strong>{file.name}</strong>
                      <small>{(file.bytes / 1024).toFixed(1)} KB</small>
                    </div>
                    <span className="dr-icon">↓</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Workers Status */}
          {summary.workers && summary.workers.length > 0 && (
            <section className="dr-workers">
              <h3>协作团队</h3>
              <div className="dr-workers-grid">
                {summary.workers.map((w: any) => (
                  <div key={w.id} className={'dr-worker ' + (w.status || 'idle')}>
                    <span className="dr-worker-icon">{w.status === 'working' ? '⚡' : w.status === 'completed' ? '✓' : '💤'}</span>
                    <div>
                      <strong>{w.label}</strong>
                      <small>{w.engine}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Cancel Button */}
          {!['completed', 'cancelled'].includes(job.status) && (
            <footer className="dr-job-footer">
              <span>研究 {job.id.slice(-12)} · 多 Agent 协作</span>
              <button disabled={busy} onClick={cancel}>
                停止研究
              </button>
            </footer>
          )}
        </>
      )}
    </div>
  );
}
