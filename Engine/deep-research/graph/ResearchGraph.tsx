import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import {
  layoutGraph,
  labelFor,
  NODE_WIDTH,
  NODE_HEIGHT,
  displayStatus,
  type ResearchNode,
  type GraphEdge,
} from "../ui";
import { focusAreas, nodeInsight, clean } from "../ResearchInsights";
import { anchoredScroll, clampZoom, focusZoom, nearestNode, nextDirectionalNode, type DirectionKey, type Point } from "./camera";
import { fromMini, miniDots, miniProjection, miniViewport, toMini, visibleGraph, type CanvasWindow } from "./viewport";
import type { KnowledgeProjection } from "../knowledge/index.mjs";
import { KnowledgeRelations } from "./KnowledgeRelations";
import { projectGraphOverview, projectTopicGuides } from "./overview";
import { SemanticOverview } from "./SemanticOverview";
import { GraphNodeCard } from "./GraphNodeCard";
import "./graph.css";

type CameraIntent =
  | { kind: "focus"; id: string }
  | { kind: "anchor"; world: Point; screen: Point }
  | { kind: "fit" };
type CameraMemory = {
  graph: ReturnType<typeof layoutGraph>;
  anchorId: string;
  screen: Point;
  selectedId?: string;
  direction?: "horizontal" | "vertical";
  branchId: string | null;
};

