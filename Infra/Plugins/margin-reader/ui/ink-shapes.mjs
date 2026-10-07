export function shaped(points,shape='free',angle=0,aspect=1){
  if(shape==='free'||points.length<2)return points;
  const a=points[0],b=points.at(-1),pressure=b[2]??1;
  if(shape==='line')return [[...a],[...b]];
  if(shape==='ruler'){
    const radians=angle*Math.PI/180,dx=b[0]-a[0],dy=(b[1]-a[1])*aspect;
    const distance=dx*Math.cos(radians)+dy*Math.sin(radians);
    return [[...a],[a[0]+distance*Math.cos(radians),a[1]+distance*Math.sin(radians)/aspect,pressure]];
  }
  const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
  if(shape==='rectangle')return [[x,y,pressure],[x+w,y,pressure],[x+w,y+h,pressure],[x,y+h,pressure],[x,y,pressure]];
  if(shape==='ellipse')return Array.from({length:65},(_,i)=>{const t=i/64*Math.PI*2;return [x+w/2+Math.cos(t)*w/2,y+h/2+Math.sin(t)*h/2,pressure];});
  return points;
}
export function strokeSvg(stroke,{width=1,height=1,color,attribute='data-stroke-id'}={}){
  if(stroke.hidden)return '';
  const p=stroke.points,ink=color||stroke.color,thickness=stroke.width*width,opacity=stroke.opacity??(stroke.brush==='highlighter'?.35:1);
  const variable=stroke.brush!=='highlighter'&&p.some(v=>v.length===3&&v[2]!==1);
  const pieces=variable?p.slice(1).map((v,i)=>`<path d="M${p[i][0]*width},${p[i][1]*height} L${v[0]*width},${v[1]*height}" fill="none" stroke="${ink}" stroke-width="${thickness*(.2+.8*(v[2]??1))}" stroke-linecap="round"/>`).join(''):'';
  return `<g opacity="${opacity}"${stroke.fading?' class="ink-fading"':''}>${pieces}<polyline ${attribute}="${stroke.id}" points="${p.map(v=>`${v[0]*width},${v[1]*height}`).join(' ')}" fill="none" stroke="${ink}" stroke-opacity="${variable?0:1}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
export function inPolygon(point,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++)if((polygon[i][1]>point[1])!==(polygon[j][1]>point[1])&&point[0]<(polygon[j][0]-polygon[i][0])*(point[1]-polygon[i][1])/(polygon[j][1]-polygon[i][1])+polygon[i][0])inside=!inside;return inside;}
export function polylineIntersectsPolygon(points,polygon){
 if(polygon.length<3)return false;if(points.some(p=>inPolygon(p,polygon)))return true;
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-9&&c[0]>=Math.min(a[0],b[0])&&c[0]<=Math.max(a[0],b[0])&&c[1]>=Math.min(a[1],b[1])&&c[1]<=Math.max(a[1],b[1]);
 for(let i=1;i<points.length;i++)for(let j=0;j<polygon.length;j++){const a=points[i-1],b=points[i],c=polygon[j],d=polygon[(j+1)%polygon.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))return true;}return false;
}
