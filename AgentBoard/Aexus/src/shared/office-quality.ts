import type {OfficeConnection} from './office-connections'
import type {CrossTeamRoute} from './cross-team-routing'
import type {Point} from './canvas'

const EPS = 1e-9

export type OfficeCrossing = {
  kind: 'cross' | 'overlap'
  /** The two routed connection IDs whose paths intersect. */
  connections: [string, string]
  /** Approximate world-space intersection point (or midpoint of an overlap). */
  point: Point
  /** False when a manual route is involved; automatic geometry can only clear auto-routed lines. */
  avoidable: boolean
  reason: string
}

export type OfficeQuality = {
  /** True interior line crossings (two lines passing through each other). */
  crossingCount: number
  /** Collinear overlaps of positive length, excluding a same-source shared trunk near the source. */
  overlapCount: number
  /** Connections that could not route cleanly (blocked cross-Team legs or in-room warnings). */
  blockedCount: number
  crossings: OfficeCrossing[]
  /** True when at least one crossing is clearable by automatic geometry (not manual/blocked). */
  avoidable: boolean
}

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS

const onSegment = (a: Point, b: Point, p: Point) =>
  Math.abs(orient(a, b, p)) <= EPS &&
  p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS &&
  p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS

/** Exact right-angle intersection of two orthogonal segments (general fallback included). */
function crossPoint(a: Point, b: Point, c: Point, d: Point): Point {
  const vertical1 = Math.abs(a.x - b.x) <= EPS, vertical2 = Math.abs(c.x - d.x) <= EPS
  if (vertical1 && !vertical2) return {x: a.x, y: c.y}
  if (!vertical1 && vertical2) return {x: c.x, y: a.y}
  const dx1 = b.x - a.x, dy1 = b.y - a.y, dx2 = d.x - c.x, dy2 = d.y - c.y
  const denom = dx1 * dy2 - dy1 * dx2
  if (Math.abs(denom) <= EPS) return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}
  const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / denom
  return {x: a.x + t * dx1, y: a.y + t * dy1}
}

/** Positive-length collinear overlap between two axis-aligned segments, or 0. */
function collinearOverlap(a: Point, b: Point, c: Point, d: Point): {length: number; point: Point} {
  const horizontal = Math.abs(a.y - b.y) <= EPS && Math.abs(c.y - d.y) <= EPS
  const vertical = Math.abs(a.x - b.x) <= EPS && Math.abs(c.x - d.x) <= EPS
  if (!horizontal && !vertical) return {length: 0, point: {x: 0, y: 0}}
  if (horizontal) {
    if (Math.abs(a.y - c.y) > EPS) return {length: 0, point: {x: 0, y: 0}}
    const lo = Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
    const hi = Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
    const length = hi - lo
    return length > EPS ? {length, point: {x: (lo + hi) / 2, y: a.y}} : {length: 0, point: {x: 0, y: 0}}
  }
  if (Math.abs(a.x - c.x) > EPS) return {length: 0, point: {x: 0, y: 0}}
  const lo = Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
  const hi = Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
  const length = hi - lo
  return length > EPS ? {length, point: {x: a.x, y: (lo + hi) / 2}} : {length: 0, point: {x: 0, y: 0}}
}

/** Straight-line (Manhattan) distance of each vertex from the path start. */
const cumulative = (points: Point[]) => {
  const d = [0]
  for (let i = 1; i < points.length; i++) d.push(d[i - 1] + Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y))
  return d
}

/**
 * Length of the geometric prefix both orthogonal polylines travel together from
 * their common start, in path distance. Point-index equality is deliberately not
 * used: the same trunk may be subdivided into different segment runs in the two
 * paths, so a vertex-by-vertex comparison would undercount the shared prefix.
 */
const commonPrefixLength = (a: Point[], b: Point[]) => {
  if (a.length < 2 || b.length < 2 || !samePoint(a[0], b[0])) return 0
  let i = 1, j = 1, length = 0, posA = a[0], posB = b[0]
  while (i < a.length && j < b.length) {
    const qa = a[i], qb = b[j]
    const aHorizontal = Math.abs(qa.x - posA.x) > EPS && Math.abs(qa.y - posA.y) <= EPS
    const bHorizontal = Math.abs(qb.x - posB.x) > EPS && Math.abs(qb.y - posB.y) <= EPS
    if (aHorizontal !== bHorizontal) break
    if (aHorizontal) {
      if (Math.abs(posA.y - posB.y) > EPS) break
      const dir = Math.sign(qa.x - posA.x), other = Math.sign(qb.x - posB.x)
      if (dir !== other) break
      const la = Math.abs(qa.x - posA.x), lb = Math.abs(qb.x - posB.x), advance = Math.min(la, lb)
      length += advance
      posA = {x: posA.x + dir * advance, y: posA.y}
      posB = {x: posB.x + dir * advance, y: posB.y}
      if (la <= lb + EPS) i++
      if (lb <= la + EPS) j++
    } else {
      if (Math.abs(posA.x - posB.x) > EPS) break
      const dir = Math.sign(qa.y - posA.y), other = Math.sign(qb.y - posB.y)
      if (dir !== other) break
      const la = Math.abs(qa.y - posA.y), lb = Math.abs(qb.y - posB.y), advance = Math.min(la, lb)
      length += advance
      posA = {x: posA.x, y: posA.y + dir * advance}
      posB = {x: posB.x, y: posB.y + dir * advance}
      if (la <= lb + EPS) i++
      if (lb <= la + EPS) j++
    }
  }
  return length
}

