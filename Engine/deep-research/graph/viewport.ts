/** Pure viewport projections. Rendering may omit offscreen DOM; domain graph stays complete. */
export type GraphPoint = { x: number; y: number };
export type GraphSize = { width: number; height: number };
export type CanvasNode = GraphPoint & { id: string; status?: string };
export type CanvasEdge = { from: string; to: string };
export type CanvasWindow = GraphSize & { stageX: number; stageY: number; zoom: number };
export type MiniProjection = GraphSize & { scale: number; offsetX: number; offsetY: number };
export type MiniDot = GraphPoint & { status: string; count: number };

export function visibleGraph<T extends CanvasNode>(
  nodes: readonly T[],
  edges: readonly CanvasEdge[],
  window: CanvasWindow,
  nodeSize: GraphSize,
  selectedId?: string,
  overscanPx = 450,
): { nodes: T[]; edges: CanvasEdge[] } {
  if (!Number.isFinite(window.zoom) || window.zoom <= 0 ||
      window.width <= 0 || window.height <= 0) return { nodes: [...nodes], edges: [...edges] };
  const x0 = (-window.stageX - overscanPx) / window.zoom;
  const y0 = (-window.stageY - overscanPx) / window.zoom;
  const x1 = (window.width - window.stageX + overscanPx) / window.zoom;
  const y1 = (window.height - window.stageY + overscanPx) / window.zoom;
  const onscreen = (node: CanvasNode) => node.x <= x1 && node.x + nodeSize.width >= x0 &&
    node.y <= y1 && node.y + nodeSize.height >= y0;
  const included = new Set<string>();
  const visible = nodes.filter(node => {
    if (!onscreen(node) && node.id !== selectedId) return false;
    included.add(node.id);
    return true;
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const visibleEdges = edges.filter(edge => {
    if (included.has(edge.from) || included.has(edge.to)) return true;
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) return false;
    // Long cross-branch links can pass through the viewport without an endpoint inside.
    const left = Math.min(from.x, to.x), right = Math.max(from.x, to.x) + nodeSize.width;
    const top = Math.min(from.y, to.y), bottom = Math.max(from.y, to.y) + nodeSize.height;
    return left <= x1 && right >= x0 && top <= y1 && bottom >= y0;
  });
  return { nodes: visible, edges: visibleEdges };
}

export function miniProjection(size: GraphSize, area: GraphSize, padding = 6): MiniProjection {
  const width = Math.max(1, area.width), height = Math.max(1, area.height);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(availableWidth / Math.max(1, size.width),
    availableHeight / Math.max(1, size.height));
  return {
    width, height, scale,
    offsetX: (width - size.width * scale) / 2,
    offsetY: (height - size.height * scale) / 2,
  };
}

export function toMini(point: GraphPoint, p: MiniProjection): GraphPoint {
  return { x: point.x * p.scale + p.offsetX, y: point.y * p.scale + p.offsetY };
}
export function fromMini(point: GraphPoint, p: MiniProjection): GraphPoint {
  return { x: (point.x - p.offsetX) / p.scale, y: (point.y - p.offsetY) / p.scale };
}

const priority: Record<string, number> = {
  failed: 9, stopping: 8, running: 7, working: 7, paused: 6,
  pending: 4, prepared: 4, completed: 2,
};

/** Aggregate nearby marks to keep enormous maps legible and bound SVG elements. */
export function miniDots(
  nodes: readonly CanvasNode[], projection: MiniProjection, size: GraphSize, cell = 5,
): MiniDot[] {
  const buckets = new Map<string, MiniDot>();
  for (const node of nodes) {
    const point = toMini({ x: node.x + size.width / 2, y: node.y + size.height / 2 }, projection);
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}`;
    const previous = buckets.get(key);
    if (!previous) buckets.set(key, { x: point.x, y: point.y, count: 1, status: node.status ?? "pending" });
    else {
      previous.count++;
      if ((priority[node.status ?? ""] ?? 0) > (priority[previous.status] ?? 0))
        previous.status = node.status ?? "pending";
    }
  }
  return [...buckets.values()];
}

export function miniViewport(
  window: CanvasWindow, projection: MiniProjection,
): { x: number; y: number; width: number; height: number } {
  const start = toMini({
    x: -window.stageX / Math.max(0.001, window.zoom),
    y: -window.stageY / Math.max(0.001, window.zoom),
  }, projection);
  const dimensions = {
    width: window.width / Math.max(0.001, window.zoom) * projection.scale,
    height: window.height / Math.max(0.001, window.zoom) * projection.scale,
  };
  const x = Math.max(0, Math.min(projection.width, start.x));
  const y = Math.max(0, Math.min(projection.height, start.y));
  return {
    x, y,
    width: Math.max(0, Math.min(projection.width, start.x + dimensions.width) - x),
    height: Math.max(0, Math.min(projection.height, start.y + dimensions.height) - y),
  };
}
