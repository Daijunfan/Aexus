import type { Page, Workspace } from '../types.ts';
import { CommandError } from './errors.ts';

export type WorkspacePatch = {
  id: string;
  pages: { id: string; before: Page | null; after: Page | null }[];
  meta?: { before: Record<string, unknown>; after: Record<string, unknown> };
  order?: { before: string[]; after: string[] };
};

const absent = Symbol('absent');
type Missing = typeof absent;
const same = (a: unknown, b: unknown) =>
  a === b || (a !== absent && b !== absent && JSON.stringify(a) === JSON.stringify(b));
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function conflict(path: string, before: unknown, after: unknown, current: unknown, force: boolean): unknown {
  if (force) return after;
  throw new CommandError('CONFLICT', `「${path}」在另一端发生了修改，草稿未覆盖已有内容。`, {
    path,
    before: before === absent ? null : before,
    after: after === absent ? null : after,
    current: current === absent ? null : current,
  });
}

function mergeOrder(
  before: string[],
  after: string[],
  current: string[],
  force: boolean,
  path: string,
): string[] {
  if (same(before, after)) return current;
  if (same(before, current) || same(after, current)) return after;
  const common = new Set(before.filter((id) => after.includes(id) && current.includes(id)));
  const baseRelative = before.filter((id) => common.has(id));
  const afterRelative = after.filter((id) => common.has(id));
  const currentRelative = current.filter((id) => common.has(id));
  if (
    !same(baseRelative, afterRelative) &&
    !same(baseRelative, currentRelative) &&
    !same(afterRelative, currentRelative)
  )
    return conflict(path, before, after, current, force) as string[];
  const preferred = same(baseRelative, afterRelative) ? current : after;
  const secondary = preferred === current ? after : current;
  const result = preferred.filter(
    (id) => !before.includes(id) || (after.includes(id) && current.includes(id)),
  );
  for (let i = secondary.length - 1; i >= 0; i--) {
    const id = secondary[i];
    if (result.includes(id) || (before.includes(id) && (!after.includes(id) || !current.includes(id))))
      continue;
    const anchor = secondary.slice(i + 1).find((id) => result.includes(id));
    result.splice(anchor ? result.indexOf(anchor) : result.length, 0, id);
  }
  return result;
}

export function mergeChanges(
  before: unknown,
  after: unknown,
  current: unknown,
  path = '',
  force = false,
): unknown {
  if (same(before, after)) return current;
  if (same(before, current) || same(after, current)) return after;
  if (path.endsWith('.updatedAt') && typeof after === 'number' && typeof current === 'number')
    return Math.max(after, current);
  if (['workspace.activePageId', 'workspace.expanded', 'workspace.recent'].includes(path)) return after;
  if (object(before) && object(after) && object(current)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after), ...Object.keys(current)]);
    const result: [string, unknown][] = [];
    for (const key of keys) {
      const value = mergeChanges(
        Object.hasOwn(before, key) ? before[key] : absent,
        Object.hasOwn(after, key) ? after[key] : absent,
        Object.hasOwn(current, key) ? current[key] : absent,
        `${path}.${key}`,
        force,
      );
      if (value !== absent) result.push([key, value]);
    }
    return Object.fromEntries(result);
  }
  if (Array.isArray(before) && Array.isArray(after) && Array.isArray(current)) {
    const hasIds = (values: unknown[]) =>
      values.every((value) => object(value) && typeof value.id === 'string');
    if (hasIds(before) && hasIds(after) && hasIds(current)) {
      const map = (values: Record<string, unknown>[]) =>
        new Map(values.map((value) => [String(value.id), value]));
      const a = map(before),
        b = map(after),
        c = map(current);
      const ids = new Set([...a.keys(), ...b.keys(), ...c.keys()]);
      const merged = new Map<string, unknown>();
      for (const id of ids) {
        const value = mergeChanges(
          a.get(id) ?? absent,
          b.get(id) ?? absent,
          c.get(id) ?? absent,
          `${path}[${id}]`,
          force,
        );
        if (value !== absent) merged.set(id, value);
      }
      return mergeOrder([...a.keys()], [...b.keys()], [...c.keys()], force, path)
        .filter((id) => merged.has(id))
        .map((id) => merged.get(id));
    }
  }
  return conflict(path, before, after, current, force);
}

export function diffWorkspace(before: Workspace, after: Workspace, id = crypto.randomUUID()): WorkspacePatch {
  const base = json(before),
    next = json(after);
  const oldPages = new Map(base.pages.map((page) => [page.id, page]));
  const newPages = new Map(next.pages.map((page) => [page.id, page]));
  const changes = [...new Set([...oldPages.keys(), ...newPages.keys()])].flatMap((id) => {
    const a = oldPages.get(id) || null,
      b = newPages.get(id) || null;
    return same(a, b) ? [] : [{ id, before: a, after: b }];
  });
  const metadata = (workspace: Workspace) =>
    Object.fromEntries(Object.entries(workspace).filter(([key]) => key !== 'pages' && key !== 'revision'));
  const a = metadata(base),
    b = metadata(next);
  const keys = Object.keys({ ...a, ...b }).filter((key) => !same(a[key], b[key]));
  const oldOrder = base.pages.map((page) => page.id),
    newOrder = next.pages.map((page) => page.id);
  return {
    id,
    pages: changes,
    ...(keys.length
      ? {
          meta: {
            before: Object.fromEntries(
              keys.filter((key) => Object.hasOwn(a, key)).map((key) => [key, a[key]]),
            ),
            after: Object.fromEntries(
              keys.filter((key) => Object.hasOwn(b, key)).map((key) => [key, b[key]]),
            ),
          },
        }
      : {}),
    ...(!same(oldOrder, newOrder) ? { order: { before: oldOrder, after: newOrder } } : {}),
  };
}

export function applyWorkspacePatch(workspace: Workspace, patch: WorkspacePatch, force = false): Workspace {
  const pages = new Map(workspace.pages.map((page) => [page.id, page]));
  for (const change of patch.pages) {
    const current = pages.get(change.id) || null;
    const merged = mergeChanges(
      change.before,
      change.after,
      current,
      `pages[${change.id}]`,
      force,
    ) as Page | null;
    if (merged) pages.set(change.id, merged);
    else pages.delete(change.id);
  }
  const keys = new Set([...Object.keys(patch.meta?.before || {}), ...Object.keys(patch.meta?.after || {})]);
  let result = workspace;
  if (patch.meta) {
    const current = Object.fromEntries(Object.entries(workspace).filter(([key]) => keys.has(key)));
    const metadata = mergeChanges(
      patch.meta.before,
      patch.meta.after,
      current,
      'workspace',
      force,
    ) as Partial<Workspace>;
    result = {
      ...Object.fromEntries(Object.entries(workspace).filter(([key]) => !keys.has(key))),
      ...metadata,
    } as Workspace;
  }
  const order = patch.order
    ? mergeOrder(
        patch.order.before,
        patch.order.after,
        workspace.pages.map((page) => page.id),
        force,
        'workspace.pages.order',
      )
    : workspace.pages.map((page) => page.id);
  return {
    ...result,
    pages: [
      ...order.filter((id) => pages.has(id)).map((id) => pages.get(id)!),
      ...[...pages.values()].filter((page) => !order.includes(page.id)),
    ],
  };
}

export function hasChanges(patch: WorkspacePatch) {
  return !!(patch.pages.length || patch.meta || patch.order);
}
