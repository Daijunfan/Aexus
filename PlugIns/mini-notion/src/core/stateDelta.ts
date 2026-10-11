import type { Page, Workspace } from '../types';

export type WorkspaceDelta = {
  baseRevision: number;
  revision: number;
  pages: Page[];
  removed: string[];
  order?: string[];
  meta: Partial<Omit<Workspace, 'pages'>>;
  unset: string[];
};

const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Additive wire format. Old clients keep full snapshots; opted-in clients receive
 * changed pages and metadata only. Page IDs and all domain APIs are unchanged. */
export function workspaceDelta(before: Workspace, after: Workspace): WorkspaceDelta {
  const old = new Map(before.pages.map(page => [page.id, page]));
  const next = new Set(after.pages.map(page => page.id));
  const meta: Record<string, unknown> = {}, unset: string[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'pages') continue;
    const a = (before as any)[key], b = (after as any)[key];
    if (equal(a, b)) continue;
    if (b === undefined) unset.push(key); else meta[key] = b;
  }
  const order = after.pages.map(page => page.id);
  return {
    baseRevision: before.revision || 0, revision: after.revision || 0,
    pages: after.pages.filter(page => page !== old.get(page.id)),
    removed: before.pages.filter(page => !next.has(page.id)).map(page => page.id),
    ...(order.length !== before.pages.length || order.some((id, i) => before.pages[i]?.id !== id) ? { order } : {}),
    meta, unset,
  };
}

export function applyWorkspaceDelta(before: Workspace | null | undefined, delta: WorkspaceDelta): Workspace | null {
  if (!before) return null;
  if ((before.revision || 0) >= delta.revision) return before;
  if ((before.revision || 0) !== delta.baseRevision) return null;
  const metadata: Record<string, unknown> = { ...before, ...delta.meta, revision: delta.revision };
  for (const key of delta.unset) delete metadata[key];
  if (!delta.pages.length && !delta.removed.length && !delta.order) return metadata as Workspace;
  const pages = new Map(before.pages.map(page => [page.id, page]));
  for (const id of delta.removed) pages.delete(id);
  for (const page of delta.pages) {
    const old = pages.get(page.id);
    // JSON transport gives new references even for unchanged blocks on a title edit.
    // Recover structural sharing without comparing unrelated notebook pages.
    const shared = old ? Object.fromEntries(Object.entries(page).map(([key, value]) => [key, equal((old as any)[key], value) ? (old as any)[key] : value])) as Page : page;
    pages.set(page.id, shared);
  }
  const order = delta.order || [...pages.keys()];
  return { ...metadata, pages: order.filter(id => pages.has(id)).map(id => pages.get(id)!) } as Workspace;
}
