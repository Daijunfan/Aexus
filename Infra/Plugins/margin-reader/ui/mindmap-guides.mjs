// Screen-threshold alignment for free placement. Only mounted peers are sampled.
export function snapDelta(positions,exclude,id,delta,tolerance){
 const own=positions.get(id);if(!own)return {delta,guides:[]};const result=[...delta],guides=[];
 for(const axis of [0,1]){const key=axis?'y':'x',size=axis?'height':'width',other=axis?'x':'y',otherSize=axis?'width':'height';let best=tolerance,hit;
  for(const [peer,b]of positions){if(exclude.has(peer))continue;for(const factor of [0,.5,1])for(const f of [0,.5,1]){const at=b[key]+b[size]*factor,current=own[key]+delta[axis]+own[size]*f,d=at-current;if(Math.abs(d)<best){best=Math.abs(d);hit={d,axis,at,from:Math.min(b[other],own[other]+delta[1-axis])-18,to:Math.max(b[other]+b[otherSize],own[other]+delta[1-axis]+own[otherSize])+18};}}}
  if(hit){result[axis]+=hit.d;guides.push(hit);}
 }
 return {delta:result,guides};
}
