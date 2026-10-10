import type { DomainEntity, DomainRelationship } from "../knowledge/index.mjs";

export const RELATION_NODE_WIDTH = 180;
export const RELATION_NODE_HEIGHT = 90;
const COLUMN_GAP = 65;
const ROW_GAP = 72;
const GROUP_PAD = 26;
const GROUP_HEADER = 34;

export type PlacedEntity = DomainEntity & { x: number; y: number };
export type EntityGroup = {
  id: string; x: number; y: number; width: number; height: number;
  label: string; nodeIds: string[];
};
export type PlacedRelationship = DomainRelationship & {
  path: string; labelX: number; labelY: number;
};

function connections(entities: readonly DomainEntity[], relationships: readonly DomainRelationship[]) {
  const adjacency = new Map(entities.map(entity => [entity.id, new Set<string>()]));
  for (const relation of relationships) {
    if (!adjacency.has(relation.from) || !adjacency.has(relation.to)) continue;
    adjacency.get(relation.from)!.add(relation.to);
    adjacency.get(relation.to)!.add(relation.from);
  }
  const visited = new Set<string>(), groups: string[][] = [], isolated: string[] = [];
  for (const entity of entities) {
    if (visited.has(entity.id)) continue;
    const component = [entity.id];
    visited.add(entity.id);
    for (let i = 0; i < component.length; i++)
      for (const id of adjacency.get(component[i]) ?? [])
        if (!visited.has(id)) {
          visited.add(id);
          component.push(id);
        }
    if (component.length === 1 && adjacency.get(entity.id)?.size === 0) isolated.push(entity.id);
    else groups.push(component);
  }
  if (isolated.length) groups.push(isolated);
  return { groups, isolated: new Set(isolated) };
}

export function relationshipPath(
  from: { x: number; y: number }, to: { x: number; y: number },
  offset = 0,
): { path: string; labelX: number; labelY: number } {
  const a = { x: from.x + RELATION_NODE_WIDTH / 2, y: from.y + RELATION_NODE_HEIGHT / 2 };
  const b = { x: to.x + RELATION_NODE_WIDTH / 2, y: to.y + RELATION_NODE_HEIGHT / 2 };
  if (a.x === b.x && a.y === b.y) {
    const x = from.x + RELATION_NODE_WIDTH - 23, y = from.y + 4;
    return {
      path: `M${x},${y} C${x + 42},${y - 75} ${x - 60},${y - 78} ${x - 64},${y}`,
      labelX: x - 24, labelY: y - 47,
    };
  }
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const direction = Math.sign(dx);
    const x1 = a.x + RELATION_NODE_WIDTH / 2 * direction;
    const x2 = b.x - RELATION_NODE_WIDTH / 2 * direction;
    const curve = Math.max(24, Math.abs(x2 - x1) * .45);
    return {
      path: `M${x1},${a.y} C${x1 + curve * direction},${a.y + offset} ${x2 - curve * direction},${b.y + offset} ${x2},${b.y}`,
      labelX: (x1 + x2) / 2, labelY: (a.y + b.y) / 2 + offset * .7,
    };
  }
  const direction = Math.sign(dy);
  const y1 = a.y + RELATION_NODE_HEIGHT / 2 * direction;
  const y2 = b.y - RELATION_NODE_HEIGHT / 2 * direction;
  const curve = Math.max(26, Math.abs(y2 - y1) * .45);
  return {
    path: `M${a.x},${y1} C${a.x + offset},${y1 + curve * direction} ${b.x + offset},${y2 - curve * direction} ${b.x},${y2}`,
    labelX: (a.x + b.x) / 2 + offset * .7, labelY: (y1 + y2) / 2,
  };
}

/** Connected-component packing accepts cycles and does not infer semantic hierarchy. */
export function layoutKnowledgeRelations(
  entities: readonly DomainEntity[],
  relationships: readonly DomainRelationship[],
  maxRowWidth = 1150,
) {
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  const validRelations = relationships.filter(edge => byId.has(edge.from) && byId.has(edge.to));
  const { groups: components, isolated } = connections(entities, validRelations);
  const placed: PlacedEntity[] = [], groups: EntityGroup[] = [];
  let nextX = 24, nextY = 22, rowHeight = 0, maxRight = 0, groupIndex = 0;
  for (const component of components) {
    const columns = Math.min(4, component.length);
    const rows = Math.ceil(component.length / columns);
    const width = GROUP_PAD * 2 + columns * RELATION_NODE_WIDTH + (columns - 1) * COLUMN_GAP;
    const height = GROUP_HEADER + GROUP_PAD * 2 + rows * RELATION_NODE_HEIGHT + (rows - 1) * ROW_GAP;
    if (nextX > 24 && nextX + width > Math.max(440, maxRowWidth)) {
      nextX = 24; nextY += rowHeight + 24; rowHeight = 0;
    }
    const originX = nextX, originY = nextY;
    component.forEach((id, index) => {
      const entity = byId.get(id)!;
      placed.push({
        ...entity,
        x: originX + GROUP_PAD + index % columns * (RELATION_NODE_WIDTH + COLUMN_GAP),
        y: originY + GROUP_HEADER + GROUP_PAD + Math.floor(index / columns) * (RELATION_NODE_HEIGHT + ROW_GAP),
      });
    });
    const standalone = component.every(id => isolated.has(id));
    groups.push({
      id: "group-" + groupIndex, x: originX, y: originY, width, height,
      label: standalone ? `尚无已知关系 · ${component.length} 个实体` :
        `关系组 ${++groupIndex} · ${component.length} 个实体`,
      nodeIds: component,
    });
    maxRight = Math.max(maxRight, originX + width);
    nextX += width + 24;
    rowHeight = Math.max(rowHeight, height);
  }
  const positions = new Map(placed.map(entity => [entity.id, entity]));
  const directedPairs = new Map<string, number>();
  const edges: PlacedRelationship[] = validRelations.map(relation => {
    const from = positions.get(relation.from)!, to = positions.get(relation.to)!;
    const key = [relation.from, relation.to].sort().join("::");
    const count = directedPairs.get(key) ?? 0;
    directedPairs.set(key, count + 1);
    const geom = relationshipPath(from, to, count % 2 ? 22 : 0);
    return { ...relation, ...geom };
  });
  return {
    nodes: placed, edges, groups,
    width: Math.max(360, maxRight + 24),
    height: Math.max(250, nextY + rowHeight + 24),
  };
}
