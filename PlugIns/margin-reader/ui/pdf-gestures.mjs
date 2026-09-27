// WheelEvent exposes no native momentum phase. Lock the dominant axis until
// a quiet interval and spend at most one page-turn token per gesture burst.
export class PdfGesture {
  constructor() { this.reset(); }
  reset() { this.last = -Infinity; this.axis = null; this.x = 0; this.y = 0; this.fired = false; this.panned = false; }
  feed(event, { now, mode, speed = 1, height = 700, top = 0, max = 0 }) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return { type: 'ignore' };
    if (now - this.last > 240) this.reset();
    this.last = now;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const x = event.deltaX * unit, y = event.deltaY * unit;
    this.x += x; this.y += y;
    if (!this.axis && Math.max(Math.abs(this.x), Math.abs(this.y)) >= 5) {
      if (Math.abs(this.x) > Math.abs(this.y) * 1.25) this.axis = 'x';
      else if (Math.abs(this.y) > Math.abs(this.x) * 1.1) this.axis = 'y';
    }
    if (this.axis === 'x') {
      if (!this.fired && Math.abs(this.x) >= 55) { this.fired = true; return { type: 'turn', delta: Math.sign(this.x) }; }
      return { type: 'consume' };
    }
    if (this.axis === 'y') {
      if (mode === 'continuous') return { type: 'scroll', delta: y * speed };
      const room = y < 0 ? top > 1 : top < max - 1;
      if (room && !this.fired) { this.panned = true; return { type: 'scroll', delta: y * speed }; }
      if (!this.panned && !this.fired && Math.abs(this.y) * speed >= 65) {
        this.fired = true; return { type: 'turn', delta: Math.sign(this.y) };
      }
    }
    return { type: 'consume' };
  }
}
