// Coalesce rapid input into its final bounded page. A failed operation never
// poisons later navigation, and changing documents invalidates queued intent.
export class PageTurnQueue {
  constructor({read,move}){this.read=read;this.move=move;this.intent=null;this.work=null;this.epoch=0;}
  get active(){return Boolean(this.work);}
  cancel(){this.epoch++;this.intent=null;this.work=null;}
  request(delta=0,absolute){
    const current=this.read();if(!current)return Promise.resolve();
    const previous=this.intent?.key===current.key?this.intent.target:current.page;
    const target=Math.max(1,Math.min(current.total,absolute??previous+delta));
    if(!Number.isInteger(target))return Promise.resolve();
    this.intent={key:current.key,target};
    if(!this.work){
      const work=Promise.resolve().then(()=>this.drain());this.work=work;
      work.then(()=>{if(this.work===work)this.work=null;},()=>{if(this.work===work)this.work=null;});
    }
    return this.work;
  }
  async drain(){
    while(this.intent){
      const intent=this.intent,current=this.read(),epoch=this.epoch;
      if(!current||current.key!==intent.key){this.intent=null;return;}
      if(current.page===intent.target){this.intent=null;return;}
      try{await this.move(intent.target,{from:current.page,isCurrent:()=>epoch===this.epoch&&this.read()?.key===intent.key});}
      catch(error){if(epoch===this.epoch)this.intent=null;throw error;}
      if(epoch!==this.epoch)return;
      if(this.intent===intent)this.intent=null;
    }
  }
}
