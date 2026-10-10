import { useState } from "react";
import type { OverviewRegion, TopicGuide } from "./overview";
import "./overview.css";

export function SemanticOverview({
  regions, topics, total, onFocus, onShowRaw,
}: {
  regions: readonly OverviewRegion[];
  topics?: readonly TopicGuide[];
  total: number;
  onFocus: (id: string) => void;
  onShowRaw: () => void;
}) {
  const [topicsExpanded, setTopicsExpanded] = useState(false);
  const done = regions.reduce((count, region) => count + region.completed, 0);
  const active = regions.reduce((count, region) => count + region.running, 0);
  const needsAttention = regions.reduce((count, region) => count + region.failed, 0);
  const other = regions.reduce((count, region) => count + region.other, 0);
  return (
    <section className="dr-graph-semantic-overview" aria-label="研究地图区域总览">
      <header className="dr-graph-semantic-header">
        <div>
          <span>研究路线概览</span>
          <strong>{total} 个真实任务 · {regions.length} 个可探索区域</strong>
          <p>按照当前画布的位置分组，仅用于导航。每个区域对应真实任务及原有依赖关系。</p>
          <div className="dr-graph-semantic-summary">
            <span>{done} 已完成</span>
            <span>{active} 进行中</span>
            {needsAttention > 0 && <span className="attention">{needsAttention} 需处理</span>}
            {other > 0 && <span>{other} 暂停/其他状态</span>}
          </div>
        </div>
        <button type="button" onClick={onShowRaw} aria-label="查看原始连线">
          <span className="codicon codicon-git-merge" aria-hidden="true" />
          查看原始连线
        </button>
      </header>
      {!!topics?.length && <section className="dr-graph-topic-guide" aria-label="按真实研究方向探索">
        <div className="dr-graph-topic-guide-header">
          <strong>按研究方向探索</strong>
          <span>{topics.length} 个已规划方向 · 关联任务与来源来自当前研究记录</span>
        </div>
        <div className="dr-graph-topic-guide-list">
          {(topicsExpanded ? topics : topics.slice(0, 8)).map(topic =>
            <button type="button" key={topic.id}
              title={topic.title}
              onClick={() => onFocus(topic.focusId)}
              aria-label={`进入研究方向 ${topic.title}`}>
              <strong>{topic.title}</strong>
              <small>{topic.tasks} 项任务 · {topic.status === "linked-findings"
                ? `${topic.findings} 条已关联发现`
                : topic.status === "verified-material"
                ? `${topic.verifiedSources} 项已核验资料`
                : topic.status === "read-pending-verification"
                ? `${topic.readSources} 项已读待核验`
                : topic.status === "candidates-only"
                ? `${topic.candidateSources} 项候选来源`
                : "尚待评估"}
              </small>
            </button>)}
        </div>
        {topics.length > 8 && <button type="button" className="dr-graph-topics-more"
          onClick={() => setTopicsExpanded(value => !value)}>
          {topicsExpanded ? "收起研究方向" : `查看其余 ${topics.length - 8} 个研究方向`}
        </button>}
      </section>}
      <div className="dr-graph-semantic-grid">
        {regions.map(region =>
          <button type="button" className="dr-graph-semantic-region"
            key={region.id} onClick={() => onFocus(region.focusId)}
            aria-label={`进入研究区域 ${region.index + 1}，包含 ${region.total} 项任务`}>
            <div className="dr-graph-region-top">
              <span>区域 {String(region.index + 1).padStart(2, "0")}</span>
              <small>第 {region.startIndex}—{region.endIndex} 项</small>
            </div>
            <strong title={region.firstLabel}>{region.firstLabel}</strong>
            {region.lastLabel !== region.firstLabel &&
              <p title={region.lastLabel}>至 {region.lastLabel}</p>}
            <div className="dr-graph-region-status" aria-label="区域任务状态">
              <span>{region.completed} 完成</span>
              <span>{region.running} 进行中</span>
              <span>{region.pending} 待执行</span>
              {region.failed > 0 && <span className="attention">{region.failed} 需处理</span>}
              {region.other > 0 && <span>{region.other} 暂停/其他</span>}
            </div>
            <div className="dr-graph-region-links">
              <small>跨区依赖 · 上游 {region.incoming} / 下游 {region.outgoing}</small>
              <span>进入此区域 <span className="codicon codicon-arrow-right" aria-hidden="true" /></span>
            </div>
          </button>)}
      </div>
    </section>
  );
}
