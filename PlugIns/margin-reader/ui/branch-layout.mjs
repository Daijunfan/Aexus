// Bounded recursive branch geometry; no state is stored in the renderer.
export function buildBranch(card, children, options, appearance, scope, depth=0) {
  const display={...appearance,...card.style},width=display.compact?Math.min(190,display.width||236):display.width||236,height=display.titleOnly?Math.max(88,Math.ceil((display.fontSize||13)*(display.fontScale||1)*3+46)):display.height||226;
  const style=card.style?.branchStyle||options.branchStyle||(options.layout==='down'?'tree2':'tree0');
  const shown=depth<64&&!card.collapsed&&(!card.submap||card.id===scope);
  const nodes=(shown?children.get(card.id)||[]:[]).map(c=>buildBranch(c,children,options,appearance,scope,depth+1));
  const r={card,width,height,style,nodes,placements:[],x:0,y:0,w:width,h:height};
  if(!nodes.length)return r;
  const gap=28,distance=64,sumH=nodes.reduce((s,n)=>s+n.h,0)+gap*(nodes.length-1),sumW=nodes.reduce((s,n)=>s+n.w,0)+gap*(nodes.length-1);
  const maxH=Math.max(...nodes.map(n=>n.h)),maxW=Math.max(...nodes.map(n=>n.w));
  if(['tree0','tree1','tree3'].includes(style)) {
    r.w=width+distance+maxW;r.h=Math.max(height,sumH);r.y=(r.h-height)/2;r.x=style==='tree3'?maxW+distance:0;
    let y=(r.h-sumH)/2;for(const n of nodes){r.placements.push({node:n,x:style==='tree3'?maxW-n.w:width+distance,y});y+=n.h+gap;}
  } else if(['tree2','tree4'].includes(style)) {
    r.w=Math.max(width,sumW);r.h=height+distance+maxH;r.x=(r.w-width)/2;r.y=style==='tree4'?maxH+distance:0;
    let x=(r.w-sumW)/2;for(const n of nodes){r.placements.push({node:n,x,y:style==='tree4'?maxH-n.h:height+distance});x+=n.w+gap;}
  } else if(style==='line0') {
    r.w=width+distance+sumW;r.h=Math.max(height,maxH);r.y=(r.h-height)/2;
    let x=width+distance;for(const n of nodes){r.placements.push({node:n,x,y:(r.h-n.h)/2});x+=n.w+gap;}
  } else if(style==='line1') {
    r.w=Math.max(width,maxW);r.h=height+distance+sumH;r.x=(r.w-width)/2;
    let y=height+distance;for(const n of nodes){r.placements.push({node:n,x:(r.w-n.w)/2,y});y+=n.h+gap;}
  } else if(style==='both') {
    const left=nodes.filter((_,i)=>i%2===1),right=nodes.filter((_,i)=>i%2===0);
    const lw=left.length?Math.max(...left.map(n=>n.w)):0,rw=right.length?Math.max(...right.map(n=>n.w)):0;
    const span=a=>a.reduce((s,n)=>s+n.h,0)+Math.max(0,a.length-1)*gap;
    r.w=lw+(lw?distance:0)+width+distance+rw;r.h=Math.max(height,span(left),span(right));r.x=lw+(lw?distance:0);r.y=(r.h-height)/2;
    for(const [rows,isLeft] of [[left,true],[right,false]]){let y=(r.h-span(rows))/2;for(const n of rows){r.placements.push({node:n,x:isLeft?lw-n.w:r.x+width+distance,y});y+=n.h+gap;}}
  } else {
    const columns=style==='frame'?Math.min(3,Math.ceil(Math.sqrt(nodes.length))):2,rows=Math.ceil(nodes.length/columns);
    r.w=Math.max(width,columns*maxW+(columns-1)*gap);r.h=height+distance+rows*maxH+(rows-1)*gap;r.x=(r.w-width)/2;
    nodes.forEach((n,i)=>{const row=Math.floor(i/columns),column=style==='line2'&&row%2?columns-1-i%columns:i%columns;r.placements.push({node:n,x:column*(maxW+gap),y:height+distance+row*(maxH+gap)});});
  }
  return r;
}
export function branchPath(a,b,style='tree0') {
  const dx=b.x-a.x,dy=b.y-a.y,vertical=['tree2','tree4','line1','line2','frame'].includes(style);
  const x=vertical?a.x+a.width/2:dx<0?a.x:a.x+a.width,y=vertical?dy<0?a.y:a.y+a.height:a.y+a.height/2;
  const tx=vertical?b.x+b.width/2:dx<0?b.x+b.width:b.x,ty=vertical?dy<0?b.y+b.height:b.y:b.y+b.height/2;
  if(style.startsWith('line'))return `M${x},${y} L${tx},${ty}`;
  if(style==='tree1'||style==='frame')return vertical?`M${x},${y} V${(y+ty)/2} H${tx} V${ty}`:`M${x},${y} H${(x+tx)/2} V${ty} H${tx}`;
  return vertical?`M${x},${y} C${x},${(y+ty)/2} ${tx},${(y+ty)/2} ${tx},${ty}`:`M${x},${y} C${(x+tx)/2},${y} ${(x+tx)/2},${ty} ${tx},${ty}`;
}
