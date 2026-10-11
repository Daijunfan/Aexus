/** Incremental SSE framing. Search only the new chunk; an initial notebook can
 * span thousands of chunks and must never rescan/copy its accumulated prefix. */
export class EventStreamDecoder {
  private lineParts: string[] = [];
  private dataLines: string[] = [];
  constructor(private readonly receive: (data: string) => void) {}
  push(chunk: string): void {
    let start = 0;
    for (let end = chunk.indexOf('\n'); end !== -1; end = chunk.indexOf('\n', start)) {
      this.lineParts.push(chunk.slice(start, end));
      let line = this.lineParts.join('');
      this.lineParts = [];
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line) {
        const data = this.dataLines;
        this.dataLines = [];
        if (data.length) this.receive(data.join('\n'));
      } else if (line === 'data') this.dataLines.push('');
      else if (line.startsWith('data:')) {
        const offset = line[5] === ' ' ? 6 : 5;
        this.dataLines.push(line.slice(offset));
      }
      start = end + 1;
    }
    if (start < chunk.length) this.lineParts.push(chunk.slice(start));
  }
}