export function ResearchGraph({
  nodes,
  edges,
  selectedId,
  onSelect,
  workers,
  inspectorOpen,
  onToggleInspector,
  discovery,
  direction,
  onDirection,
  workflow,
  knowledge,
  onOpenFinding,
  onOpenSource,
  onOpenNode,
}: {
  nodes: ResearchNode[];
  edges?: GraphEdge[];
  selectedId?: string;
  onSelect: (id: string) => void;
  workers: { id: string; label: string }[];
  inspectorOpen: boolean;
  onToggleInspector: () => void;
  discovery: ReactNode;
  direction?: "horizontal" | "vertical";
  onDirection: (direction: "horizontal" | "vertical") => void;
  workflow: { status: string; controlPending?: boolean };
  knowledge?: Pick<KnowledgeProjection, "entities" | "relationships" | "findings"> &
    Partial<Pick<KnowledgeProjection, "topics">>;
  onOpenFinding?: (id: string) => void;
  onOpenSource?: (id: string) => void;
  onOpenNode?: (id: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const compact = zoom < 0.55;
  const [branchOpen, setBranchOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [overviewDismissed, setOverviewDismissed] = useState(false);
  const [minimapPreference, setMinimapPreference] = useState<boolean | null>(null);
  const [viewWindow, setViewWindow] = useState<CanvasWindow>({ width: 900, height: 600, stageX: 0, stageY: 0, zoom: 1 });
  const viewportFrame = useRef<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const intent = useRef<CameraIntent | null>(null);
  const lastCamera = useRef<CameraMemory | null>(null);
  const lastSelection = useRef<{ selectedId?: string; direction?: "horizontal" | "vertical" } | null>(null);
  const pendingKeyboardFocus = useRef<string | null>(null);
  const branches = useMemo(() => focusAreas(nodes), [nodes]);
  const activeCount = nodes.filter(node => node.active !== false && node.status !== "superseded").length;
  const options = branches.filter(area => area.total < activeCount);
  const branch = branches.find(area => area.id === branchId);
  const displayed = useMemo(() => {
    if (!branch) return nodes;
    const ids = new Set(branch.nodeIds);
    return nodes.filter(node => ids.has(node.id));
  }, [nodes, branchId]);
  const graph = useMemo(
    () => layoutGraph(displayed, edges, direction),
    [displayed, edges, direction],
  );
  const visible = useMemo(() => graph.nodes.length > 120
    ? visibleGraph(graph.nodes, graph.edges, { ...viewWindow, zoom },
        { width: NODE_WIDTH, height: NODE_HEIGHT }, selectedId)
    : { nodes: graph.nodes, edges: graph.edges },
    [graph, viewWindow, zoom, selectedId]);
  const nodeIndexes = useMemo(() => new Map(graph.nodes.map((node, index) => [node.id, index])), [graph]);
  const mini = useMemo(() => miniProjection(graph, { width: 176, height: 102 }), [graph.width, graph.height]);
  const miniMarks = useMemo(() => miniDots(graph.nodes, mini,
    { width: NODE_WIDTH, height: NODE_HEIGHT }), [graph, mini]);
  const miniView = useMemo(() => miniViewport({ ...viewWindow, zoom }, mini), [viewWindow, zoom, mini]);
  const miniEnabled = graph.nodes.length >= 24;
  const regions = useMemo(() => graph.nodes.length >= 24
    ? projectGraphOverview(graph.nodes.map(node => ({
        ...node, status: displayStatus(node.status, workflow),
      })), graph.edges, graph.vertical)
    : [], [graph, workflow.status, workflow.controlPending]);
  const topicGuides = useMemo(() => knowledge?.topics?.length
    ? projectTopicGuides(knowledge.topics, graph.nodes)
    : [], [knowledge?.topics, graph]);
  const semanticOverviewOpen = graph.nodes.length >= 40 && zoom < 0.16 && !overviewDismissed && !knowledgeOpen;
  const stageVisible = useMemo(() => semanticOverviewOpen || knowledgeOpen
    ? { nodes: [] as typeof visible.nodes, edges: [] as typeof visible.edges } : visible,
    [semanticOverviewOpen, knowledgeOpen, visible]);
  const miniOpen = miniEnabled && (minimapPreference ?? graph.nodes.length > 80);
  const selectedNode = graph.nodes.find(node => node.id === selectedId);
  const related = new Set<string>(selectedId ? [selectedId] : []);
  for (const edge of graph.edges) {
    if (edge.from === selectedId) related.add(edge.to);
    if (edge.to === selectedId) related.add(edge.from);
  }
  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? nodes.filter(node => node.active !== false && node.status !== "superseded" &&
      `${node.label} ${node.objective ?? ""} ${nodeInsight(node)}`.toLocaleLowerCase().includes(term)).slice(0, 8) : [];
  }, [nodes, query]);
  const byId = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const peekNode = peekId ? byId.get(peekId) : undefined;
  const peekSummary = peekNode ? clean(nodeInsight(peekNode) || peekNode.objective || peekNode.description || "") : "";
  const workerNames = useMemo(() => new Map(workers.map(worker => [worker.id, worker.label])), [workers]);

  const reposition = (world: Point, screen: Point) => {
    const area = viewport.current, content = stage.current;
    if (!area || !content) return;
    const view = area.getBoundingClientRect(), bounds = content.getBoundingClientRect();
    area.scrollTo(anchoredScroll(
      { left: area.scrollLeft, top: area.scrollTop },
      { x: bounds.left - view.left + world.x * zoom, y: bounds.top - view.top + world.y * zoom },
      screen,
    ));
  };

  const readViewport = () => {
    const area = viewport.current, content = stage.current;
    if (!area || !content) return;
    const view = area.getBoundingClientRect(), bounds = content.getBoundingClientRect();
    const next = {
      width: area.clientWidth, height: area.clientHeight,
      stageX: bounds.left - view.left, stageY: bounds.top - view.top, zoom,
    };
    setViewWindow(previous =>
      Object.keys(next).every(key => Math.abs(previous[key as keyof CanvasWindow] - next[key as keyof CanvasWindow]) < 0.5)
        ? previous : next);
  };

  const scheduleViewport = () => {
    if (viewportFrame.current !== null) return;
    viewportFrame.current = requestAnimationFrame(() => {
      viewportFrame.current = null;
      readViewport();
    });
  };

  const rememberCamera = () => {
    const area = viewport.current, content = stage.current;
    if (!area || !content || !graph.nodes.length) return;
    const view = area.getBoundingClientRect(), bounds = content.getBoundingClientRect();
    const world = {
      x: (view.left + view.width / 2 - bounds.left) / zoom,
      y: (view.top + view.height / 2 - bounds.top) / zoom,
    };
    const anchor = nearestNode(graph.nodes, world, { width: NODE_WIDTH, height: NODE_HEIGHT });
    if (!anchor) return;
    lastCamera.current = {
      graph, anchorId: anchor.id, selectedId, direction, branchId,
      screen: {
        x: bounds.left - view.left + (anchor.x + NODE_WIDTH / 2) * zoom,
        y: bounds.top - view.top + (anchor.y + NODE_HEIGHT / 2) * zoom,
      },
    };
  };

  const zoomAround = (next: number, screen?: Point) => {
    const target = clampZoom(next);
    if (Math.abs(target - zoom) < 0.001) return;
    const area = viewport.current, content = stage.current;
    if (area && content) {
      const view = area.getBoundingClientRect(), bounds = content.getBoundingClientRect();
      const point = screen ?? { x: area.clientWidth / 2, y: area.clientHeight / 2 };
      intent.current = {
        kind: "anchor", screen: point,
        world: { x: (view.left + point.x - bounds.left) / zoom, y: (view.top + point.y - bounds.top) / zoom },
      };
    }
    setZoom(target);
  };

  const focusOn = (id: string) => {
    intent.current = { kind: "focus", id };
    const area = viewport.current, node = byId.get(id);
    if (area && node && Math.abs(zoom - focusZoom(
      graph.nodes, graph.edges, id,
      { width: area.clientWidth, height: area.clientHeight },
      { width: NODE_WIDTH, height: NODE_HEIGHT },
    )) < 0.001) {
      reposition({ x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 },
        { x: area.clientWidth / 2, y: area.clientHeight / 2 });
      intent.current = null;
      rememberCamera();
    } else if (area && node) {
      setZoom(focusZoom(graph.nodes, graph.edges, id,
        { width: area.clientWidth, height: area.clientHeight },
        { width: NODE_WIDTH, height: NODE_HEIGHT }));
    }
    onSelect(id);
  };

  const locateNode = (id: string) => {
    // Search may target a node outside the current branch filter.
    intent.current = { kind: "focus", id };
    setBranchId(null);
    setQuery("");
    setSearchOpen(false);
    onSelect(id);
  };

  const fit = () => {
    const area = viewport.current;
    if (!area) return;
    setOverviewDismissed(false);
    intent.current = { kind: "fit" };
    const target = clampZoom(Math.min(1, (area.clientWidth - 30) / graph.width,
      (area.clientHeight - 30) / graph.height));
    if (Math.abs(target - zoom) < 0.001) {
      area.scrollTo(0, 0);
      intent.current = null;
      rememberCamera();
    } else setZoom(target);
  };

  // Only explicit focus moves the selected node to the center. Regular zoom,
  // state refreshes and incremental replanning preserve the reading anchor.
  useLayoutEffect(() => {
    const area = viewport.current;
    if (!area || !stage.current) return;
    const previous = lastSelection.current;
    lastSelection.current = { selectedId, direction };
    if (!intent.current && (previous?.selectedId !== selectedId || previous?.direction !== direction)) {
      if (selectedId && byId.has(selectedId)) intent.current = { kind: "focus", id: selectedId };
      else if (previous?.direction !== direction) intent.current = { kind: "fit" };
    }
    const pending = intent.current;
    if (pending?.kind === "focus") {
      const node = byId.get(pending.id);
      if (node) {
        const target = focusZoom(graph.nodes, graph.edges, pending.id,
          { width: area.clientWidth, height: area.clientHeight },
          { width: NODE_WIDTH, height: NODE_HEIGHT });
        if (Math.abs(target - zoom) >= 0.001) { setZoom(target); return; }
        reposition({ x: node.x + NODE_WIDTH / 2, y: node.y + NODE_HEIGHT / 2 },
          { x: area.clientWidth / 2, y: area.clientHeight / 2 });
      }
      intent.current = null;
    } else if (pending?.kind === "anchor") {
      reposition(pending.world, pending.screen);
      intent.current = null;
    } else if (pending?.kind === "fit") {
      const target = clampZoom(Math.min(1, (area.clientWidth - 30) / graph.width,
        (area.clientHeight - 30) / graph.height));
      if (Math.abs(target - zoom) >= 0.001) { setZoom(target); return; }
      area.scrollTo(0, 0);
      intent.current = null;
    } else {
      const previousCamera = lastCamera.current;
      if (previousCamera && previousCamera.graph !== graph &&
          previousCamera.selectedId === selectedId && previousCamera.direction === direction &&
          previousCamera.branchId === branchId) {
        const anchor = byId.get(previousCamera.anchorId);
        if (anchor) reposition(
          { x: anchor.x + NODE_WIDTH / 2, y: anchor.y + NODE_HEIGHT / 2 },
          previousCamera.screen,
        );
      }
    }
    rememberCamera();
  }, [graph, zoom, selectedId, direction, branchId]);

  useLayoutEffect(() => {
    const area = viewport.current;
    if (!area) return;
    readViewport();
    const observer = typeof ResizeObserver === "undefined" ? null :
      new ResizeObserver(scheduleViewport);
    observer?.observe(area);
    return () => observer?.disconnect();
  }, [graph, zoom]);

  useEffect(() => () => {
    if (viewportFrame.current !== null) cancelAnimationFrame(viewportFrame.current);
  }, []);
  useEffect(() => { if (!knowledge?.entities.length) setKnowledgeOpen(false); }, [knowledge]);

  useLayoutEffect(() => {
    const id = pendingKeyboardFocus.current, area = viewport.current;
    if (!id || !area) return;
    // IDs are source data; compare dataset values rather than injecting IDs into a CSS selector.
    for (const button of area.querySelectorAll<HTMLButtonElement>("[data-node-id]")) {
      if (button.dataset.nodeId !== id) continue;
      button.focus({ preventScroll: true });
      pendingKeyboardFocus.current = null;
      break;
    }
  }, [stageVisible.nodes, selectedId, zoom]);

  useEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const wheel = (event: WheelEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || !graph.nodes.length) return;
      event.preventDefault();
      const box = area.getBoundingClientRect();
      zoomAround(zoom * Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.006),
        { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    area.addEventListener("wheel", wheel, { passive: false });
    return () => area.removeEventListener("wheel", wheel);
  }, [graph, zoom]);

  const navigateMini = (event: React.MouseEvent<HTMLButtonElement>) => {
    const area = viewport.current;
    const svg = event.currentTarget.querySelector("svg");
    if (!area || !svg) return;
    const bounds = svg.getBoundingClientRect();
    const point = event.detail ? {
      x: (event.clientX - bounds.left) * mini.width / bounds.width,
      y: (event.clientY - bounds.top) * mini.height / bounds.height,
    } : { x: mini.width / 2, y: mini.height / 2 };
    const world = fromMini(point, mini);
    area.scrollTo({
      left: world.x * zoom - area.clientWidth / 2,
      top: world.y * zoom - area.clientHeight / 2,
    });
    scheduleViewport();
  };

  const previewFromNode = (target: EventTarget) => {
    if (!compact) return;
    const id = (target as Element).closest<HTMLButtonElement>("[data-node-id]")?.dataset.nodeId;
    if (id) setPeekId(id);
  };

  const onGraphKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || !graph.nodes.length) return;
    if (event.key === "Escape") { setPeekId(null); return; }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const focusedId = (event.target as HTMLElement).closest("[data-node-id]")?.getAttribute("data-node-id");
      const current = focusedId || selectedId || graph.nodes[0].id;
      const next = nextDirectionalNode(graph.nodes, current, event.key as DirectionKey);
      if (!next) return;
      event.preventDefault();
      pendingKeyboardFocus.current = next.id;
      focusOn(next.id);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAround(zoom + 0.1);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAround(zoom - 0.1);
    } else if (event.key === "Home") {
      event.preventDefault();
      fit();
    }
  };
  return (
    <div className={"dr-graph dr-graph-enhanced" + (knowledgeOpen ? " knowledge-open" : "")} onMouseLeave={() => setPeekId(null)}>
      {graph.nodes.length > 0 && !knowledgeOpen && (
        <div className="dr-graph-toolbar">
          <strong>
            研究地图 <small>{graph.nodes.length || "探索中"}{graph.nodes.length > 120 && ` · 当前渲染 ${visible.nodes.length}`}</small>
          </strong>
          <div className="dr-graph-legend">
            <span>
              <i className="running" />
              进行中
            </span>
            <span>
              <i className="completed" />
              完成
            </span>
            <span>
              <i className="pending" />
              待执行
            </span>
            <span>
              <i className="failed" />
              需处理
            </span>
          </div>
          <div>
            <div
              className="dr-direction-toggle"
              role="group"
              aria-label="研究地图方向"
            >
              <button
                aria-label="从左到右排列"
                title="从左到右排列"
                aria-pressed={!graph.vertical}
                onClick={() => onDirection("horizontal")}
              >
                <span className="codicon codicon-arrow-right" />
              </button>
              <button
                aria-label="从上到下排列"
                title="从上到下排列"
                aria-pressed={graph.vertical}
                onClick={() => onDirection("vertical")}
              >
                <span className="codicon codicon-arrow-down" />
              </button>
            </div>
            {!!knowledge?.entities.length && <button aria-label="显示或隐藏知识关系图"
              title="查看真实研究关系与出处" aria-pressed={knowledgeOpen}
              onClick={() => setKnowledgeOpen(value => !value)}>
              <span className="codicon codicon-type-hierarchy" />
            </button>}
            {miniEnabled && <button aria-label="显示或隐藏研究地图缩略导航"
              title="全图导航" aria-pressed={miniOpen}
              onClick={() => setMinimapPreference(!miniOpen)}>
              <span className="codicon codicon-map" />
            </button>}
            <button
              aria-label="适应研究地图画布"
              title="适应画布"
              onClick={fit}
            >
              <span className="codicon codicon-screen-full" />
            </button>
            <button
              aria-label="缩小研究地图"
              title="缩小"
              onClick={() => zoomAround(zoom - 0.1)}
            >
              <span className="codicon codicon-remove" />
            </button>
            <button
              aria-label="重置研究地图缩放"
              title="重置缩放"
              onClick={() => zoomAround(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="放大研究地图"
              title="放大"
              onClick={() => zoomAround(zoom + 0.1)}
            >
              <span className="codicon codicon-add" />
            </button>
            {selectedNode && <button aria-label="定位当前研究节点" title="定位当前研究节点" onClick={() => focusOn(selectedNode.id)}><span className="codicon codicon-target" /></button>}
            <button aria-label="查找研究节点" title="查找研究节点" aria-pressed={searchOpen} onClick={() => setSearchOpen(value => !value)}>
              <span className="codicon codicon-search" />
            </button>
            {options.length > 0 && (
              <button aria-label="按主题分支筛选" title="按主题分支筛选" aria-pressed={branchOpen} onClick={() => { setBranchOpen(value => !value); if (branchOpen) setBranchId(null); }}>
                <span className="codicon codicon-filter" />
              </button>
            )}
            {graph.nodes.length > 0 && (
              <button
                aria-label={inspectorOpen ? "收起任务详情" : "展开任务详情"}
                title={inspectorOpen ? "收起任务详情" : "展开任务详情"}
                onClick={onToggleInspector}
              >
                <span className="codicon codicon-layout-sidebar-right" />
              </button>
            )}
          </div>
        </div>
      )}
      {searchOpen && <div className="dr-node-lookup" role="search" aria-label="研究节点定位">
        <input autoFocus type="search" aria-label="输入要定位的研究节点" placeholder="查找任务、主题或发现…" value={query}
          onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === "Escape") { setSearchOpen(false); setQuery(""); }
            if (event.key === "Enter" && matches[0]) { event.preventDefault(); locateNode(matches[0].id); }
          }} />
        <small>{query.trim() ? (matches.length ? `显示前 ${matches.length} 项 · 回车定位首项` : "无匹配节点") : "输入关键词快速定位到节点"}</small>
        {matches.length > 0 && <div className="dr-node-matches" role="group" aria-label="匹配节点">
          {matches.map(node => <button type="button" key={node.id} onClick={() => locateNode(node.id)}>
            <span>{node.label}</span><small>{labelFor(node.status)}</small>
          </button>)}
        </div>}
      </div>}
      {branchOpen && options.length > 0 && <div className="dr-branch-toolbar" role="group" aria-label="研究分支筛选">
        <label htmlFor="dr-branch-select">研究方向</label>
        <select id="dr-branch-select" aria-label="筛选研究方向" value={branch?.id ?? ""} onChange={event => {
          setBranchId(event.target.value || null);
          if (event.target.value) { intent.current = { kind: "focus", id: event.target.value }; onSelect(event.target.value); }
        }}>
          <option value="">全部任务（{activeCount}）</option>
          {options.map(area => <option key={area.id} value={area.id}>{area.title} · {area.completed}/{area.total}</option>)}
        </select>
        {branch && <button onClick={() => setBranchId(null)}>清除筛选</button>}
      </div>}
      <div
        ref={viewport}
        className="dr-graph-viewport"
        tabIndex={semanticOverviewOpen || knowledgeOpen ? -1 : 0}
        inert={semanticOverviewOpen || knowledgeOpen}
        onScroll={() => { rememberCamera(); scheduleViewport(); }}
        onKeyDown={onGraphKey}
        aria-label="可滚动研究任务图，方向键定位节点，加减键缩放，Home 适应画布"
      >
        {!graph.nodes.length ? (
          discovery
        ) : (
          <div
            ref={stage}
            className="dr-graph-stage"
            style={{ width: graph.width * zoom, height: graph.height * zoom }}
          >
            <div
              className="dr-graph-canvas"
              onClick={event => {
                const id = (event.target as Element).closest<HTMLButtonElement>("[data-node-id]")?.dataset.nodeId;
                if (id) focusOn(id);
              }}
              onMouseOver={event => previewFromNode(event.target)}
              onFocusCapture={event => previewFromNode(event.target)}
              style={{
                width: graph.width,
                height: graph.height,
                transform: `scale(${zoom})`,
              }}
              data-compact={compact}
            >
              <svg
                className="dr-graph-lines"
                width={graph.width}
                height={graph.height}
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="dr-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor" />
                  </marker>
                </defs>
                {stageVisible.edges.map((edge) => {
                  const from = byId.get(edge.from)!,
                    to = byId.get(edge.to)!;
                  const x1 =
                      from.x + (graph.vertical ? NODE_WIDTH / 2 : NODE_WIDTH - 7),
                    y1 =
                      from.y + (graph.vertical ? NODE_HEIGHT - 25 : 100),
                    x2 = to.x + (graph.vertical ? NODE_WIDTH / 2 : 7),
                    y2 = to.y + (graph.vertical ? 27 : 100);
                  const selected =
                    edge.from === selectedId || edge.to === selectedId;
                  return (
                    <path
                      key={edge.from + "/" + edge.to}
                      data-edge-from={edge.from}
                      data-edge-to={edge.to}
                      className={
                        selected
                          ? "selected"
                          : from.status === "completed"
                            ? "completed"
                            : ""
                      }
                      d={
                        graph.vertical
                          ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
                          : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`
                      }
                      markerEnd="url(#dr-arrow)"
                    />
                  );
                })}
              </svg>
              {stageVisible.nodes.map(original => (
                <GraphNodeCard
                  key={original.id}
                  node={original}
                  status={displayStatus(original.status, workflow)}
                  index={nodeIndexes.get(original.id) ?? 0}
                  compact={compact}
                  selected={selectedId === original.id}
                  related={related.has(original.id)}
                  worker={workerNames.get(original.employeeId ?? "") ?? "待分配"}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      {miniOpen && !semanticOverviewOpen && !knowledgeOpen && <button type="button" className="dr-graph-minimap"
        aria-label="研究地图缩略导航，点击定位研究区域"
        title="点击移动画布视野" onClick={navigateMini}>
        <span className="dr-graph-minimap-label">全图导航 <small>{graph.nodes.length} 项任务</small></span>
        <svg viewBox={`0 0 ${mini.width} ${mini.height}`} aria-hidden="true">
          {miniMarks.map((dot, index) =>
            <circle key={index} cx={dot.x} cy={dot.y}
              r={Math.min(3, 1.6 + Math.sqrt(dot.count) * 0.35)}
              className={"dr-graph-mini-dot " + dot.status} />)}
          <rect className="dr-graph-mini-frame" x={miniView.x} y={miniView.y}
            width={miniView.width} height={miniView.height} rx={2} />
          {selectedNode && (() => {
            const point = toMini({ x: selectedNode.x + NODE_WIDTH / 2,
              y: selectedNode.y + NODE_HEIGHT / 2 }, mini);
            return <circle className="dr-graph-mini-selected" cx={point.x} cy={point.y} r={4.4} />;
          })()}
        </svg>
      </button>}
      {compact && peekNode && !knowledgeOpen && !semanticOverviewOpen && <div className="dr-graph-peek" aria-label="节点快速预览">
        <span className="dr-graph-peek-eyebrow">
          {labelFor(peekNode.kind)} · {labelFor(displayStatus(peekNode.status, workflow))}
        </span>
        <strong>{peekNode.label}</strong>
        {peekSummary && <p>{peekSummary.slice(0, 180)}</p>}
        <div className="dr-graph-peek-footer">
          <span>{peekNode.sourceIds?.length ?? 0} 个关联来源</span>
          <button type="button" onClick={() => focusOn(peekNode.id)}>打开任务详情 →</button>
        </div>
      </div>}
      {semanticOverviewOpen && <SemanticOverview regions={regions} topics={topicGuides} total={graph.nodes.length}
        onFocus={focusOn} onShowRaw={() => setOverviewDismissed(true)} />}
      {knowledgeOpen && knowledge && <div className="dr-graph-knowledge-overlay">
        <KnowledgeRelations knowledge={knowledge} onOpenFinding={onOpenFinding}
          onOpenSource={onOpenSource}
          onOpenNode={onOpenNode ? id => { setKnowledgeOpen(false); onOpenNode(id); } : undefined}
          onClose={() => setKnowledgeOpen(false)} />
      </div>}
    </div>
  );
}
