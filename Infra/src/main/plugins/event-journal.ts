/** Serialized once per event, bounded by both bytes and entries. Older subscribers
 * can detect a gap using firstSequence and request a fresh domain snapshot. */
export class PluginEventJournal {
  sequence = 0
  private bytes = 0
  private entries: { seq: number; json: string; bytes: number }[] = []
  constructor(readonly maxBytes = 2 * 1024 * 1024, readonly maxEntries = 128) {}
  append(data: unknown) {
    const seq = ++this.sequence, json = JSON.stringify({ seq, data }), bytes = Buffer.byteLength(json)
    this.entries.push({ seq, json, bytes }); this.bytes += bytes
    // One oversize event (for example the initial full snapshot) is permitted;
    // it will be evicted as soon as a newer event arrives.
    while (this.entries.length > 1 && (this.entries.length > this.maxEntries || this.bytes > this.maxBytes)) {
      this.bytes -= this.entries.shift()!.bytes
    }
  }
  serialize() {
    return `{"sequence":${this.sequence},"firstSequence":${this.entries[0]?.seq ?? this.sequence},"events":[${this.entries.map(item => item.json).join(',')}]}`
  }
  get retainedBytes() { return this.bytes }
  get length() { return this.entries.length }
}
