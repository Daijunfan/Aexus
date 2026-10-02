import {readableColor,contrast} from './color-contrast.mjs';
import {CATALOG} from './mindmap-catalog.mjs';
export {CATALOG};
export const escapeXml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
export function mix(a,b,f){const A=rgb(a),B=rgb(b);return '#'+A.map((v,i)=>Math.round(v*(1-f)+B[i]*f).toString(16).padStart(2,'0')).join('');}
export function contrastInk(fill){const values=rgb(fill).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722>.36?'#243042':'#FFFFFF';}
export function mapStyle(options={}){const t=CATALOG.themes[options.theme]||CATALOG.themes.radiance;return {...t,...options,paper:options.background||t.paper,ink:options.textColor||t.ink,line:options.line||t.line,spacing:options.spacing??26,branchSpacing:options.branchSpacing??66,fontSize:options.fontSize??16,fontFamily:options.fontFamily||'system-ui',numbering:options.numbering||'none',autoBalance:options.autoBalance!==false};}
export function topicStyle(card,config,depth=0,branch=0){
 const p=card.mindmap||{},theme=mapStyle(config),colors=theme.palette,index=theme.colorMode==='single'?0:theme.colorMode==='level'?depth:branch;
 const accent=p.branchColor||colors[((index%colors.length)+colors.length)%colors.length];
 const colored=depth===0||theme.fill==='solid'&&depth===1;
 const fill=p.fill||(colored?accent:theme.fill==='dark'?mix(theme.paper,accent,.16):theme.fill==='white'?theme.paper:mix('#FFFFFF',accent,depth===1?.16:.075));
 return {...p,depth,branch,accent,fill,textColor:p.textColor||readableColor(colored?contrastInk(fill):theme.ink,fill),borderColor:p.borderColor||(theme.fill==='dark'?mix(theme.paper,accent,.7):mix(fill,accent,.4)),borderWidth:p.borderWidth??(depth===0?0:1.2),borderDash:p.borderDash||'solid',fontSize:p.fontSize??theme.fontSize+(depth===0?6:depth===1?1:0),fontFamily:p.fontFamily||theme.fontFamily,bold:p.bold??depth<2,shape:p.shape||(depth===0?theme.rootShape:theme.topicShape||theme.shape),align:p.align||'center',shadow:p.shadow??theme.shadow,gradient:p.gradient??theme.gradient??depth===0,numbering:p.numbering||theme.numbering,line:p.branchLine||theme.line,lineWidth:p.branchWidth||theme.lineWidth||Math.max(1.3,3.2-depth*.45),showImage:(p.showImage??theme.showImages??true)&&Boolean(card.image),showTags:theme.showTags!==false};
}
export function labelWidth(text,fontSize){let n=0;for(const c of text){if(/[\u0300-\u036f\ufe00-\ufe0f\u200d]/u.test(c))continue;n+=/\s/.test(c)?.32:/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(c)?1:/[MW@#%]/.test(c)?.85:/[ilI.,'!:;]/.test(c)?.28:.58;}return n*fontSize;}
export function wrapLabel(text,width,size){const lines=[];let line='',at=0,start=0;for(const c of String(text)){if(c==='\n'||line&&labelWidth(line+c,size)>width){lines.push({text:line,start,end:at});line='';start=at+(c==='\n'?1:0);}if(c!=='\n')line+=c;at+=c.length;}lines.push({text:line,start,end:at});return lines;}
export function numberLabel(n,parents,mode){if(mode==='none')return '';if(mode==='hierarchy')return parents.join('.')+' ';if(mode==='alpha'){let v=n,s='';do{s=String.fromCharCode(65+(v-1)%26)+s;v=Math.floor((v-1)/26);}while(v>0);return s+'. ';}if(mode==='roman'){const values=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let v=n,out='';for(const [k,s] of values)while(v>=k){out+=s;v-=k;}return out+'. ';}return n+'. ';}
export function topicBox(card,style,config,prefix=''){
 const insets={diamond:[.26,.26,.26],triangle:[.28,.43,.08],star:[.29,.28,.28],heart:[.22,.3,.28],pentagon:[.18,.2,.1],ellipse:[.16,.15,.15],'double-ellipse':[.17,.16,.16],circle:[.17,.17,.17],cloud:[.15,.18,.2],hexagon:[.12,.03,.03],octagon:[.08,.05,.05],callout:[.06,.03,.23],document:[.06,.03,.18],cylinder:[.06,.18,.13],shield:[.13,.03,.23]};
 const [side,top,bottom]=insets[style.shape]||[.03,0,0];
 const width=style.width||config.topicWidth||Math.min(360,Math.max(style.depth===0?190:120,(labelWidth(prefix+card.title,style.fontSize)+44)/(1-side*2)));
 const padX=Math.max(22,width*side),lines=wrapLabel(prefix+card.title,Math.max(30,width-padX*2),style.fontSize);
 const markerCount=['priority','progress','status','symbol','flagColor'].filter(k=>style[k]!==undefined&&style[k]!==null&&(style[k]!==0||k==='progress')&&style[k]!=='none').length;
 const markers=markerCount?27:0,tags=style.showTags&&card.tags?.length?26:0,source=card.source||card.anchor||card.reference||style.task?.due?22:card.note?20:0;
 const imageLeft=Math.max(12,padX-4),imageWidth=width-imageLeft*2;
 const imageHeight=style.showImage?Math.min(120,Math.max(58,imageWidth*card.image.height/card.image.width)):0;
 const titleHeight=lines.length*style.fontSize*1.45,extra=style.showNote&&card.note?Math.min(3,wrapLabel(card.note,width-28,12).length)*17+8:0;
 const body=titleHeight+24+markers+tags+source+(imageHeight?imageHeight+10:0)+extra;
 let height=body/(1-top-bottom),actualWidth=width;
 if(style.shape==='circle'){height=Math.max(width,height);actualWidth=height;}
 const padTop=12+height*top,padBottom=height*bottom;
 return {width:actualWidth,height,lines,markers,tags,source,imageHeight,imageLeft:imageLeft+(actualWidth-width)/2,imageWidth,titleHeight,padX,padTop,padBottom,prefix,extra};
}
export function shapePath(shape,w,h){
 const p=(coords)=>'M'+coords.map(([x,y])=>`${x*w},${y*h}`).join(' L')+' Z';
 const rect=(r=0)=>r?`M${r},0 H${w-r} Q${w},0 ${w},${r} V${h-r} Q${w},${h} ${w-r},${h} H${r} Q0,${h} 0,${h-r} V${r} Q0,0 ${r},0 Z`:`M0,0 H${w} V${h} H0 Z`;
 switch(shape){
 case'none':return '';
 case'underline':return `M0,${h} H${w}`;
 case'bracket':return `M${w*.07},0 H0 V${h} H${w*.07} M${w*.93},0 H${w} V${h} H${w*.93}`;
 case'pill':return rect(Math.min(w,h)/2);
 case'rounded':return rect(Math.min(14,h/3));
 case'ellipse':case'circle':return `M0,${h/2} A${w/2},${h/2} 0 1 0 ${w},${h/2} A${w/2},${h/2} 0 1 0 0,${h/2} Z`;
 case'double-ellipse':return shapePath('ellipse',w,h)+` M5,${h/2} A${w/2-5},${h/2-5} 0 1 0 ${w-5},${h/2} A${w/2-5},${h/2-5} 0 1 0 5,${h/2} Z`;
 case'diamond':return p([[.5,0],[1,.5],[.5,1],[0,.5]]);
 case'hexagon':return p([[.1,0],[.9,0],[1,.5],[.9,1],[.1,1],[0,.5]]);
 case'octagon':return p([[.08,0],[.92,0],[1,.16],[1,.84],[.92,1],[.08,1],[0,.84],[0,.16]]);
 case'parallelogram':return p([[.1,0],[1,0],[.9,1],[0,1]]);
 case'trapezoid':return p([[.12,0],[.88,0],[1,1],[0,1]]);
 case'triangle':return p([[.5,0],[1,1],[0,1]]);
 case'pentagon':return p([[.5,0],[1,.36],[.85,1],[.15,1],[0,.36]]);
 case'star':return p(Array.from({length:10},(_,i)=>{const a=i*Math.PI/5-Math.PI/2,r=i%2?.34:.5;return[.5+Math.cos(a)*r,.5+Math.sin(a)*r];}));
 case'cloud':return `M${w*.15},${h*.85} C0,${h*.85} 0,${h*.45} ${w*.08},${h*.38} C0,${h*.1} ${w*.25},-${h*.07} ${w*.35},${h*.12} C${w*.5},-${h*.12} ${w*.7},-${h*.05} ${w*.76},${h*.13} C${w},0 ${w*1.06},${h*.35} ${w*.94},${h*.5} C${w*1.07},${h*.72} ${w*.91},${h*1.05} ${w*.74},${h*.87} C${w*.58},${h*1.09} ${w*.33},${h*1.01} ${w*.27},${h*.9} Z`;
 case'document':return `M0,0 H${w} V${h*.85} C${w*.65},${h*.68} ${w*.35},${h*1.1} 0,${h*.9} Z`;
 case'cylinder':return `M0,${h*.12} C0,-${h*.04} ${w},-${h*.04} ${w},${h*.12} V${h*.88} C${w},${h*1.04} 0,${h*1.04} 0,${h*.88} Z M0,${h*.12} C0,${h*.28} ${w},${h*.28} ${w},${h*.12}`;
 case'process':return rect()+` M8,0 V${h} M${w-8},0 V${h}`;
 case'callout':return p([[0,0],[1,0],[1,.8],[.35,.8],[.2,1],[.2,.8],[0,.8]]);
 case'arrow-right':return p([[0,.15],[.77,.15],[.77,0],[1,.5],[.77,1],[.77,.85],[0,.85]]);
 case'arrow-left':return p([[1,.15],[.23,.15],[.23,0],[0,.5],[.23,1],[.23,.85],[1,.85]]);
 case'chevron':return p([[0,0],[.86,0],[1,.5],[.86,1],[0,1],[.14,.5]]);
 case'ribbon':return p([[0,0],[1,0],[.91,.5],[1,1],[0,1],[.09,.5]]);
 case'ticket':return `M0,0 H${w} V${h*.3} Q${w-14},${h*.5} ${w},${h*.7} V${h} H0 V${h*.7} Q14,${h*.5} 0,${h*.3} Z`;
 case'shield':return `M0,0 H${w} V${h*.5} Q${w},${h*.85} ${w/2},${h} Q0,${h*.85} 0,${h*.5} Z`;
 case'heart':return `M${w*.5},${h} C${w*.35},${h*.83} 0,${h*.55} 0,${h*.26} C0,-${h*.06} ${w*.4},-${h*.06} ${w*.5},${h*.2} C${w*.6},-${h*.06} ${w},-${h*.06} ${w},${h*.26} C${w},${h*.55} ${w*.65},${h*.83} ${w*.5},${h} Z`;
 case'capsule-cut':return p([[.07,0],[.93,0],[1,.15],[1,.85],[.93,1],[.07,1],[0,.85],[0,.15]]);
 case'flag':return p([[0,0],[1,0],[.86,.5],[1,1],[0,1]]);
 default:return rect();
 }
}
export function svgShape(shape,w,h,style={},id='topic'){
 const path=shapePath(shape,w,h),stroke=style.borderColor||style.accent||'#65758B',fill=['none','underline','bracket'].includes(shape)?'none':style.fill||'#FFFFFF';
 const grad=style.gradient&&fill!=='none';const dash=style.borderDash==='dash'?'7 4':style.borderDash==='dot'?'2 4':'';
 return `${grad?`<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${fill}"/><stop offset="1" stop-color="${mix(fill,contrast(style.textColor||'#243042','#FFFFFF')<2?'#000000':'#FFFFFF',.12)}"/></linearGradient></defs>`:''}<path d="${path}" fill="${grad?'url(#'+id+')':fill}" stroke="${stroke}" stroke-width="${style.borderWidth??1.2}" stroke-dasharray="${dash}" stroke-linejoin="round"/>`;
}
export function branchRoute(a,b,line='curve',vertical=false){
 const dx=(b.x+b.width/2)-(a.x+a.width/2),dy=(b.y+b.height/2)-(a.y+a.height/2);
 const x=vertical?a.x+a.width/2:dx<0?a.x:a.x+a.width,y=vertical?dy<0?a.y:a.y+a.height:a.y+a.height/2;
 const tx=vertical?b.x+b.width/2:dx<0?b.x+b.width:b.x,ty=vertical?dy<0?b.y+b.height:b.y:b.y+b.height/2;
 if(line==='straight')return `M${x},${y} L${tx},${ty}`;
 if(line==='elbow')return vertical?`M${x},${y} V${(y+ty)/2} H${tx} V${ty}`:`M${x},${y} H${(x+tx)/2} V${ty} H${tx}`;
 if(line==='rounded'){const r=Math.min(14,Math.abs(tx-x)/4,Math.abs(ty-y)/4),sx=Math.sign(tx-x),sy=Math.sign(ty-y);return vertical?`M${x},${y} V${(y+ty)/2-sy*r} Q${x},${(y+ty)/2} ${x+sx*r},${(y+ty)/2} H${tx-sx*r} Q${tx},${(y+ty)/2} ${tx},${(y+ty)/2+sy*r} V${ty}`:`M${x},${y} H${(x+tx)/2-sx*r} Q${(x+tx)/2},${y} ${(x+tx)/2},${y+sy*r} V${ty-sy*r} Q${(x+tx)/2},${ty} ${(x+tx)/2+sx*r},${ty} H${tx}`;}
 return vertical?`M${x},${y} C${x},${(y+ty)/2} ${tx},${(y+ty)/2} ${tx},${ty}`:`M${x},${y} C${(x+tx)/2},${y} ${(x+tx)/2},${ty} ${tx},${ty}`;
}
export function arrowShape(type,color){const fill=['open','diamond-open','circle-open','bar','fork'].includes(type)?'none':color;const shapes={triangle:'<path d="M1,1 L10,6 L1,11 Z"/>',open:'<path d="M1,1 L10,6 L1,11"/>',diamond:'<path d="M0,6 L5,1 L10,6 L5,11 Z"/>','diamond-open':'<path d="M0,6 L5,1 L10,6 L5,11 Z"/>',circle:'<circle cx="5" cy="6" r="4"/>','circle-open':'<circle cx="5" cy="6" r="4"/>',square:'<rect x="1" y="2" width="8" height="8"/>',bar:'<path d="M7,1 V11"/>',fork:'<path d="M1,6 L10,1 M1,6 L10,6 M1,6 L10,11"/>',double:'<path d="M0,1 L5,6 L0,11 M5,1 L10,6 L5,11"/>'};return `<g fill="${fill}" stroke="${color}" stroke-width="1.4" stroke-linejoin="round">${(shapes[type]||'').replaceAll('<path ','<path style="fill:inherit;stroke:inherit;stroke-width:inherit" ').replaceAll('<circle ','<circle style="fill:inherit;stroke:inherit;stroke-width:inherit" ').replaceAll('<rect ','<rect style="fill:inherit;stroke:inherit;stroke-width:inherit" ')}</g>`;}
export function relationshipRoute(link,positions){
 const a=positions.get(link.from),b=positions.get(link.to),v=link.mindmap||{};if(!a||!b)return null;
 const centerA=[a.x+a.width/2,a.y+a.height/2],centerB=[b.x+b.width/2,b.y+b.height/2];
 const port=(r,t,x,y)=>{if(x!==undefined&&y!==undefined)return[r.x+r.width*x,r.y+r.height*y];const dx=t[0]-(r.x+r.width/2),dy=t[1]-(r.y+r.height/2),k=1/Math.max(Math.abs(dx)/(r.width/2),Math.abs(dy)/(r.height/2),.0001);return[r.x+r.width/2+dx*k,r.y+r.height/2+dy*k];};
 const start=port(a,centerB,v.startX,v.startY),end=port(b,centerA,v.endX,v.endY),mid=[(start[0]+end[0])/2+(v.bendX??0),(start[1]+end[1])/2+(v.bendY??-54)];
 const d=v.line==='straight'?`M${start} L${end}`:v.line==='elbow'||v.line==='rounded'?`M${start} L${mid[0]},${start[1]} L${mid[0]},${end[1]} L${end}`:`M${start} Q${mid} ${end}`;
 const label=v.line==='straight'?[(start[0]+end[0])/2,(start[1]+end[1])/2]:[(start[0]+2*mid[0]+end[0])/4,(start[1]+2*mid[1]+end[1])/4];
 return {d,start,end,mid,label,box:{x:Math.min(...[start,end,mid].map(p=>p[0]))-100,y:Math.min(...[start,end,mid].map(p=>p[1]))-35,width:Math.max(...[start,end,mid].map(p=>p[0]))-Math.min(...[start,end,mid].map(p=>p[0]))+200,height:Math.max(...[start,end,mid].map(p=>p[1]))-Math.min(...[start,end,mid].map(p=>p[1]))+70}};
}
