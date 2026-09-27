// Deterministic presentation of the hierarchy returned by the shared Core.
export function layoutStudy(cards,options={}) {
  if(options?.focusId&&cards.some(c=>c.id===options.focusId)){const included=descendants(cards,options.focusId);cards=cards.filter(c=>included.has(c.id)).map(c=>c.id===options.focusId?{...c,parentId:null}:c);}
  const children = new Map(), sizes = new Map(), positions = new Map(), links = [];
  for (const c of cards) { if (!children.has(c.parentId)) children.set(c.parentId, []); children.get(c.parentId).push(c); }
  const width=236,height=226,gap=28,column=300;
  function measure(card,depth=0) {
    if(depth>64)return height;
    const nested=card.collapsed?[]:children.get(card.id)||[];
    const size=Math.max(height,nested.reduce((n,c)=>n+measure(c,depth+1)+gap,-gap));sizes.set(card.id,size);return size;
  }
  function place(card,x,y,parent) {
    const h=sizes.get(card.id);positions.set(card.id,{x,y:y+(h-height)/2,width,height});
    if(parent)links.push({from:parent,to:card.id});
    if(card.collapsed)return;
    let top=y;for(const c of children.get(card.id)||[]){place(c,x+column,top,card.id);top+=sizes.get(c.id)+gap;}
  }
  let top=30;for(const root of children.get(null)||[]){measure(root);place(root,30,top,null);top+=sizes.get(root.id)+42;}
  if(options?.layout==='down')for(const p of positions.values()){const x=p.x;p.x=p.y;p.y=x;}
  if(options?.layout==='radial'&&positions.size>1){const visible=cards.filter(c=>positions.has(c.id)),levels=new Map();for(const c of visible){const depth=c.parentId?(levels.get(c.parentId)||0)+1:0;levels.set(c.id,depth);}const byDepth=new Map();for(const c of visible){const d=levels.get(c.id);if(!byDepth.has(d))byDepth.set(d,[]);byDepth.get(d).push(c);}const roots=byDepth.get(0).length;for(const [depth,nodes] of byDepth){const radius=roots===1&&depth===0?0:Math.max((depth+1)*330,nodes.length*300/(2*Math.PI));nodes.forEach((c,i)=>{const p=positions.get(c.id),angle=2*Math.PI*i/nodes.length-Math.PI/2;p.x=radius*Math.cos(angle);p.y=radius*Math.sin(angle);});}const minX=Math.min(...[...positions.values()].map(p=>p.x)),minY=Math.min(...[...positions.values()].map(p=>p.y));for(const p of positions.values()){p.x+=30-minX;p.y+=30-minY;}}
  top=Math.max(270,...[...positions.values()].map(p=>p.y+p.height));
  return {positions,links,width:Math.max(340,...[...positions.values()].map(p=>p.x+p.width+50)),height:Math.max(300,top+30)};
}
export function descendants(cards,id){const ids=new Set([id]);for(let changed=true;changed;){changed=false;for(const c of cards)if(ids.has(c.parentId)&&!ids.has(c.id)){ids.add(c.id);changed=true;}}return ids;}
