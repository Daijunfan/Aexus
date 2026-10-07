// A local presentation overlay. These strokes never enter the persistence queue.
export class TransientInk {
  constructor(changed){this.strokes=[];this.changed=changed;this.serial=0;this.timer=null;}
  has(stroke){return this.strokes.includes(stroke);}
  touch(stroke){if(!this.has(stroke)){stroke.id='transient-'+(++this.serial);this.strokes.push(stroke);}clearTimeout(this.timer);for(const s of this.strokes)s.fading=false;this.timer=setTimeout(()=>{for(const s of this.strokes)s.fading=true;this.changed();this.timer=setTimeout(()=>this.clear(),180);},1000);}
  remove(stroke){const had=this.has(stroke);this.strokes=this.strokes.filter(s=>s!==stroke);if(!this.strokes.length)clearTimeout(this.timer);if(had)this.changed();}
  clear(){clearTimeout(this.timer);if(!this.strokes.length)return;this.strokes=[];this.changed();}
}
