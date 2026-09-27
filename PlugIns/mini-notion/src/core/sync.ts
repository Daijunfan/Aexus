import type { Workspace } from '../types.ts';
import type { ApiResponse, StateEvent } from './protocol.ts';
import { applyWorkspacePatch, diffWorkspace, hasChanges, type WorkspacePatch } from './patch.ts';

export type SyncState = {
  workspace: Workspace;
  pending: WorkspacePatch[];
  saving: boolean;
  error: string;
  conflictId?: string;
};
export class WorkspaceSync {
  confirmed: Workspace;
  pending: WorkspacePatch[] = [];
  error = '';
  conflictId?: string;
  private running?: Promise<void>;
  private listeners = new Set<(state: SyncState) => void>();
  private request: (method: string, params: any, id?: string) => Promise<ApiResponse>;
  constructor(
    workspace: Workspace,
    request: (method: string, params: any, id?: string) => Promise<ApiResponse>,
  ) {
    this.confirmed = workspace;
    this.request = request;
  }
  get workspace() {
    return this.pending.reduce((state, patch) => applyWorkspacePatch(state, patch, true), this.confirmed);
  }
  subscribe(listener: (state: SyncState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit() {
    const state = {
      workspace: this.workspace,
      pending: this.pending,
      saving: !!this.pending.length && !this.error,
      error: this.error,
      conflictId: this.conflictId,
    };
    this.listeners.forEach((listener) => listener(state));
  }
  receive(event: StateEvent) {
    if (!event.workspace) return;
    if (event.resolution) {
      const failed = this.pending.find((patch) => patch.id === event.resolution!.patchId);
      if (failed) {
        const pages = new Set(failed.pages.map((page) => page.id));
        this.pending = this.pending.filter((patch) => patch.id !== failed.id);
        if (event.resolution.strategy === 'remote')
          this.pending = this.pending
            .map((patch) => ({ ...patch, pages: patch.pages.filter((page) => !pages.has(page.id)) }))
            .filter(hasChanges);
        this.conflictId = undefined;
        this.error = '';
      }
    }
    if (event.requestId) this.pending = this.pending.filter((patch) => patch.id !== event.requestId);
    if (event.revision >= (this.confirmed.revision || 0)) this.confirmed = event.workspace;
    this.emit();
    if (event.resolution && !this.error) void this.flush();
  }
  update(next: Workspace) {
    const patch = diffWorkspace(this.workspace, next);
    if (!hasChanges(patch)) return;
    this.pending.push(patch);
    this.emit();
    void this.flush();
  }
  recover(patches: WorkspacePatch[], conflict?: { id: string; message: string }) {
    this.pending.push(...patches);
    if (conflict) {
      this.conflictId = conflict.id;
      this.error = conflict.message;
    }
    this.emit();
    void this.flush();
  }
  async flush(): Promise<void> {
    if (this.running) return this.running;
    if (this.error) return;
    this.running = (async () => {
      while (this.pending.length && !this.error) {
        const patch = this.pending[0];
        try {
          const response = await this.request('workspace.patch', { patch }, patch.id);
          if (response.error) {
            if (response.workspace)
              this.receive({ type: 'state', workspace: response.workspace, revision: response.revision });
            this.error = response.error.message;
            this.conflictId = response.error.details?.conflictId;
            this.emit();
            break;
          }
          this.receive({
            type: 'state',
            workspace: response.workspace!,
            revision: response.revision,
            requestId: patch.id,
          });
        } catch (error) {
          this.error = error instanceof Error ? error.message : String(error);
          this.emit();
          break;
        }
      }
    })().finally(() => {
      this.running = undefined;
      if (this.pending.length && !this.error) void this.flush();
    });
    return this.running;
  }
  async retry() {
    if (this.conflictId) return false;
    this.error = '';
    this.emit();
    await this.flush();
    return !this.error;
  }
  async resolve(strategy: 'local' | 'remote') {
    if (!this.conflictId) return;
    const failed = this.pending[0];
    const id = this.conflictId;
    const response = await this.request('conflict.resolve', { id, strategy });
    if (response.error) throw new Error(response.error.message);
    if (response.workspace)
      this.receive({
        type: 'state',
        workspace: response.workspace,
        revision: response.revision,
        resolution: { id, patchId: failed.id, strategy: response.result.strategy || strategy },
      });
    await this.flush();
    this.emit();
  }
}
