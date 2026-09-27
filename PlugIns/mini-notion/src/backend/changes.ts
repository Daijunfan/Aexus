import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from '../../electron/storage.cjs';
import { applyWorkspacePatch, diffWorkspace, hasChanges, type WorkspacePatch } from '../core/patch';
import { CommandError } from '../core/errors';
import type { ApiRequest } from '../core/protocol';
import type { Workspace } from '../types';

type Change = {
  id: string;
  at: number;
  method: string;
  client?: string;
  patch: WorkspacePatch;
  undoneAt?: number;
};
const nonReversible = new Set([
  'space.sync',
  'file.resolve',
  'file.write-content',
  'agent.rewind',
  'agent.revert',
  'page.purge',
]);
export class Changes {
  private file: string;
  private entries: Change[];
  constructor(directory: string) {
    this.file = path.join(directory, 'changes.json');
    this.entries = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : [];
  }
  private save() {
    atomicWrite(this.file, this.entries.slice(-150));
  }
  restore(entries: Change[]) {
    if (!Array.isArray(entries) || entries.some((entry) => !entry.id || !Array.isArray(entry.patch?.pages)))
      throw new CommandError('INVALID_HISTORY', '备份中的操作记录无效');
    this.entries = entries.slice(-150);
    this.save();
  }
  export() {
    return this.entries;
  }
  record(before: Workspace, after: Workspace, request: ApiRequest) {
    // These synchronize external bytes; reversing metadata alone cannot restore the files.
    if (
      ['history.undo', 'history.redo'].includes(request.method) ||
      (nonReversible.has(request.method) && request.method !== 'page.purge')
    )
      return;
    const patch = diffWorkspace(before, after);
    if (patch.meta) {
      const keep = (value: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(value).filter(([key]) => ['name', 'settings'].includes(key)));
      patch.meta = { before: keep(patch.meta.before), after: keep(patch.meta.after) };
      if (!Object.keys(patch.meta.before).length && !Object.keys(patch.meta.after).length) delete patch.meta;
    }
    if (!hasChanges(patch)) return;
    const last = this.entries.at(-1),
      now = Date.now();
    const typing = (patch: WorkspacePatch) => {
      const change = patch.pages.length === 1 ? patch.pages[0] : undefined;
      return (
        !!change?.before &&
        !!change.after &&
        JSON.stringify({
          ...change.before,
          title: change.after.title,
          blocks: change.after.blocks,
          updatedAt: change.after.updatedAt,
        }) === JSON.stringify(change.after)
      );
    };
    const coalesce =
      request.client?.startsWith('gui-') &&
      request.method === 'workspace.patch' &&
      last?.method === request.method &&
      last.client === request.client &&
      !last.undoneAt &&
      now - last.at < 800 &&
      !patch.order &&
      !patch.meta &&
      patch.pages.length === 1 &&
      last.patch.pages.length === 1 &&
      last.patch.pages[0].id === patch.pages[0].id &&
      last.patch.pages[0].before &&
      patch.pages[0].after &&
      typing(last.patch) &&
      typing(patch);
    if (coalesce) {
      last.at = now;
      last.patch.pages[0].after = patch.pages[0].after;
    } else
      this.entries.push({ id: patch.id, at: now, method: request.method, client: request.client, patch });
    this.entries = this.entries.slice(-150);
    this.save();
  }
  list(pageId?: string) {
    return this.entries
      .filter((entry) => !pageId || entry.patch.pages.some((page) => page.id === pageId))
      .slice()
      .reverse()
      .map(({ patch, ...entry }) => ({
        ...entry,
        reversible: !nonReversible.has(entry.method),
        pageIds: patch.pages.map((page) => page.id),
      }));
  }
  apply(workspace: Workspace, redo: boolean, params: { id?: string; pageId?: string }) {
    const entry = this.entries
      .slice()
      .reverse()
      .find((entry) =>
        params.id
          ? entry.id === params.id
          : !nonReversible.has(entry.method) &&
            !!entry.undoneAt === redo &&
            (!params.pageId || entry.patch.pages.some((page) => page.id === params.pageId)),
      );
    if (!entry) throw new CommandError('NO_HISTORY', redo ? '没有可重做的操作' : '没有可撤销的操作');
    if (nonReversible.has(entry.method))
      throw new CommandError('NON_REVERSIBLE_OPERATION', '此操作不能通过页面操作历史撤销');
    if (!!entry.undoneAt !== redo) throw new CommandError('INVALID_HISTORY', '此操作的撤销状态已变化');
    const patch = redo
      ? entry.patch
      : {
          ...entry.patch,
          pages: entry.patch.pages.map((page) => ({ ...page, before: page.after, after: page.before })),
          ...(entry.patch.meta
            ? { meta: { before: entry.patch.meta.after, after: entry.patch.meta.before } }
            : {}),
          ...(entry.patch.order
            ? { order: { before: entry.patch.order.after, after: entry.patch.order.before } }
            : {}),
        };
    const next = applyWorkspacePatch(workspace, patch);
    // Record the marker only after the workspace commit succeeds.
    return {
      workspace: next,
      id: entry.id,
      committed: () => {
        entry.undoneAt = redo ? undefined : Date.now();
        this.save();
      },
    };
  }
}
