// WheelEvent exposes no native momentum phase. Lock the dominant axis until
// a quiet interval and spend at most one page-turn token per gesture burst.
export class PdfGesture {
  constructor() { this.reset(); }
  reset() { this.last = -Infinity; this.started = -Infinity; this.axis = null; this.x = 0; this.y = 0; this.fired = false; this.panned = false; this.peak = 0; this.magnitude = 0; this.direction = 0; }
  feed(event, { now, mode, speed = 1, height = 700, top = 0, max = 0 }) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return { type: 'ignore' };
    // Recognition follows when input occurred, not when a busy renderer finally
    // handles it. Old/foreign epoch timestamps fall back to the monotonic clock.
    const stamp=event.timeStamp;
    if(Number.isFinite(stamp)&&stamp>=0&&stamp<=now+1000)now=stamp;
    const stale=now<this.last;
    now=Math.max(this.last,now);
    const gap=now-this.last;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
    const x = event.deltaX * unit, y = event.deltaY * unit;
    const dominant=this.axis==='x'?x:this.axis==='y'?y:Math.abs(x)>Math.abs(y)?x:y;
    const magnitude=Math.abs(dominant),direction=Math.sign(dominant);
    // Wheel input has no momentum phase. A deliberate reversal or a fresh
    // acceleration after a decayed tail begins another gesture without needing
    // a long pause. Replayed timestamps cannot re-arm a consumed gesture.
    const consumed=this.fired||this.panned;
    const reversal=consumed&&magnitude>=12&&direction!==this.direction;
    const renewed=consumed&&now-this.started>=160&&this.magnitude<=this.peak*.35&&magnitude>=Math.max(22,this.magnitude*3);
    const discrete=consumed&&gap>=80&&(event.deltaMode>0||magnitude>=40&&this.magnitude>=40&&Math.abs(magnitude-this.magnitude)<=magnitude*.12);
    if(gap>240||!stale&&(reversal||renewed||discrete))this.reset();
    if(this.started===-Infinity)this.started=now;
    this.last=now;this.direction=direction||this.direction;this.magnitude=magnitude;this.peak=Math.max(this.peak,magnitude);
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
