import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { KnowledgeProjection } from "../knowledge/index.mjs";
import { anchoredScroll, clampZoom, type Point } from "./camera";
import {
  layoutKnowledgeRelations, RELATION_NODE_HEIGHT, RELATION_NODE_WIDTH,
} from "./relations-layout";
import "./relations.css";

type Related = Pick<KnowledgeProjection, "entities" | "relationships" | "findings">;
type Picked = { kind: "entity" | "relation"; id: string };
type Anchor = { world: Point; screen: Point };

export function KnowledgeRelations({
  knowledge, onOpenFinding, onOpenSource, onOpenNode, onClose,
}: {
  knowledge: Related;
  onOpenFinding?: (id: string) => void;
  onOpenSource?: (id: string) => void;
  onOpenNode?: (id: string) => void;
  onClose?: () => void;
}) {
  const layout = useMemo(
    () => layoutKnowledgeRelations(knowledge.entities, knowledge.relationships),
    [knowledge.entities, knowledge.relationships],
  );
  const entities = useMemo(() => new Map(layout.nodes.map(entity => [entity.id, entity])), [layout]);
  const relations = useMemo(() => new Map(layout.edges.map(relation => [relation.id, relation])), [layout]);
  const findings = useMemo(() => new Map(knowledge.findings.map(finding => [finding.id, finding])), [knowledge.findings]);
  const [selected, setSelected] = useState<Picked | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pending = useRef<Anchor | null>(null);
  const initialized = useRef(false);
  const chosenEntity = selected?.kind === "entity" ? entities.get(selected.id) : undefined;
  const chosenRelation = selected?.kind === "relation" ? relations.get(selected.id) : undefined;
  const chosen = chosenEntity ?? chosenRelation;
  const term = search.trim().toLocaleLowerCase();
  const matches = useMemo(() => term ? layout.nodes.filter(
    node => `${node.name} ${node.type} ${node.description}`.toLocaleLowerCase().includes(term),
  ).slice(0, 10) : [], [term, layout]);
  const highlighted = selected?.kind === "entity" ? new Set([selected.id]) :
    selected?.kind === "relation" && chosenRelation ? new Set([chosenRelation.from, chosenRelation.to]) :
    new Set<string>();
  const linkedCount = layout.edges.filter(item => item.evidenceStatus === "linked").length;

  const anchorAround = (nextZoom: number, screen?: Point) => {
    const area = viewport.current, surface = stage.current;
    if (!area || !surface) return;
    const target = clampZoom(nextZoom, 0.12, 1.6);
    if (Math.abs(target - zoom) < 0.001) return;
    const view = area.getBoundingClientRect(), bounds = surface.getBoundingClientRect();
    const point = screen ?? { x: area.clientWidth / 2, y: area.clientHeight / 2 };
    pending.current = {
      world: {
        x: (view.left + point.x - bounds.left) / zoom,
        y: (view.top + point.y - bounds.top) / zoom,
      },
      screen: point,
    };
    setZoom(target);
  };

  const fit = () => {
    const area = viewport.current;
    if (!area) return;
    const target = clampZoom(Math.min(1,
      (area.clientWidth - 24) / layout.width,
      (area.clientHeight - 24) / layout.height), 0.12, 1);
    pending.current = null;
    if (Math.abs(target - zoom) < 0.001) area.scrollTo({ left: 0, top: 0 });
    else setZoom(target);
  };

  // The canvas is fitted only on first mount; live knowledge updates do not reset the reader.
  useLayoutEffect(() => {
    if (initialized.current || !layout.nodes.length) return;
    initialized.current = true;
    fit();
  }, [layout]);

  useEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !layout.nodes.length) return;
      event.preventDefault();
      const box = area.getBoundingClientRect();
      anchorAround(zoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * .006),
        { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    area.addEventListener("wheel", wheel, { passive: false });
    return () => area.removeEventListener("wheel", wheel);
  }, [zoom, layout]);

  useLayoutEffect(() => {
    const area = viewport.current, surface = stage.current, anchor = pending.current;
    if (!area || !surface || !anchor) return;
    const view = area.getBoundingClientRect(), bounds = surface.getBoundingClientRect();
    area.scrollTo(anchoredScroll(
      { left: area.scrollLeft, top: area.scrollTop },
      { x: bounds.left - view.left + anchor.world.x * zoom,
        y: bounds.top - view.top + anchor.world.y * zoom },
      anchor.screen,
    ));
    pending.current = null;
  }, [zoom, selected, layout]);

  const focusEntity = (id: string, pick: Picked = { kind: "entity", id }) => {
    const node = entities.get(id), area = viewport.current, surface = stage.current;
    if (!node || !area || !surface) return;
    setSelected(pick);
    const target = Math.max(.82, zoom);
    // Selection is a deliberate request to make this entity readable.
    if (target > zoom) {
      pending.current = {
        world: { x: node.x + RELATION_NODE_WIDTH / 2, y: node.y + RELATION_NODE_HEIGHT / 2 },
        screen: { x: area.clientWidth / 2, y: area.clientHeight / 2 },
      };
      setZoom(target);
    } else {
      const view = area.getBoundingClientRect(), bounds = surface.getBoundingClientRect();
      area.scrollTo(anchoredScroll(
        { left: area.scrollLeft, top: area.scrollTop },
        { x: bounds.left - view.left + (node.x + RELATION_NODE_WIDTH / 2) * zoom,
          y: bounds.top - view.top + (node.y + RELATION_NODE_HEIGHT / 2) * zoom },
        { x: area.clientWidth / 2, y: area.clientHeight / 2 },
      ));
    }
  };

  const focusRelation = (id: string) => {
    const relation = relations.get(id);
    if (relation) focusEntity(relation.from, { kind: "relation", id });
  };
  const findingIds = chosen?.findingIds ?? [];
  const attached = findingIds.map(id => findings.get(id)).filter(
    (entry): entry is NonNullable<typeof entry> => !!entry && entry.status === "linked",
  );
  const referencedTasks = chosen?.originNodeIds ?? [];

  const relatedRelations = chosenEntity ? layout.edges.filter(
    edge => edge.from === chosenEntity.id || edge.to === chosenEntity.id,
  ) : [];

  const detailActions = (content: ReactNode) => <div className="dr-knowledge-actions">{content}</div>;

  return (
    <section className="dr-knowledge-relations" aria-label="知识关系地图"
      onKeyDown={event => { if (event.key === "Escape") onClose?.(); }}>
      <div className="dr-knowledge-toolbar">
        <div className="dr-knowledge-headline">
          <strong>知识关系</strong>
          <small>{layout.nodes.length} 个实体 · {layout.edges.length} 条关系 · {linkedCount} 条关系有出处链接</small>
        </div>
        <div className="dr-knowledge-tools">
          <button type="button" aria-label="适应知识关系画布" onClick={fit}>适应</button>
          <button type="button" aria-label="缩小知识关系画布" onClick={() => anchorAround(zoom - .12)}>−</button>
          <button type="button" aria-label="放大知识关系画布" onClick={() => anchorAround(zoom + .12)}>+</button>
          {onClose && <button type="button" className="dr-knowledge-return" onClick={onClose}>返回任务图</button>}
        </div>
      </div>
      <div className="dr-knowledge-body">
        <div className="dr-knowledge-workspace">
          <label className="dr-knowledge-search">
            <span>查找概念或实体</span>
            <input type="search" aria-label="搜索知识实体" value={search}
              placeholder="搜索实体名称、类型或说明…"
              onChange={event => setSearch(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); setSearch(""); }
                if (event.key === "Enter" && matches[0]) focusEntity(matches[0].id);
              }} />
          </label>
          {term && <div className="dr-knowledge-matches" aria-label="知识实体搜索结果">
            {matches.length ? matches.map(entity =>
              <button type="button" key={entity.id} onClick={() => { focusEntity(entity.id); setSearch(""); }}>
                {entity.name}<small>{entity.type}</small>
              </button>) : <small>没有匹配的实体</small>}
          </div>}
          {layout.nodes.length > 0 && <div className="dr-knowledge-mobile-index" aria-label="知识实体快速导航">
            {layout.nodes.slice(0, 80).map(entity => <button type="button" key={entity.id}
              aria-pressed={selected?.kind === "entity" && selected.id === entity.id}
              onClick={() => focusEntity(entity.id)}>
              <strong>{entity.name}</strong><small>{entity.type}</small>
            </button>)}
            {layout.nodes.length > 80 && <span>其余 {layout.nodes.length - 80} 项可通过搜索定位</span>}
          </div>}
          <div ref={viewport} className="dr-knowledge-viewport" tabIndex={0}
            aria-label="可滚动知识关系图，实体可点击展开证据">
            {!layout.nodes.length ? <div className="dr-knowledge-empty">
              当前研究尚未形成可显示的实体关系。
              <small>仅根据已有综合研究数据展示关系；未识别到的内容不会补造。</small>
            </div> :
            <div ref={stage} className="dr-knowledge-stage"
              style={{ width: layout.width * zoom, height: layout.height * zoom }}>
              <div className="dr-knowledge-canvas"
                style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}>
                <svg className="dr-knowledge-lines" width={layout.width} height={layout.height} aria-hidden="true">
                  <defs><marker id="dr-knowledge-arrow" markerWidth="7" markerHeight="7"
                    refX="6" refY="3" orient="auto">
                    <path d="M0 0 L6 3 L0 6 Z" fill="currentColor" />
                  </marker></defs>
                  {layout.groups.map(group => <g key={group.id}>
                    <rect className="dr-knowledge-group" x={group.x} y={group.y}
                      width={group.width} height={group.height} rx={12} />
                    <text className="dr-knowledge-group-name" x={group.x + 18} y={group.y + 22}>
                      {group.label}</text>
                  </g>)}
                  {layout.edges.map(edge =>
                    <path key={edge.id} data-relation-id={edge.id}
                      className={"dr-knowledge-link " + edge.evidenceStatus +
                        (selected?.kind === "relation" && selected.id === edge.id ? " selected" :
                         highlighted.size && !highlighted.has(edge.from) && !highlighted.has(edge.to) ? " muted" : "")}
                      d={edge.path} markerEnd="url(#dr-knowledge-arrow)"
                      onClick={() => focusRelation(edge.id)}>
                      <title>{entities.get(edge.from)?.name} → {entities.get(edge.to)?.name}：{edge.type}</title>
                    </path>)}
                  {chosenRelation && <text className="dr-knowledge-link-label" textAnchor="middle"
                    x={chosenRelation.labelX} y={chosenRelation.labelY - 8}>{chosenRelation.type.slice(0, 32)}</text>}
                </svg>
                {layout.nodes.map(entity =>
                  <button type="button" key={entity.id} data-entity-id={entity.id}
                    className={"dr-knowledge-entity " + entity.evidenceStatus +
                      (selected?.kind === "entity" && selected.id === entity.id ? " selected" :
                      highlighted.size && !highlighted.has(entity.id) ? " muted" : "") +
                      (term && !`${entity.name} ${entity.type} ${entity.description}`.toLocaleLowerCase().includes(term) ? " search-muted" : "")}
                    style={{ left: entity.x, top: entity.y,
                      width: RELATION_NODE_WIDTH, height: RELATION_NODE_HEIGHT }}
                    onClick={() => focusEntity(entity.id)} aria-pressed={selected?.kind === "entity" && selected.id === entity.id}>
                    <small>{entity.type}</small>
                    <strong>{entity.name}</strong>
                    <span>{entity.evidenceStatus === "linked" ? "有出处链接" : "出处待核对"}</span>
                  </button>)}
              </div>
            </div>}
          </div>
        </div>
        <aside className="dr-knowledge-details" aria-label="知识关系详情">
          {!chosen ? <>
            <strong>选择要了解的实体或关系</strong>
            <p>查看其来源、相关发现和生成它的研究任务。虚线代表尚未关联到经过核验的原文。</p>
          </> : <>
            <span className="dr-knowledge-detail-type">{chosenEntity ? "研究实体" : "实体关系"}</span>
            <h3>{chosenEntity?.name ??
              `${entities.get(chosenRelation!.from)?.name ?? "未知"} → ${entities.get(chosenRelation!.to)?.name ?? "未知"}`}</h3>
            <span className="dr-knowledge-detail-type">{chosenEntity?.type ?? chosenRelation?.type}</span>
            {chosenEntity?.description && <p>{chosenEntity.description}</p>}
            <p className="dr-knowledge-proof-note">
              {chosen.evidenceStatus === "linked"
                ? "已链接到经独立读取和核验的原文片段，关系含义仍需结合证据判断。"
                : "目前没有与该项直接对应的已核验原文片段，请谨慎使用。"}
            </p>
            {attached.length > 0 && <div className="dr-knowledge-evidence">
              <h4>关联发现 · {attached.length}</h4>
              {attached.map(finding => <article key={finding.id}>
                <p>{finding.claim}</p>
                {(onOpenFinding || onOpenSource) && detailActions(<>
                  {onOpenFinding && <button type="button" onClick={() => onOpenFinding(finding.id)}>查看发现</button>}
                  {onOpenSource && finding.sourceIds.map(id =>
                    <button type="button" key={id} onClick={() => onOpenSource(id)}>原文 {id}</button>)}
                </>)}
              </article>)}
            </div>}
            {chosenEntity && relatedRelations.length > 0 && <div className="dr-knowledge-neighbors">
              <h4>关联关系 · {relatedRelations.length}</h4>
              {relatedRelations.map(edge =>
                <button type="button" key={edge.id} onClick={() => focusRelation(edge.id)}>
                  {entities.get(edge.from)?.name} → {entities.get(edge.to)?.name}
                  <small>{edge.type}</small>
                </button>)}
            </div>}
            {onOpenNode && referencedTasks.length > 0 && detailActions(
              <button type="button" onClick={() => onOpenNode(referencedTasks[0])}>查看生成该项的研究任务</button>)}
          </>}
        </aside>
      </div>
    </section>
  );
}
