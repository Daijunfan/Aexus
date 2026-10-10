import { useState } from "react";
import { independentlyRead, sourceHost, type ResearchNode, type ResearchFinding, type ResearchReport, type ResearchSource } from "./ui";
import {
  focusAreas, extractMatrices, extractTopicTimeline, compareFindings,
  nodeInsight, clean, type ResearchMatrix,
} from "./ResearchInsights";

export type BoardItem = { type: "node" | "finding"; id: string; note: string };

type Common = {
  nodes: ResearchNode[];
  findings: ResearchFinding[];
  report?: ResearchReport | null;
  onNode: (id: string) => void;
  onFinding: (id: string) => void;
  onDrill: (topic: string) => void;
  onPin: (item: BoardItem) => void;
  pinned: BoardItem[];
};

const visibleNodes = (nodes: ResearchNode[]) =>
  nodes.filter(n => n.active !== false && n.status !== "superseded");
const pinned = (list: BoardItem[], type: BoardItem["type"], id: string) =>
  list.some(item => item.type === type && item.id === id);

export function ResearchOverview({
  nodes, findings, report, sources, onNode, onFinding, onDrill, onPin, pinned: board,
  onCompare, onBoard, onTimeline, onSources,
}: Common & {
  sources: ResearchSource[];
  onCompare: () => void;
  onBoard: () => void;
  onTimeline: () => void;
  onSources: () => void;
}) {
  const areas = focusAreas(nodes);
  const readSources = sources.filter(independentlyRead);
  const hostCounts = new Map<string, number>();
  for (const source of sources) {
    const host = sourceHost(source.url);
    if (host) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
  }
  const rankedHosts = [...hostCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const readHosts = new Set(readSources.map(source => sourceHost(source.url)).filter(Boolean)).size;
  const insights = findings.length
    ? findings.slice(0, 8).map(finding => ({ id: finding.id, type: "finding" as const, text: finding.claim }))
    : visibleNodes(nodes).filter(n => !!nodeInsight(n)).slice(0, 8)
      .map(node => ({ id: node.id, type: "node" as const, text: nodeInsight(node) }));
  const complete = visibleNodes(nodes).filter(n => n.status === "completed").length;
  const gaps = visibleNodes(nodes).filter(n => n.status === "pending" || n.status === "failed").length;
  const tables = extractMatrices(report);
  return (
    <section className="dr-studio dr-overview" aria-label="研究成果总览">
      <div className="dr-studio-hero">
        <span className="dr-studio-kicker">RESEARCH / OVERVIEW</span>
        <h2>{report?.title || "研究全貌"}</h2>
        <p>{clean(report?.abstract || "").slice(0, 430) || "研究发现将随着任务完成逐步出现。先从研究范围进入，查看每条分支正在回答的问题。"}</p>
        <div className="dr-studio-stats">
          <span><strong>{complete}</strong> 已完成任务</span>
          <span><strong>{insights.length}</strong> 可读发现</span>
          <span><strong>{areas.length}</strong> 研究分支</span>
          <span><strong>{gaps}</strong> 待处理任务</span>
          <span><strong>{sources.length}</strong> 已发现资料</span>
        </div>
      </div>
      <div className="dr-studio-actions">
        <button onClick={onCompare}>查看比较矩阵 {tables.length ? "(" + tables.length + ")" : ""} →</button>
        <button onClick={onTimeline}>时间与变化 →</button>
        <button onClick={onBoard}>成果板 {board.length ? "(" + board.length + ")" : ""} →</button>
      </div>
      <div className="dr-studio-section-heading">
        <div><span className="dr-studio-kicker">SCOPE / COVERAGE</span><h3>研究范围地图</h3></div>
        <small>按计划任务分支整理；进度代表相关任务执行情况，并非知识覆盖率</small>
      </div>
      {areas.length ? <div className="dr-coverage-grid">
        {areas.map(area => {
          const percent = area.total ? Math.round(area.completed / area.total * 100) : 0;
          return <article className="dr-coverage-card" key={area.id}>
            <button className="dr-coverage-main" onClick={() => onNode(area.id)}>
              <div><strong>{area.title}</strong><span>{area.completed}/{area.total} 相关任务</span></div>
              <span className="dr-coverage-track"><i style={{ width: percent + "%" }}/></span>
              <small>{area.running ? area.running + " 项进行中" : area.pending ? area.pending + " 项待执行" : "查看研究内容"}</small>
              {area.insight && <p>{area.insight}</p>}
            </button>
            <button className="dr-tertiary" onClick={() => onDrill("继续调查「" + area.title + "」，补充尚未覆盖的角度、反例和典型案例。")}>补充这一方向 ↗</button>
          </article>;
        })}
      </div> : <div className="dr-studio-empty">正在形成研究计划；有计划节点后将在此展示范围分布。</div>}
      <div className="dr-studio-section-heading">
        <div><span className="dr-studio-kicker">BREADTH / MATERIALS</span><h3>资料分布</h3></div>
        <button onClick={onSources}>浏览所有资料 ↗</button>
      </div>
      <div className="dr-source-breadth">
        <div className="dr-breadth-metrics">
          <span><strong>{hostCounts.size}</strong> 已发现网站</span>
          <span><strong>{readHosts}</strong> 实读网站</span>
          <span><strong>{readSources.length}</strong> 独立读取资料</span>
          <span><strong>{sources.length}</strong> 已发现来源</span>
        </div>
        {rankedHosts.length > 0 ? <div className="dr-breadth-hosts">
          {rankedHosts.map(([host, count]) => <div key={host}>
            <span title={host}>{host}</span><div className="dr-coverage-track"><i style={{width: Math.round(count * 100 / Math.max(1, sources.length)) + "%"}}/></div><b>{count}</b>
          </div>)}
        </div> : <p className="dr-studio-muted">暂无网站分布资料。</p>}
      </div>
      <div className="dr-studio-section-heading">
        <div><span className="dr-studio-kicker">FINDINGS</span><h3>当前值得看的发现</h3></div>
        <small>点击可定位到对应研究内容</small>
      </div>
      {insights.length ? <div className="dr-insight-list">
        {insights.map((insight, index) => <article key={insight.type + insight.id}>
          <span className="dr-insight-index">{String(index + 1).padStart(2, "0")}</span>
          <button className="dr-insight-text" onClick={() => insight.type === "node" ? onNode(insight.id) : onFinding(insight.id)}>
            {clean(insight.text).slice(0, 360)}
          </button>
          <button aria-label={"收藏发现 " + (index + 1)} className="dr-tertiary" onClick={() => onPin({type: insight.type, id: insight.id, note: ""})}>
            {pinned(board, insight.type, insight.id) ? "已收藏 ✓" : "收藏"}
          </button>
        </article>)}
      </div> : <div className="dr-studio-empty">暂无可展示的研究结论，稍后将自动填充。</div>}
    </section>
  );
}

function createMatrix(name: string, candidates: string, dimensions: string): ResearchMatrix | null {
  const columns = candidates.split(/[，,;\n]/).map(v => v.trim()).filter(Boolean);
  const rows = dimensions.split(/[，,;\n]/).map(v => v.trim()).filter(Boolean);
  if (columns.length < 2 || rows.length < 1) return null;
  return {
    id: "custom", title: name.trim() || "我的比较矩阵",
    columns: columns.slice(0, 12),
    rows: rows.slice(0, 35).map(label => ({ label, values: columns.slice(0, 12).map(() => "") })),
  };
}

export function ResearchComparison({
  report, draft, onDraft, onDrill,
}: {
  report?: ResearchReport | null;
  draft: ResearchMatrix | null;
  onDraft: (value: ResearchMatrix | null) => void;
  onDrill: (topic: string) => void;
}) {
  const extracted = extractMatrices(report);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [candidates, setCandidates] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [filter, setFilter] = useState("");
  const [addRow, setAddRow] = useState("");
  const matrices = [...extracted, ...(draft ? [draft] : [])];
  const current = matrices.find(table => table.id === selected) ?? matrices[0];
  const editable = current?.id === "custom";
  const update = (fn: (value: ResearchMatrix) => ResearchMatrix) => {
    if (draft) onDraft(fn(draft));
  };
  return <section className="dr-studio dr-comparison" aria-label="研究比较矩阵">
    <div className="dr-studio-section-heading">
      <div><span className="dr-studio-kicker">COMPARE / DECIDE</span><h2>比较矩阵</h2></div>
      <small>矩阵内容来自报告表格或由你手动补充；空白表示尚未填写</small>
    </div>
    <div className="dr-studio-toolbar">
      {matrices.length > 1 && <label>选择矩阵 <select aria-label="选择比较矩阵" value={current?.id} onChange={e => setSelected(e.target.value)}>
        {matrices.map(matrix => <option key={matrix.id} value={matrix.id}>{matrix.title}</option>)}
      </select></label>}
      {current && <input aria-label="筛选比较维度" placeholder="筛选维度…" value={filter} onChange={e => setFilter(e.target.value)}/>}
      {current && !editable && <button onClick={() => {
        onDraft({ ...current, id: "custom", title: current.title + " · 我的副本", rows: current.rows.map(row => ({...row, values: [...row.values]})) });
        setSelected("custom");
      }}>复制并编辑矩阵</button>}
      {editable && <button onClick={() => { onDraft(null); setSelected(extracted[0]?.id ?? ""); }}>删除自建矩阵</button>}
    </div>
    {current && <div className="dr-matrix-scroll" role="region" aria-label="可横向滚动的比较表" tabIndex={0}>
      <table className="dr-matrix">
        <thead><tr><th scope="col">比较维度</th>{current.columns.map((column, index) => <th scope="col" key={index}>
          {editable ? <input aria-label={"比较对象 " + (index + 1)} value={column} onChange={e => update(d => ({
            ...d, columns: d.columns.map((v, i) => i === index ? e.target.value : v),
          }))}/> : column}
        </th>)}</tr></thead>
        <tbody>{current.rows.filter(row => row.label.toLowerCase().includes(filter.trim().toLowerCase())).map(row => {
          const rowIndex = current.rows.indexOf(row);
          return <tr key={rowIndex}>
            <th scope="row">{editable ? <input aria-label={"维度名称 " + (rowIndex + 1)} value={row.label} onChange={e => update(d => ({
              ...d, rows: d.rows.map((r,i) => i === rowIndex ? {...r,label:e.target.value} : r),
            }))}/> : row.label}</th>
            {current.columns.map((column, index) => <td key={index}>
              {editable ? <textarea aria-label={row.label + " / " + column} rows={2} value={row.values[index] ?? ""} onChange={e => update(d => ({
                ...d, rows: d.rows.map((r,i) => i === rowIndex ? {
                  ...r,values:r.values.map((v, j) => j === index ? e.target.value : v),
                } : r),
              }))}/> : <div className="dr-matrix-cell">{row.values[index] || <em>资料缺失</em>}</div>}
              {(!row.values[index] || !row.values[index].trim()) && <button className="dr-matrix-fill" onClick={() => onDrill("补充比较矩阵「" + current.title + "」中「" + column + "」在「" + row.label + "」维度的信息，并给出适用条件。")}>定向补查 ↗</button>}
            </td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>}
    {editable && <form className="dr-matrix-add" onSubmit={e => {
      e.preventDefault();
      if (addRow.trim() && draft && draft.rows.length < 35) {
        update(d => ({...d, rows:[...d.rows, {label:addRow.trim(),values:d.columns.map(() => "")}]}));
        setAddRow("");
      }
    }}>
      <input aria-label="新增比较维度" placeholder="新增比较维度" value={addRow} onChange={e => setAddRow(e.target.value)}/>
      <button type="submit" disabled={!addRow.trim() || (draft?.rows.length ?? 0) >= 35}>添加维度</button>
    </form>}
    {!current && <div className="dr-studio-empty">目前的研究报告尚无可比较的表格。可建立一个自定义矩阵，逐项补充或发起定向补查。</div>}
    <details className="dr-matrix-builder">
      <summary>{draft ? "重新建立自定义矩阵" : "＋ 新建自定义矩阵"}</summary>
      <form onSubmit={e => {
        e.preventDefault();
        const table = createMatrix(name, candidates, dimensions);
        if (table) {onDraft(table);setSelected("custom");}
      }}>
        <label>矩阵名称<input aria-label="新矩阵名称" value={name} onChange={e => setName(e.target.value)} placeholder="方案对比"/></label>
        <label>比较对象（至少两个，用逗号分隔）<textarea aria-label="新矩阵对象" value={candidates} onChange={e => setCandidates(e.target.value)} placeholder="方案 A, 方案 B"/></label>
        <label>比较维度（用逗号分隔）<textarea aria-label="新矩阵维度" value={dimensions} onChange={e => setDimensions(e.target.value)} placeholder="成本, 功能, 适用人群"/></label>
        <button type="submit" disabled={!createMatrix(name, candidates, dimensions)}>创建矩阵</button>
      </form>
    </details>
  </section>;
}

export function ResearchTimeline({
  report, findings, events, onDrill,
}: {
  report?: ResearchReport | null; findings: ResearchFinding[];
  events: {timestamp: number; description: string}[];
  onDrill: (topic: string) => void;
}) {
  const [mode, setMode] = useState<"topic" | "activity">("topic");
  const facts = extractTopicTimeline(report, findings);
  return <section className="dr-studio dr-topic-timeline" aria-label="时间线">
    <div className="dr-studio-section-heading"><div><span className="dr-studio-kicker">TIME / EVOLUTION</span><h2>时间与演变</h2></div></div>
    <div className="dr-studio-toolbar" role="group" aria-label="时间线类型">
      <button aria-pressed={mode === "topic"} onClick={() => setMode("topic")}>主题事件（{facts.length}）</button>
      <button aria-pressed={mode === "activity"} onClick={() => setMode("activity")}>研究过程（{events.length}）</button>
    </div>
    {mode === "topic" ? facts.length ? <ol className="dr-timeline">
      {facts.map(fact => <li key={fact.id}>
        <time>{fact.date}</time><div><p>{fact.text}</p><small>来自：{fact.source}</small></div>
      </li>)}
    </ol> : <div className="dr-studio-empty"><p>当前结论和报告中尚未提取到明确日期的主题事件。</p>
      <button onClick={() => onDrill("按时间顺序整理这一主题的重要事件、阶段变化和关键转折，明确事件日期与影响。")}>补查主题时间线 ↗</button>
    </div> : events.length ? <ol className="dr-timeline">
      {events.slice(-45).reverse().map((event, index) => <li key={index}>
        <time>{new Date(event.timestamp).toLocaleString("zh-CN")}</time><div><p>{event.description}</p><small>研究执行记录</small></div>
      </li>)}
    </ol> : <div className="dr-studio-empty">暂无研究过程记录。</div>}
  </section>;
}

export function ResearchUpdates({
  current, previous, revisions,
}: {
  current: ResearchFinding[];
  previous?: ResearchFinding[] | null;
  revisions: {version?: number; reason?: string; addedNodeIds?: string[]; retainedNodeIds?: string[]; removedNodeIds?: string[]}[];
}) {
  const comparison = previous ? compareFindings(previous, current) : null;
  return <section className="dr-studio dr-updates" aria-label="研究更新对比">
    <div className="dr-studio-section-heading">
      <div><span className="dr-studio-kicker">REVISIONS / DELTA</span><h2>研究更新</h2></div>
      <small>{previous ? "与上次研究中的论断逐条比较" : "当前计划的变更记录"}</small>
    </div>
    {comparison && <div className="dr-studio-stats">
      <span><strong>{comparison.retained}</strong> 内容一致</span>
      <span><strong>{comparison.changes.filter(c => c.kind === "added").length}</strong> 新增论断</span>
      <span><strong>{comparison.changes.filter(c => c.kind === "changed").length}</strong> 同 ID 内容变化</span>
      <span><strong>{comparison.changes.filter(c => c.kind === "removed").length}</strong> 本次未出现</span>
    </div>}
    {comparison?.changes.length ? <div className="dr-change-list">
      {comparison.changes.map((change, index) => <article key={change.kind + change.id + index}>
        <b>{change.kind === "added" ? "新增" : change.kind === "changed" ? "表述变化" : "本次未出现"}</b>
        {change.previous && <p><small>上次：</small>{change.previous}</p>}
        <p>{change.text}</p>
      </article>)}
    </div> : comparison ? <div className="dr-studio-empty">两次研究已提取的论断文本一致；其他资料和适用条件仍可在报告中检查。</div> : null}
    {revisions.length > 0 ? <div className="dr-change-list">
      <h3>计划演变</h3>
      {revisions.map((revision, index) => <article key={index}>
        <b>第 {revision.version ?? index + 1} 版</b>
        <p>{revision.reason || "研究计划调整记录"}</p>
        <small>{revision.addedNodeIds?.length ?? 0} 新增节点 · {revision.retainedNodeIds?.length ?? 0} 保留 · {revision.removedNodeIds?.length ?? 0} 移出</small>
      </article>)}
    </div> : !comparison ? <div className="dr-studio-empty">没有可对照的计划或父研究记录。</div> : null}
  </section>;
}

export function ResearchBoard({
  nodes, findings, pinned: board, onChange, onExport, onNode, onFinding,
}: {
  nodes: ResearchNode[];
  findings: ResearchFinding[];
  pinned: BoardItem[];
  onChange: (board: BoardItem[]) => void;
  onExport: () => void;
  onNode: (id: string) => void;
  onFinding: (id: string) => void;
}) {
  return <section className="dr-studio dr-board" aria-label="成果板">
    <div className="dr-studio-section-heading">
      <div><span className="dr-studio-kicker">COLLECT / PRESENT</span><h2>我的成果板</h2></div>
      <button disabled={!board.length} onClick={onExport}>导出视觉简报（HTML） ↗</button>
    </div>
    <p className="dr-studio-muted">从研究总览、发现或节点详情收藏内容，调整顺序并补充自己的说明。内容按当前研究保存于本机。</p>
    {board.length ? <div className="dr-board-items">
      {board.map((item, index) => {
        const node = item.type === "node" ? nodes.find(n => n.id === item.id) : null;
        const finding = item.type === "finding" ? findings.find(f => f.id === item.id) : null;
        const title = node?.label || (finding ? "研究发现" : "原内容已不可用");
        const content = node ? nodeInsight(node) || node.objective || node.description : finding?.claim;
        const move = (to: number) => {
          const list = [...board];
          const [removed] = list.splice(index, 1);
          list.splice(to, 0, removed);
          onChange(list);
        };
        return <article key={item.type + item.id}>
          <div className="dr-board-item-head">
            <span className="dr-insight-index">{String(index + 1).padStart(2, "0")}</span>
            <button onClick={() => node ? onNode(node.id) : finding && onFinding(finding.id)} disabled={!node && !finding}><strong>{title}</strong></button>
            <div className="dr-board-controls">
              <button aria-label={"上移成果 " + (index + 1)} disabled={index === 0} onClick={() => move(index - 1)}>↑</button>
              <button aria-label={"下移成果 " + (index + 1)} disabled={index === board.length - 1} onClick={() => move(index + 1)}>↓</button>
              <button aria-label={"移除成果 " + (index + 1)} onClick={() => onChange(board.filter((_, i) => i !== index))}>移除</button>
            </div>
          </div>
          <p>{content ? clean(content).slice(0, 800) : "这条内容在当前计划中已不可用，请从最新发现重新收藏。"}</p>
          <label>我的说明
            <textarea aria-label={"成果说明 " + (index + 1)} rows={2} value={item.note} onChange={e => onChange(board.map((b, i) => i === index ? {...b, note:e.target.value} : b))} placeholder="此发现为什么重要？想如何展示？"/>
          </label>
        </article>;
      })}
    </div> : <div className="dr-studio-empty">成果板尚为空。在研究总览、发现或节点详情点击“收藏”即可添加。</div>}
  </section>;
}
