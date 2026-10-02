import type { WorkspacePatch } from './patch';

type Draft = { patches: WorkspacePatch[]; conflictId?: string; error: string };
/** One writer for the latest recoverable edit batch. A slow older save can never
 * overwrite a newer draft or clear it after a later keystroke. */
export class DraftCheckpoint {
  private desired: Draft = { patches: [], error: '' };
  private version = 0;
  private saved = 0;
  private running?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private write: (value: Draft | []) => Promise<unknown>, private onError: (error: unknown) => void) {}
  update(draft: Draft) {
    if (draft.error === this.desired.error && draft.conflictId === this.desired.conflictId && draft.patches.length === this.desired.patches.length && draft.patches.every((patch, i) => patch === this.desired.patches[i])) return;
    this.desired = { ...draft, patches: [...draft.patches] }; this.version++;
    // A continuous typing session still checkpoints at least once per interval.
    if (!this.timer) this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(this.onError); }, 120);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.running) { await this.running; if (this.saved < this.version) return this.flush(); return; }
    this.running = (async () => {
      while (this.saved < this.version) {
        const version = this.version, value = this.desired;
        await this.write(value.patches.length ? value : []);
        this.saved = version;
      }
    })().finally(() => { this.running = undefined; });
    return this.running;
  }
}