/**
 * True interior crossings and collinear overlaps over the canonical routed paths.
 * Shared endpoints, adjacent orthogonal corners and a same-source trunk on the
 * actual common prefix are never reported; arbitrary downstream overlap between
 * two fan lines is still reported even when they share a node.
 */
export function officeQuality(connections: OfficeConnection[], crossTeam: Array<Pick<CrossTeamRoute, 'status'>> = []): OfficeQuality {
  const segments: {connection: OfficeConnection; index: number; a: Point; b: Point}[] = []
  for (const connection of connections) {
    const points = connection.points ?? []
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]
      if (!samePoint(a, b)) segments.push({connection, index: i - 1, a, b})
    }
  }
  const crossings: OfficeCrossing[] = []
  const seen = new Set<string>()
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    const A = segments[i], B = segments[j]
    if (A.connection.id === B.connection.id) continue
    const o1 = orient(A.a, A.b, B.a), o2 = orient(A.a, A.b, B.b)
    const o3 = orient(B.a, B.b, A.a), o4 = orient(B.a, B.b, A.b)
    const properCross = ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))
    const connectionIds: [string, string] = A.connection.id < B.connection.id ? [A.connection.id, B.connection.id] : [B.connection.id, A.connection.id]
    const manual = A.connection.manual || B.connection.manual
    if (properCross) {
      const key = connectionIds.join('|') + ':cross'
      if (seen.has(key)) continue
      seen.add(key)
      crossings.push({
        kind: 'cross', connections: connectionIds, point: crossPoint(A.a, A.b, B.a, B.b), avoidable: !manual,
        reason: `Lines ${A.connection.id} and ${B.connection.id} cross${manual ? ' (a manual route is involved; it is not auto-avoidable)' : ''}; reposition the employees/rooms or drag the segment to remove the crossing`
      })
      continue
    }
    // Collinear (possibly overlapping) only when all four orientations vanish.
    if (Math.abs(o1) <= EPS && Math.abs(o2) <= EPS && Math.abs(o3) <= EPS && Math.abs(o4) <= EPS) {
      const overlap = collinearOverlap(A.a, A.b, B.a, B.b)
      if (overlap.length > EPS) {
        const sameSource = A.connection.managerId === B.connection.managerId
        const aPath = A.connection.points ?? [], bPath = B.connection.points ?? []
        const trunk = sameSource ? commonPrefixLength(aPath, bPath) : 0
        const sharedTrunk = trunk > EPS && cumulative(aPath)[A.index] < trunk - EPS && cumulative(bPath)[B.index] < trunk - EPS
        if (!sharedTrunk) {
          const key = connectionIds.join('|') + ':overlap'
          if (!seen.has(key)) {
            seen.add(key)
            crossings.push({
              kind: 'overlap', connections: connectionIds, point: overlap.point, avoidable: !manual,
              reason: `Lines ${A.connection.id} and ${B.connection.id} overlap${manual ? ' (a manual route is involved; it is not auto-avoidable)' : ''}; drag a segment or reposition to separate them`
            })
          }
        }
      }
      continue
    }
    // Endpoint touches (including T-junctions) are geometrically legal and ignored.
    if (onSegment(A.a, A.b, B.a) || onSegment(A.a, A.b, B.b) || onSegment(B.a, B.b, A.a) || onSegment(B.a, B.b, A.b)) continue
  }
  const crossingCount = crossings.filter(c => c.kind === 'cross').length
  const overlapCount = crossings.filter(c => c.kind === 'overlap').length
  const blockedCount = connections.filter(c => !!c.warning).length + crossTeam.filter(r => r.status === 'blocked').length
  return {crossingCount, overlapCount, blockedCount, crossings, avoidable: crossings.some(c => c.avoidable)}
}
