import {EMPLOYEE_SIZE, EMPLOYEE_TOP, MIN_ROOM_HEIGHT, constrainEmployee, type PlannedRoom, type Point, type RoomBounds} from './canvas'
import {isSupervisor} from './roles'
import {TEAM_GAP, roomsOverlap} from './office-layout'
import type {StoredSession} from './types'

export const ARRANGE_PATTERNS = ['circle', 'rectangle', 'grid'] as const
export type ArrangePattern = typeof ARRANGE_PATTERNS[number]
export type ArrangeScope = 'teams' | 'employees' | 'all'

const W = EMPLOYEE_SIZE.width, H = EMPLOYEE_SIZE.height
const GAP = 36
const PAD = 18

/** Rotate a ring order by shift slots; shift in [n, 2n) also mirrors the ring. */
function ringOrder<T>(list: T[], shift: number): T[] {
  if (!list.length) return []
  const n = list.length
  const reversed = shift >= n
  const k = ((shift % n) + n) % n
  const base = reversed ? [...list].reverse() : [...list]
  return [...base.slice(k), ...base.slice(0, k)]
}

/**
 * Deterministic member order. An explicit `order` is honored exactly (a
 * Secretary may sit anywhere the caller lists it); without one, supervisors
 * come first and ties break by creation time then ID. `aroundId` is always
 * moved to the front so it becomes the circle/rectangle center.
 */
export function orderedTeamMembers(room: PlannedRoom, order?: string[], aroundId?: string): StoredSession[] {
  const members = room.employees.filter(item => !item.card.deleting).map(item => item.card)
  const rank = new Map<string, number>()
  for (const [i, id] of (order ?? []).entries()) if (!rank.has(id)) rank.set(id, i)
  const hasOrder = order !== undefined && order.length > 0
  const byRoleThenAge = (a: StoredSession, b: StoredSession) => {
    const as = isSupervisor(a.managementRole) ? 0 : 1
    const bs = isSupervisor(b.managementRole) ? 0 : 1
    if (as !== bs) return as - bs
    return (a.createdAt - b.createdAt) || a.id.localeCompare(b.id)
  }
  const cmp = (a: StoredSession, b: StoredSession) => {
    const ao = rank.get(a.id), bo = rank.get(b.id)
    if (hasOrder) {
      if (ao !== undefined && bo !== undefined) return ao - bo
      if (ao !== undefined) return -1
      if (bo !== undefined) return 1
    }
    return byRoleThenAge(a, b)
  }
  const ordered = [...members].sort(cmp)
  if (aroundId) {
    const at = ordered.findIndex(c => c.id === aroundId)
    if (at > 0) { const [center] = ordered.splice(at, 1); ordered.unshift(center) }
  }
  return ordered
}

function perimeterSlots(count: number): [number, number][] {
  if (count <= 1) return [[0, 0]]
  let a = 1, b = 1
  while (2 * a + 2 * b - 4 < count) { if (a <= b) a++; else b++ }
  const slots: [number, number][] = []
  for (let x = 0; x < b; x++) slots.push([x, 0])
  for (let y = 1; y < a; y++) slots.push([b - 1, y])
  for (let x = b - 2; x >= 0; x--) slots.push([x, a - 1])
  for (let y = a - 2; y >= 1; y--) slots.push([0, y])
  return slots.slice(0, count)
}

function gridCenters(count: number, stepX: number, stepY: number): Point[] {
  if (!count) return []
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
  const rows = Math.ceil(count / cols)
  return Array.from({length: count}, (_, i) => {
    const col = i % cols, row = Math.floor(i / cols)
    return {x: (col - (cols - 1) / 2) * stepX, y: (row - (rows - 1) / 2) * stepY}
  })
}

/** Perimeter ring; minHalfX/minHalfY keep a centered ring clear of the center node. */
function ringCenters(count: number, stepX: number, stepY: number, minHalfX = 0, minHalfY = 0): Point[] {
  if (!count) return []
  if (count === 1) return [{x: minHalfX > 0 ? minHalfX : 0, y: 0}]
  const slots = perimeterSlots(count)
  const maxX = Math.max(...slots.map(s => s[0]))
  const maxY = Math.max(...slots.map(s => s[1]))
  const ex = maxX > 0 ? Math.max(stepX, (2 * minHalfX) / maxX) : stepX
  const ey = maxY > 0 ? Math.max(stepY, (2 * minHalfY) / maxY) : stepY
  return slots.map(([sx, sy]) => ({x: (sx - maxX / 2) * ex, y: (sy - maxY / 2) * ey}))
}

function circleCenters(count: number, spanX: number, spanY: number, minRadius: number): Point[] {
  if (!count) return []
  const radius = Math.max(minRadius, count * (Math.hypot(spanX, spanY) + GAP) / (2 * Math.PI))
  return Array.from({length: count}, (_, i) => {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2
    return {x: Math.cos(angle) * radius, y: Math.sin(angle) * radius}
  })
}

