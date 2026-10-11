// Specialized layouts use the same measured topic boxes as the standard tree.
// Placements are local coordinates; the caller projects them once for UI/CLI/export.
const sum=(xs,key,gap=0)=>xs.reduce((n,x)=>n+x[key],0)+Math.max(0,xs.length-1)*gap;
const max=(xs,key)=>Math.max(0,...xs.map(x=>x[key]));
const put=(n,node,x,y,extra={})=>n.placements.push({node,x,y,...extra});
function cell(n,width=n.width,height=n.height){
  const extra=Math.max(0,height-n.height);n.padTop+=extra/2;n.padBottom+=extra/2;
  n.width=width;n.height=height;n.style={...n.style,shape:'rectangle',borderWidth:.8,shadow:false,gradient:false,cell:true};
}
function mirror(n){
  n.x=n.w-n.x-n.width;
  for(const p of n.placements){p.x=n.w-p.x-p.node.w;if(p.route)p.route=p.route.map(([x,y])=>[n.w-x,y]);mirror(p.node);}
  if(n.ribBase)n.ribBase[0]=n.w-n.ribBase[0];
  for(const f of n.furniture||[]){if(f.segments)f.segments=f.segments.map(s=>s.map(([x,y])=>[n.w-x,y]));else{f.x=n.w-(f.x||0)-f.width;if(f.columns)f.columns=f.columns.map(x=>n.w-x);}}
}
export function arrangeSpecial(n,nodes,config){
  const type=n.structure,gap=config.spacing,distance=config.branchSpacing;
  n.furniture=[];
  if(type.startsWith('table-cell')||type.startsWith('tree-table')){
    const down=type.endsWith('down');cell(n);
    if(!nodes.length)return true;
    if(type==='tree-table-right'){
      n.w=Math.max(n.width,max(nodes,'w'));n.h=n.height+sum(nodes,'h');cell(n,n.w);let y=n.height;
      for(const c of nodes){put(n,c,0,y,{hidden:true});y+=c.h;}
    }else if(down){
      n.w=Math.max(n.width,sum(nodes,'w'));n.h=n.height+max(nodes,'h');cell(n,n.w);let x=0;
      for(const c of nodes){put(n,c,x,n.height,{hidden:true});x+=c.w;}
    }else{
      n.w=n.width+max(nodes,'w');n.h=Math.max(n.height,sum(nodes,'h'));cell(n,n.width,n.h);let y=0;
      for(const c of nodes){put(n,c,n.width,y,{hidden:true});y+=c.h;}
    }
    return true;
  }
  if(!nodes.length)return false;
  if(type==='timeline-horizontal'){
    const above=Math.max(n.height/2,...nodes.map(c=>c.y+c.height/2));
    const below=Math.max(n.height/2,...nodes.map(c=>c.h-c.y-c.height/2));
    n.y=above-n.height/2;n.w=n.width+distance+sum(nodes,'w',distance*.6);n.h=above+below;
    let x=n.width+distance;for(const c of nodes){put(n,c,x,above-c.y-c.height/2,{chain:true,vertical:false});x+=c.w+distance*.6;}
    return true;
  }
  if(type==='timeline-vertical'){
    const left=Math.max(n.width/2,...nodes.map(c=>c.x+c.width/2)),right=Math.max(n.width/2,...nodes.map(c=>c.w-c.x-c.width/2));
    n.x=left-n.width/2;n.w=left+right;n.h=n.height+distance+sum(nodes,'h',gap);
    let y=n.height+distance;for(const c of nodes){put(n,c,left-c.x-c.width/2,y,{chain:true,vertical:true});y+=c.h+gap;}
    return true;
  }
  if(type==='tree-right'||type==='tree-left'){
    const indent=Math.max(38,n.width/2+24);n.w=Math.max(n.width,indent+max(nodes,'w'));n.h=n.height+gap+sum(nodes,'h',gap);
    let y=n.height+gap;const bus=n.width/2;
    for(const c of nodes){const cy=y+c.y+c.height/2;put(n,c,indent,y,{route:[[bus,n.height],[bus,cy],[indent+c.x,cy]]});y+=c.h+gap;}
    if(type==='tree-left')mirror(n);return true;
  }
  if(type==='brace'){
    n.w=n.width+distance+max(nodes,'w');n.h=Math.max(n.height,sum(nodes,'h',gap));n.y=(n.h-n.height)/2;
    let y=(n.h-sum(nodes,'h',gap))/2;const braceX=n.width+distance*.38,ys=[];
    for(const c of nodes){const cy=y+c.y+c.height/2;ys.push(cy);put(n,c,n.width+distance,y,{route:[[braceX+18,cy],[n.width+distance+c.x,cy]]});y+=c.h+gap;}
    n.furniture.push({kind:'bracket',x:braceX,y:Math.min(...ys)-10,width:18,height:Math.max(...ys)-Math.min(...ys)+20,color:n.style.accent});
    return true;
  }
  if(type==='rib-up'||type==='rib-down'){
    const up=type==='rib-up',height=n.height+gap+sum(nodes,'h',gap/2),slant=(height-n.height)*.42,tip=Math.max(n.width/2,slant+8),base=tip-slant;
    n.h=height;n.x=tip-n.width/2;n.y=up?0:height-n.height;n.w=n.x+n.width;
    const tipY=up?n.height:n.y,baseY=up?height:0;let y=up?n.height+gap:0;
    for(const c of nodes){const cy=y+c.y+c.height/2,join=tip+(base-tip)*(cy-tipY)/(baseY-tipY),x=join+24-c.x;
      put(n,c,x,y,{route:[[join,cy],[x+c.x,cy]]});n.w=Math.max(n.w,x+c.w);y+=c.h+gap/2;
    }
    n.ribBase=[base,baseY];n.furniture.push({kind:'lines',segments:[[[base,baseY],[tip,tipY]]],color:n.style.accent,lineWidth:1.8});return true;
  }
  if(type==='fishbone-right'||type==='fishbone-left'){
    // Each column is one upper/lower rib pair, sharing a single spine.
    const above=nodes.filter((_,i)=>i%2===0),below=nodes.filter((_,i)=>i%2===1),top=Math.max(n.height/2,max(above,'h')),bottom=Math.max(n.height/2,max(below,'h'));
    n.y=top-n.height/2;n.h=top+bottom;let x=n.width+distance*.65;
    for(let i=0;i<nodes.length;i+=2){const upper=nodes[i],lower=nodes[i+1],width=Math.max(upper.w,lower?.w||0);
      for(const [c,up]of [[upper,true],[lower,false]])if(c){const y=up?top-c.h:top,base=c.ribBase||[c.x+c.width/2,up?c.height:0];put(n,c,x,y,{hidden:true,route:[[x+base[0],top],[x+base[0],y+base[1]]]});}
      x+=width+gap;
    }
    n.w=x;n.furniture.push({kind:'lines',segments:[[[n.width,top],[x-gap/2,top]]],color:n.style.accent,lineWidth:2.5});
    if(type==='fishbone-left')mirror(n);return true;
  }
  if(type==='matrix'){
    const rows=nodes.map(c=>c._children||[]),count=Math.max(0,...rows.map(xs=>xs.length)),heights=Array.from({length:count},(_,i)=>Math.max(42,...rows.map(xs=>xs[i]?.h+20||0))),header=Math.max(...nodes.map(c=>c.height));
    const widths=nodes.map((c,i)=>Math.max(c.width,...rows[i].map(r=>r.w+24))),body=heights.reduce((a,b)=>a+b,0);
    n.w=Math.max(n.width,widths.reduce((a,b)=>a+b,0));cell(n,n.w);n.h=n.height+header+body;
    let x=0;const columns=[],lines=[n.height,n.height+header];let lineY=n.height+header;for(const h of heights){lineY+=h;lines.push(lineY);}
    for(const [i,c]of nodes.entries()){
      const children=rows[i];c.placements=[];c.x=0;c.y=0;c.w=widths[i];c.h=header+body;cell(c,widths[i],header);
      let y=header;for(const [j,r]of children.entries()){put(c,r,(widths[i]-r.w)/2,y+(heights[j]-r.h)/2,{hidden:true});y+=heights[j];}
      put(n,c,x,n.height,{hidden:true});x+=widths[i];columns.push(x);
    }
    n.furniture.push({kind:'grid',x:0,y:n.height,width:n.w,height:n.h-n.height,columns:columns.slice(0,-1),rows:lines.slice(1),color:n.style.accent});return true;
  }
  return false;
}
