import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  layoutGraph,
  labelFor,
  NODE_WIDTH,
  NODE_HEIGHT,
  displayStatus,
  type ResearchNode,
  type GraphEdge,
} from "./ui";

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
}) {
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const graph = useMemo(
    () => layoutGraph(nodes, edges, direction),
    [nodes, edges, direction],
  );
  const selectedNode = graph.nodes.find((node) => node.id === selectedId);
  const nearby = graph.nodes.filter(
    (node) =>
      node.id === selectedId ||
      graph.edges.some(
        (edge) =>
          (edge.from === selectedId && edge.to === node.id) ||
          (edge.to === selectedId && edge.from === node.id),
      ),
  );
  const focusZoom = () => {
    const area = viewport.current;
    if (!area || !nearby.length) return 1;
    const width =
      Math.max(...nearby.map((node) => node.x)) -
      Math.min(...nearby.map((node) => node.x)) +
      NODE_WIDTH;
    const height =
      Math.max(...nearby.map((node) => node.y)) -
      Math.min(...nearby.map((node) => node.y)) +
      NODE_HEIGHT;
    return Math.max(
      0.85,
      Math.min(
        1,
        (area.clientWidth - 32) / width,
        (area.clientHeight - 32) / height,
      ),
    );
  };
  useEffect(() => {
    if (!selectedId) return;
    setZoom(focusZoom());
  }, [selectedId, direction]);
  useEffect(() => {
    const area = viewport.current;
    if (selectedNode && area)
      area.scrollTo({
        left: (selectedNode.x + NODE_WIDTH / 2) * zoom - area.clientWidth / 2,
        top: (selectedNode.y + NODE_HEIGHT / 2) * zoom - area.clientHeight / 2,
      });
  }, [selectedId, zoom, selectedNode?.x, selectedNode?.y]);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const related = new Set([
    selectedId,
    ...graph.edges
      .filter((edge) => edge.from === selectedId || edge.to === selectedId)
      .flatMap((edge) => [edge.from, edge.to]),
  ]);
  const fit = () => {
    const area = viewport.current;
    if (area) {
      setZoom(
        Math.max(
          0.05,
          Math.min(
            1,
            (area.clientWidth - 30) / graph.width,
            (area.clientHeight - 30) / graph.height,
          ),
        ),
      );
      area.scrollTo(0, 0);
    }
  };
  return (
    <div className="dr-graph">
      {graph.nodes.length > 0 && (
        <div className="dr-graph-toolbar">
          <strong>
            研究地图 <small>{graph.nodes.length || "探索中"}</small>
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
                onClick={() => {
                  onDirection("horizontal");
                  setZoom(1);
                }}
              >
                <span className="codicon codicon-arrow-right" />
              </button>
              <button
                aria-label="从上到下排列"
                title="从上到下排列"
                aria-pressed={graph.vertical}
                onClick={() => {
                  onDirection("vertical");
                  setZoom(1);
                }}
              >
                <span className="codicon codicon-arrow-down" />
              </button>
            </div>
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
              onClick={() => setZoom((value) => Math.max(0.15, value - 0.1))}
            >
              <span className="codicon codicon-remove" />
            </button>
            <button
              aria-label="重置研究地图缩放"
              title="重置缩放"
              onClick={() => setZoom(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="放大研究地图"
              title="放大"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
            >
              <span className="codicon codicon-add" />
            </button>
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
      <div
        ref={viewport}
        className="dr-graph-viewport"
        tabIndex={0}
        aria-label="可滚动研究任务图"
      >
        {!graph.nodes.length ? (
          discovery
        ) : (
          <div
            className="dr-graph-stage"
            style={{ width: graph.width * zoom, height: graph.height * zoom }}
          >
            <div
              className="dr-graph-canvas"
              style={{
                width: graph.width,
                height: graph.height,
                transform: `scale(${zoom})`,
              }}
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
                {graph.edges.map((edge) => {
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
              {graph.nodes.map((original) => {
                const node = {
                  ...original,
                  status: displayStatus(original.status, workflow),
                };
                return (
                  <button
                    key={node.id}
                    data-node-id={node.id}
                    className={
                      "dr-graph-node " +
                      node.status +
                      (selectedId === node.id
                        ? " selected"
                        : related.has(node.id)
                          ? " related"
                          : "")
                    }
                    style={{
                      left: node.x,
                      top: node.y,
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                    }}
                    onClick={() => {
                      setZoom(focusZoom());
                      onSelect(node.id);
                    }}
                    aria-pressed={selectedId === node.id}
                    aria-label={node.label + " · " + labelFor(node.status)}
                    title={node.label}
                  >
                    <svg
                      className="dr-cloud-shape"
                      viewBox="0 0 184 160"
                      aria-hidden="true"
                    >
                      <path d="M 36 135 C 18 135 7 122 7 105 C 7 89 18 77 34 76 C 36 59 48 48 64 48 C 77 21 111 19 128 40 C 135 48 139 57 139 66 C 161 69 177 84 177 104 C 177 123 163 135 145 135 Z" />
                    </svg>
                    <span className="dr-graph-node-meta">
                      <span>
                        <span
                          className={
                            "codicon codicon-" +
                            ({
                              search: "search",
                              verify: "verified",
                              synthesize: "symbol-misc",
                              write: "file-text",
                              review: "checklist",
                            }[node.kind] ?? "circle-small")
                          }
                        />
                        {labelFor(node.kind)}
                      </span>
                    </span>
                    <strong>{node.label}</strong>
                    <span className={"dr-node-state " + node.status}>
                      {node.status === "completed" && (
                        <span
                          aria-hidden="true"
                          className="codicon codicon-check"
                        />
                      )}
                      {labelFor(node.status)}
                    </span>
                    <span className="dr-graph-node-footer">
                      <span>
                        <span className="codicon codicon-person" />
                        {workers.find((worker) => worker.id === node.employeeId)
                          ?.label ?? "待分配"}
                      </span>
                      {!!node.sourceIds?.length && (
                        <span title="已产出证据来源">
                          <span className="codicon codicon-link" />
                          {node.sourceIds.length}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