/**
 * Place a Team's employees into a circle, rectangle ring or grid, centered in a
 * frame grown just large enough. Supervisors come first; `order` is honored
 * exactly when provided and `aroundId` becomes the center of a circle or
 * rectangle. `ringShift` rotates (and optionally mirrors) the non-center ring
 * so `office.arrange --avoid-crossings` can search for a lower-crossing seat
 * order without changing who sits in the Team.
 */
export function arrangeTeamEmployees(room: PlannedRoom, pattern: ArrangePattern, order?: string[], aroundId?: string, ringShift = 0): {bounds: RoomBounds; employees: {card: StoredSession; position: Point}[]} {
  const members = orderedTeamMembers(room, order, aroundId)
  const bounds = {...room.bounds}
  if (!members.length) return {bounds, employees: []}
  const centered = pattern !== 'grid' && aroundId !== undefined && members.length > 1 && members[0].id === aroundId
  const seatOrder = centered ? [members[0], ...ringOrder(members.slice(1), ringShift)] : ringOrder(members, ringShift)
  const stepX = W + GAP, stepY = H + GAP
  let centers: Point[]
  if (pattern === 'circle') {
    if (centered) centers = [{x: 0, y: 0}, ...circleCenters(seatOrder.length - 1, W, H, 350)]
    else if (seatOrder.length === 1) centers = [{x: 0, y: 0}]
    else centers = circleCenters(seatOrder.length, W, H, 350)
  } else if (pattern === 'grid') {
    centers = gridCenters(seatOrder.length, stepX, stepY)
  } else {
    if (centered) centers = [{x: 0, y: 0}, ...ringCenters(seatOrder.length - 1, stepX, stepY, stepX, stepY)]
    else centers = ringCenters(seatOrder.length, stepX, stepY)
  }
  const spanX = Math.max(...centers.map(p => p.x)) - Math.min(...centers.map(p => p.x))
  const spanY = Math.max(...centers.map(p => p.y)) - Math.min(...centers.map(p => p.y))
  bounds.width = Math.max(bounds.width, 360, spanX + W + PAD * 2)
  bounds.height = Math.max(bounds.height, MIN_ROOM_HEIGHT, EMPLOYEE_TOP + spanY + H + PAD * 2)
  const cx = bounds.width / 2
  const cy = (EMPLOYEE_TOP + bounds.height - PAD) / 2
  const employees = centers.map((center, i) => ({
    card: seatOrder[i],
    position: constrainEmployee(bounds, {x: cx + center.x - W / 2, y: cy + center.y - H / 2})
  }))
  return {bounds, employees}
}

/**
 * Arrange rooms around an anchor point in world pixels. `aroundName` keeps that
 * room centered at `anchor` (preserving its named world center) while the rest
 * take ring/grid slots. `obstacles` are non-selected Teams that must not move;
 * the selected ring only grows until it clears them. `ringShift` rotates the
 * non-anchor ring for crossing reduction.
 */
export function arrangeRoomBounds(rooms: PlannedRoom[], pattern: ArrangePattern, anchor: Point, aroundName?: string, obstacles: RoomBounds[] = [], ringShift = 0): PlannedRoom[] {
  if (!rooms.length) return []
  const hasAround = aroundName !== undefined && rooms.some(r => r.name === aroundName)
  const ordered = hasAround ? [rooms.find(r => r.name === aroundName)!, ...rooms.filter(r => r.name !== aroundName)] : rooms
  const maxW = Math.max(...rooms.map(r => r.bounds.width), 360)
  const maxH = Math.max(...rooms.map(r => r.bounds.height), MIN_ROOM_HEIGHT)
  const stepX = maxW + TEAM_GAP, stepY = maxH + TEAM_GAP
  const minRadius = Math.hypot(stepX, stepY) + TEAM_GAP
  const centered = hasAround
  const ringCount = centered ? ordered.length - 1 : ordered.length
  const baseCenters = ((): Point[] => {
    if (pattern === 'circle') {
      if (centered) return [{x: 0, y: 0}, ...circleCenters(ringCount, stepX, stepY, minRadius)]
      if (ordered.length === 1) return [{x: 0, y: 0}]
      return circleCenters(ordered.length, stepX, stepY, minRadius)
    }
    if (pattern === 'grid') return gridCenters(ordered.length, stepX, stepY)
    if (centered) return [{x: 0, y: 0}, ...ringCenters(ringCount, stepX, stepY, stepX, stepY)]
    return ringCenters(ordered.length, stepX, stepY)
  })()
  const shifted = centered ? [baseCenters[0], ...ringOrder(baseCenters.slice(1), ringShift)] : ringOrder(baseCenters, ringShift)
  const place = (scale: number) => ordered.map((room, i) => ({
    ...room,
    bounds: {...room.bounds, x: anchor.x + shifted[i].x * scale - room.bounds.width / 2, y: anchor.y + shifted[i].y * scale - room.bounds.height / 2, pinned: true}
  }))
  let scale = 1
  let placed = place(scale)
  for (let attempt = 0; attempt < 64 && obstacles.length && placed.some(r => obstacles.some(o => roomsOverlap(r.bounds, o))); attempt++) {
    scale *= 1.25
    placed = place(scale)
  }
  return placed
}
