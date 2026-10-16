import {EMPLOYEE_SIZE, EMPLOYEE_TOP, MIN_ROOM_HEIGHT, constrainEmployee, type PlannedRoom, type Point, type RoomBounds} from './canvas'
import {isSupervisor} from './roles'
import {TEAM_GAP} from './office-layout'
import type {StoredSession} from './types'

export const ARRANGE_PATTERNS = ['circle', 'rectangle', 'grid'] as const
export type ArrangePattern = typeof ARRANGE_PATTERNS[number]
export type ArrangeScope = 'teams' | 'employees' | 'all'

const W = EMPLOYEE_SIZE.width, H = EMPLOYEE_SIZE.height
const GAP = 36
const PAD = 18

/** Deterministic member order: supervisors first, then workers; order[] is a stable preference. */
export function orderedTeamMembers(room: PlannedRoom, order?: string[], aroundId?: string): StoredSession[] {
  const members = room.employees.filter(item => !item.card.deleting).map(item => item.card)
  const rank = new Map<string, number>()
  for (const [i, id] of (order ?? []).entries()) if (!rank.has(id)) rank.set(id, i)
  const cmp = (a: StoredSession, b: StoredSession) => {
    const ao = rank.get(a.id), bo = rank.get(b.id)
    if (ao !== undefined && bo !== undefined) return ao - bo
    if (ao !== undefined) return -1
    if (bo !== undefined) return 1
    return (a.createdAt - b.createdAt) || a.id.localeCompare(b.id)
  }
  const supervisors = members.filter(c => isSupervisor(c.managementRole)).sort(cmp)
  const workers = members.filter(c => !isSupervisor(c.managementRole)).sort(cmp)
  const ordered = [...supervisors, ...workers]
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

function ringCenters(count: number, stepX: number, stepY: number): Point[] {
  if (!count) return []
  const slots = perimeterSlots(count)
  const maxX = Math.max(...slots.map(s => s[0]))
  const maxY = Math.max(...slots.map(s => s[1]))
  return slots.map(([sx, sy]) => ({x: (sx - maxX / 2) * stepX, y: (sy - maxY / 2) * stepY}))
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
 * frame grown just large enough. Supervisors come first; `order` is a stable
 * preference and `aroundId` becomes the center of a circle.
 */
export function arrangeTeamEmployees(room: PlannedRoom, pattern: ArrangePattern, order?: string[], aroundId?: string): {bounds: RoomBounds; employees: {card: StoredSession; position: Point}[]} {
  const members = orderedTeamMembers(room, order, aroundId)
  const bounds = {...room.bounds}
  if (!members.length) return {bounds, employees: []}
  const centerFirst = pattern === 'circle' && aroundId !== undefined && members[0].id === aroundId
  const stepX = W + GAP, stepY = H + GAP
  let centers: Point[]
  if (pattern === 'circle') {
    if (centerFirst) centers = [{x: 0, y: 0}, ...circleCenters(members.length - 1, W, H, 350)]
    else if (members.length === 1) centers = [{x: 0, y: 0}]
    else centers = circleCenters(members.length, W, H, 350)
  } else if (pattern === 'grid') {
    centers = gridCenters(members.length, stepX, stepY)
  } else {
    centers = ringCenters(members.length, stepX, stepY)
  }
  const spanX = Math.max(...centers.map(p => p.x)) - Math.min(...centers.map(p => p.x))
  const spanY = Math.max(...centers.map(p => p.y)) - Math.min(...centers.map(p => p.y))
  bounds.width = Math.max(bounds.width, 360, spanX + W + PAD * 2)
  bounds.height = Math.max(bounds.height, MIN_ROOM_HEIGHT, EMPLOYEE_TOP + spanY + H + PAD * 2)
  const cx = bounds.width / 2
  const cy = (EMPLOYEE_TOP + bounds.height - PAD) / 2
  const employees = centers.map((center, i) => ({
    card: members[i],
    position: constrainEmployee(bounds, {x: cx + center.x - W / 2, y: cy + center.y - H / 2})
  }))
  return {bounds, employees}
}

/**
 * Arrange rooms around an anchor point in world pixels. `aroundName` anchors a
 * room at the center of a circle; otherwise every room takes a ring/grid slot.
 */
export function arrangeRoomBounds(rooms: PlannedRoom[], pattern: ArrangePattern, anchor: Point, aroundName?: string): PlannedRoom[] {
  if (!rooms.length) return []
  const hasAround = aroundName !== undefined && rooms.some(r => r.name === aroundName)
  const ordered = hasAround ? [rooms.find(r => r.name === aroundName)!, ...rooms.filter(r => r.name !== aroundName)] : rooms
  const maxW = Math.max(...rooms.map(r => r.bounds.width), 360)
  const maxH = Math.max(...rooms.map(r => r.bounds.height), MIN_ROOM_HEIGHT)
  const stepX = maxW + TEAM_GAP, stepY = maxH + TEAM_GAP
  let centers: Point[]
  if (pattern === 'circle') {
    if (hasAround) centers = [{x: 0, y: 0}, ...circleCenters(rooms.length - 1, stepX, stepY, Math.hypot(stepX, stepY) + TEAM_GAP)]
    else if (rooms.length === 1) centers = [{x: 0, y: 0}]
    else centers = circleCenters(rooms.length, stepX, stepY, Math.hypot(stepX, stepY) + TEAM_GAP)
  } else if (pattern === 'grid') {
    centers = gridCenters(rooms.length, stepX, stepY)
  } else {
    centers = ringCenters(rooms.length, stepX, stepY)
  }
  return ordered.map((room, i) => {
    const center = centers[i]
    return {...room, bounds: {...room.bounds, x: anchor.x + center.x - room.bounds.width / 2, y: anchor.y + center.y - room.bounds.height / 2, pinned: true}}
  })
}
