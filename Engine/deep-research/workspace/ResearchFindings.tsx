import { useMemo, type ReactNode } from "react";
import type { KnowledgeProjection } from "../knowledge/index.mjs";
import type { BoardItem } from "../ResearchViews";
import type { ResearchSource } from "../ui";
import { Icon, Empty } from "./Icon";

/** Existing findings UI, enriched only with Knowledge-owned truthful projections. */
export function ResearchFindings({
  knowledge, findings, sources, contradictions, selectedFindingId, board,
  onPin, onDrill, onOpenSource, onOpenNode,
  renderCitations, renderEvidence, renderMarkdown,
}: {
  knowledge: KnowledgeProjection;
  findings: any[];
  sources: ResearchSource[];
  contradictions: {id: string; description: string; sources: string[]; severity: string}[];
  selectedFindingId: string | null;
  board: BoardItem[];
  onPin: (item: BoardItem) => void;
  onDrill: (question: string) => void;
  onOpenSource: (id: string) => void;
  onOpenNode: (id: string) => void;
  renderCitations: (ids: any[]) => ReactNode;
  renderEvidence: (items: any[]) => ReactNode;
  renderMarkdown: (content: string) => ReactNode;
}) {
  const traceById = useMemo(
    () => new Map(knowledge.findings.map(item => [item.id, item.status])),
    [knowledge],
  );
  const linkedCount = knowledge.findings.filter(item => item.status === "linked").length;
  return (
              <section className="dr-findings" aria-label="研究发现">
                <div className="dr-section-heading">
                  <h2>研究发现</h2>
                  <span>
                    {findings.length} 条
                    {contradictions.length > 0 &&
                      ` · ${contradictions.length} 项分歧待解释`}
                  </span>
                </div>
                {!!knowledge.findings.length && (
                  <div className="dr-knowledge-trace" aria-label="原文引用可追溯情况">
                    <strong>{linkedCount} / {knowledge.findings.length} 条发现具有精确原文引用</strong>
                    <div aria-hidden="true"><span style={{
                      width: (linkedCount / knowledge.findings.length * 100) + "%"
                    }} /></div>
                    <small>此处只核对原文链接与片段位置，结论仍需语义审阅。</small>
                  </div>
                )}
                {!!knowledge.gaps.length && (
                  <details className="dr-knowledge-gaps">
                    <summary>
                      <Icon name="search" /> 研究中报告的问题线索
                      <span>{knowledge.gaps.length} 项</span>
                    </summary>
                    <p>这些线索曾在研究中被记录，可能已得到后续解答，补查前应先复核。</p>
                    {knowledge.gaps.map(gap => (
                      <article key={gap.id}>
                        <p>{gap.text}</p>
                        <div>
                          {!!gap.originNodeIds.length && <button onClick={() => onOpenNode(gap.originNodeIds[0])}>查看对应任务</button>}
                          <button onClick={() => onDrill(
                            "核对研究中曾记录的问题线索：「" + gap.text + "」。先判断原有研究是否已回答，再补充可靠证据与反例。",
                          )}>核实此线索 ↗</button>
                        </div>
                      </article>
                    ))}
                  </details>
                )}
                {contradictions.length > 0 && (
                  <div className="dr-contradictions">
                    <h3><Icon name="warning" />来源存在分歧</h3>
                    {contradictions.map((contradiction) => (
                      <article key={contradiction.id}>
                        <p>{contradiction.description}</p>
                        <div className="dr-dispute-sides">
                          {contradiction.sources.map((id, index) => {
                            const source = sources.find(item => item.id === id);
                            return <div key={id}>
                              <small>相关材料 {index + 1}</small>
                              <strong>{source?.title || id}</strong>
                              <p>{source?.summary || source?.snippet || "当前未提供摘要，可查看原文证据。"}</p>
                              <button onClick={() => onOpenSource(id)}>查看材料与原文 ↗</button>
                            </div>;
                          })}
                        </div>
                        <p className="dr-dispute-note">分歧需结合资料时间、版本和适用条件审阅。</p>
                        {renderCitations(contradiction.sources)}
                      </article>
                    ))}
                  </div>
                )}
                {findings.map((finding, index) => (
                  <article key={finding.id ?? index} id={"dr-finding-" + (finding.id ?? index)} className={selectedFindingId === finding.id ? "dr-highlight-finding" : ""}>
                    <span className="dr-finding-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3>{finding.claim ?? finding.text ?? finding.title}</h3>
                      {traceById.has(String(finding.id ?? index)) && (
                        <small className="dr-finding-trace">
                          {traceById.get(String(finding.id ?? index)) === "linked"
                            ? "已关联可定位的原文" : "引用依据有待核对"}
                        </small>
                      )}
                      <div className="dr-node-actions"><button onClick={() => onPin({ type: "finding", id: String(finding.id ?? index), note: "" })}>
                        <Icon name="bookmark" />{board.some(item => item.type === "finding" && item.id === String(finding.id ?? index)) ? "从成果板移除" : "收藏到成果板"}
                      </button><button onClick={() => onDrill("进一步核实并扩展研究发现：「" + (finding.claim ?? finding.text ?? finding.title) + "」。请补充反例、适用范围和不同角度。")}>继续深挖 ↗</button></div>
                      {finding.detail && (
                        <div className="dr-markdown">
                          {renderMarkdown(finding.detail)}
                        </div>
                      )}
                      {renderEvidence(finding.evidence ?? [])}
                    </div>
                  </article>
                ))}
                {!findings.length && (
                  <Empty icon="lightbulb">尚未形成研究发现</Empty>
                )}
              </section>

  );
}
