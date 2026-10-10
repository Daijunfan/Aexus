/** UI-only camera math. Coordinates here never change workflow dependencies. */
export type PlacedNode = { id: string; x: number; y: number };
export type DirectionKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export type Point = { x: number; y: number };
export type ViewSize = { width: number; height: number };

export const clampZoom = (value: number, min = 0.05, max = 1.5) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : 1));

export function focusZoom(
  nodes: readonly PlacedNode[],
  edges: readonly { from: string; to: string }[],
  id: string,
  viewport: ViewSize,
  card: ViewSize,
) {
  const related = new Set([id]);
  for (const edge of edges) {
    if (edge.from === id) related.add(edge.to);
    if (edge.to === id) related.add(edge.from);
  }
  const around = nodes.filter(node => related.has(node.id));
  if (!around.length || viewport.width <= 0 || viewport.height <= 0) return 1;
  const width = Math.max(...around.map(node => node.x)) -
    Math.min(...around.map(node => node.x)) + card.width;
  const height = Math.max(...around.map(node => node.y)) -
    Math.min(...around.map(node => node.y)) + card.height;
  // Keep a readable card even for unusually broad fan-in/fan-out graphs.
  return Math.max(0.85, Math.min(1, (viewport.width - 32) / width, (viewport.height - 32) / height));
}

export function nearestNode(
  nodes: readonly PlacedNode[], center: Point, card: ViewSize,
): PlacedNode | undefined {
  let winner: PlacedNode | undefined;
  let best = Infinity;
  for (const node of nodes) {
    const dx = node.x + card.width / 2 - center.x;
    const dy = node.y + card.height / 2 - center.y;
    const distance = dx * dx + dy * dy;
    if (distance < best) { winner = node; best = distance; }
  }
  return winner;
}

export function nextDirectionalNode(
  nodes: readonly PlacedNode[], currentId: string, key: DirectionKey,
): PlacedNode | undefined {
  const current = nodes.find(node => node.id === currentId);
  if (!current) return undefined;
  const horizontal = key === "ArrowLeft" || key === "ArrowRight";
  const sign = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  let winner: PlacedNode | undefined;
  let best = Infinity;
  for (const node of nodes) {
    if (node.id === currentId) continue;
    const dx = node.x - current.x, dy = node.y - current.y;
    const forward = (horizontal ? dx : dy) * sign;
    if (forward <= 0) continue;
    const sideways = Math.abs(horizontal ? dy : dx);
    const score = forward + sideways * 2;
    if (score < best) { winner = node; best = score; }
  }
  return winner;
}

export function anchoredScroll(
  scroll: { left: number; top: number },
  projected: Point,
  desired: Point,
) {
  return {
    left: Math.max(0, scroll.left + projected.x - desired.x),
    top: Math.max(0, scroll.top + projected.y - desired.y),
  };
}
