/** Portable presentation model, layout and SVG preview. No Infra/runtime dependencies. */
export const VERSION=1;
export const STYLES={
 executive:{name:'简洁商务',background:'F5F6F8',paper:'FFFFFF',ink:'172438',muted:'64748B',accent:'315BE8',secondary:'138579',font:'Arial'},
 blueprint:{name:'工程蓝图',background:'F1F4F7',paper:'FFFFFF',ink:'112133',muted:'64748B',accent:'095CCB',secondary:'18834B',font:'Arial'},
 editorial:{name:'杂志叙事',background:'F8F4EB',paper:'FFFCF6',ink:'282B26',muted:'6C7468',accent:'B74225',secondary:'416B53',font:'Arial'},
 midnight:{name:'深色发布',background:'101B2D',paper:'19283F',ink:'F2F6FF',muted:'A4B4CD',accent:'70ACFF',secondary:'65DBC4',font:'Arial'}
};
export const LAYOUTS=['cover','statement','cards','split','timeline','table','chart','closing','metrics','process','comparison'];
export const clone=value=>JSON.parse(JSON.stringify(value));
export const round=value=>Math.round(value*1000)/1000;
export const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export const plainColor=value=>typeof value==='string'&&/^[0-9a-fA-F]{6}$/.test(value)?value.toUpperCase():null;
const graphemes=text=>typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)].map(s=>s.segment):Array.from(text);
const charWidth=c=>/^[\u0000-\u007f]$/.test(c)?(/[ilI.,:;!'| ]/.test(c)?.28:/[MW@#%&]/.test(c)?.9:.55):1;
/** Conservative wrapping in inches/points. No clipping or ellipsis is permitted. */
export function wrapText(text,width,fontSize){
 const budget=Math.max(.1,width)*72/(fontSize*1.035),lines=[];
 for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')){
  if(!paragraph){lines.push('');continue;}
  let line='',used=0;
  const tokens=paragraph.match(/[A-Za-z0-9_:/@.%+\-]+|[^A-Za-z0-9_:/@.%+\-]/gu)??[];
  for(const token of tokens){
   const size=graphemes(token).reduce((n,c)=>n+charWidth(c),0);
   if(line&&used+size>budget&&size<=budget){lines.push(line.trimEnd());line='';used=0;}
   for(const c of graphemes(token)){
    const cw=charWidth(c);
    if(line&&used+cw>budget){lines.push(line.trimEnd());line='';used=0;}
    if(!line&&c===' ')continue;
    line+=c;used+=cw;
   }
  }
  if(line)lines.push(line);
 }
 return lines.length?lines:[''];
}
export function textMetrics(e){
 const pad=e.padding??0,lines=wrapText(e.text??'',Math.max(.02,e.w-2*pad),e.fontSize??18);
 return {lines,height:lines.length*(e.fontSize??18)/72*(e.lineHeight??1.22)+2*pad};
}
function fitted(e,min=14){
 let font=e.fontSize;
 while(font>min&&textMetrics({...e,fontSize:font}).height>e.h+.001)font-=.5;
 return {...e,fontSize:font};
}
function themeFor(style){return clone(STYLES[style]??STYLES.executive);}
export function makeDeck(plan,{style='executive',ratio='16:9',sources=[],title,theme}={}){
 const W=ratio==='4:3'?10:13.333,H=7.5,t=theme?{...themeFor(style),...theme}:themeFor(style);
 const deck={version:VERSION,kind:'generated',title:title??plan.title??'Presentation',width:W,height:H,style,theme:t,assets:{},sources:clone(sources),slides:[]};
 for(let i=0;i<plan.slides.length;i++)deck.slides.push(layoutSlide(plan.slides[i],deck,i,plan.slides.length));
 validateDeck(deck);return deck;
}
export function layoutSlide(spec,deck,index,total){
 const W=deck.width,H=deck.height,t=deck.theme,s={id:spec.id??'slide-'+(index+1),title:spec.title,notes:spec.notes??'',background:t.background,elements:[],sourceIds:[...(spec.sourceIds??[])]};
 const inner=W-1.3,top=1.78,bottom=H-.72,bodyH=bottom-top;
 const add=(id,type,x,y,w,h,other={})=>{const e={id:s.id+'-'+id,type,x:round(x),y:round(y),w:round(w),h:round(h),...other};s.elements.push(e);return e;};
 const shape=(id,x,y,w,h,fill,extra={})=>add(id,'shape',x,y,w,h,{shape:'rect',fill,stroke:'none',...extra});
 const text=(id,value,x,y,w,h,size=22,extra={})=>{const e=add(id,'text',x,y,w,h,{text:String(value??''),fontSize:size,fontFamily:t.font,color:t.ink,align:'left',lineHeight:1.22,...extra});Object.assign(e,fitted(e,extra.minFontSize??14));return e;};
 const line=(id,x,y,w,color=t.accent)=>add(id,'shape',x,y,w,.008,{shape:'line',stroke:color,strokeWidth:1,fill:'none',decorative:true});
 const layout=LAYOUTS.includes(spec.layout)?spec.layout:'cards';s.layout=layout;
 shape('accent-rule',.65,.42,.5,.04,t.accent,{decorative:true});
 text('kicker',(spec.eyebrow??deck.title).slice(0,80),1.3,.3,W-2,.25,10,{color:t.muted,minFontSize:9,role:'eyebrow'});
 text('heading',spec.title,.65,.78,inner,.92,32,{bold:true,minFontSize:24,role:'title'});
 line('footer-rule',.65,H-.52,inner,t.muted);
 text('footer',s.sourceIds.length?'来源：'+s.sourceIds.join(' · '):deck.title,.65,H-.39,inner-1,.25,9,{color:t.muted,minFontSize:8,role:'footer',locked:true});
 text('page',String(index+1).padStart(2,'0')+' / '+String(total).padStart(2,'0'),W-1.55,H-.39,.9,.25,9,{color:t.muted,align:'right',minFontSize:9,role:'footer',locked:true,pageNumber:true});
 if(layout==='cover'||layout==='closing'){
  s.elements=s.elements.filter(e=>!['title','eyebrow'].includes(e.role));
  shape('cover-rail',.65,1.32,.09,3.55,t.accent,{decorative:true});
  text('heading',spec.title,.99,1.42,inner-.7,1.75,48,{bold:true,minFontSize:32,role:'title'});
  text('subtitle',spec.subtitle??'',1.02,3.62,inner-1,.91,23,{color:t.muted,minFontSize:18,role:'body'});
  const value=(spec.body??[]).join(' · ');
  text('cover-note',value,1.02,5.15,inner-1,.68,17,{color:t.muted,minFontSize:14,role:'body'});
  text('cover-label',layout==='closing'?'NEXT STEPS':'PRESENTATION',1.02,.81,inner-1,.35,11,{bold:true,color:t.accent,minFontSize:11,role:'eyebrow'});
 }else if(layout==='statement'){
  shape('statement-panel',.65,top,inner,bodyH,t.paper,{decorative:true});
  shape('statement-rail',.65,top,.065,bodyH,t.accent,{decorative:true});
  text('statement',spec.subtitle??spec.body?.[0]??'',.98,top+.46,inner-.68,2.25,34,{bold:true,minFontSize:23,role:'body'});
  text('support',(spec.body??[]).slice(spec.subtitle?0:1).join('\n'),1,top+3,inner-.72,1.3,18,{color:t.muted,minFontSize:14,role:'body'});
 }else if(layout==='split'){
  const parts=spec.items?.length?spec.items:[{label:'要点',body:(spec.body??[]).slice(0,2).join('\n')},{label:'行动',body:(spec.body??[]).slice(2).join('\n')}],gap=.35,cw=(inner-gap)/2;
  for(let k=0;k<2;k++){const item=parts[k]??{label:'',body:''},x=.65+k*(cw+gap);shape('panel-'+k,x,top,cw,bodyH,t.paper,{decorative:true});shape('rail-'+k,x,top,cw,.055,k?t.secondary:t.accent,{decorative:true});text('label-'+k,item.label,x+.28,top+.3,cw-.56,.7,24,{bold:true,minFontSize:19});text('body-'+k,item.body,x+.28,top+1.18,cw-.56,bodyH-1.45,21,{minFontSize:16,role:'body'});}
 }else if(layout==='timeline'){
  const items=spec.items??(spec.body??[]).map((body,k)=>({label:String(k+1),body})),count=Math.max(items.length,1),gap=.28,cw=(inner-gap*(count-1))/count;
  line('timeline',.92,top+.57,inner-.54,t.accent);
  items.forEach((item,k)=>{const x=.65+k*(cw+gap);add('dot-'+k,'shape',x+.19,top+.37,.4,.4,{shape:'ellipse',fill:t.accent,stroke:'none',decorative:true});text('step-'+k,String(k+1),x+.19,top+.435,.4,.22,11,{align:'center',color:t.background,bold:true,minFontSize:11,decorative:true});text('label-'+k,item.label,x,top+1.03,cw,.9,23,{bold:true,minFontSize:17});text('body-'+k,item.body,x,top+2.02,cw,bodyH-2.13,19,{minFontSize:14,role:'body'});});
 }else if(layout==='metrics'){
  const items=spec.items?.length?spec.items:(spec.body??[]).map((body,k)=>({label:['核心指标','关键变化','业务影响','下一步'][k]??'指标',body})),n=Math.min(Math.max(items.length,2),4),gap=.22,cw=(inner-gap*(n-1))/n;
  items.slice(0,n).forEach((item,k)=>{const x=.65+k*(cw+gap);shape('metric-'+k,x,top,cw,bodyH,t.paper,{decorative:true});shape('metric-top-'+k,x,top,cw,.055,k%2?t.secondary:t.accent,{decorative:true});text('metric-label-'+k,item.label,x+.22,top+.28,cw-.44,.44,13,{bold:true,color:t.muted,minFontSize:11});text('metric-value-'+k,item.value??item.body?.split(/[:：]/)[0]??String(k+1),x+.22,top+.95,cw-.44,.82,30,{bold:true,color:k%2?t.secondary:t.accent,minFontSize:21});text('metric-body-'+k,item.value?item.body:(item.body?.includes('：')?item.body.split('：').slice(1).join('：'):''),x+.22,top+2.05,cw-.44,bodyH-2.35,16,{minFontSize:12,role:'body'});});
 }else if(layout==='process'){
  const items=spec.items?.length?spec.items:(spec.body??[]).map((body,k)=>({label:'步骤 '+(k+1),body})),n=Math.min(Math.max(items.length,2),5),gap=.18,cw=(inner-gap*(n-1))/n;
  items.slice(0,n).forEach((item,k)=>{const x=.65+k*(cw+gap);text('process-num-'+k,String(k+1).padStart(2,'0'),x,top,cw,.42,12,{bold:true,color:t.accent,minFontSize:11});shape('process-card-'+k,x,top+.62,cw,bodyH-.62,t.paper,{decorative:true});text('process-label-'+k,item.label,x+.2,top+.9,cw-.4,.74,20,{bold:true,minFontSize:15});text('process-body-'+k,item.body,x+.2,top+1.82,cw-.4,bodyH-2.1,15,{minFontSize:11,role:'body'});if(k<n-1)text('process-arrow-'+k,'→',x+cw-.05,top+.08,.28,.3,16,{color:t.muted,decorative:true});});
 }else if(layout==='comparison'){
  const items=(spec.items??[]).slice(0,2),gap=.28,cw=(inner-gap)/2;
  for(let k=0;k<2;k++){const item=items[k]??{label:k?'方案 B':'方案 A',body:''},x=.65+k*(cw+gap);shape('compare-'+k,x,top,cw,bodyH,t.paper,{decorative:true});shape('compare-head-'+k,x,top,cw,.08,k?t.secondary:t.accent,{decorative:true});text('compare-label-'+k,item.label,x+.3,top+.35,cw-.6,.7,24,{bold:true,minFontSize:18});text('compare-body-'+k,item.body,x+.3,top+1.35,cw-.6,bodyH-1.7,17,{minFontSize:12,role:'body'});}
 }else if(layout==='table'&&spec.table){
  const rows=[spec.table.columns,...spec.table.rows];add('table','table',.65,top,inner,bodyH-.65,{rows:clone(rows),fontSize:Math.max(13,Math.min(19,25-rows.length)),header:true,headerFill:t.accent,color:t.ink,fill:t.paper,headerColor:'FFFFFF',stroke:t.muted});text('caption',spec.subtitle??'',.65,bottom-.4,inner,.36,13,{color:t.muted,minFontSize:11});
 }else if(layout==='chart'&&spec.chart){
  const split=!!spec.body?.length,cw=split?inner*.69:inner;add('chart','chart',.65,top,cw,bodyH-.35,{chart:clone(spec.chart),color:t.ink,colors:[t.accent,t.secondary,'8D98AD','B87346'],fontSize:13});
  if(split){const x=.65+cw+.32;shape('insight-panel',x,top,inner-cw-.32,bodyH-.35,t.paper,{decorative:true});text('insight-title','解读',x+.2,top+.24,inner-cw-.72,.5,18,{bold:true,color:t.accent,minFontSize:16});text('insight',spec.body.join('\n'),x+.2,top+1,inner-cw-.72,bodyH-1.7,20,{minFontSize:14});}
 }else{
  const items=spec.items?.length?spec.items:(spec.body??[]).map((body,k)=>({label:['要点一','要点二','要点三','要点四'][k]??'要点',body})),n=Math.max(items.length,1),cols=n===1?1:n<=3?n:2,rows=Math.ceil(n/cols),gap=.24,cw=(inner-gap*(cols-1))/cols,ch=(bodyH-gap*(rows-1))/rows;
  items.forEach((item,k)=>{const x=.65+(k%cols)*(cw+gap),y=top+Math.floor(k/cols)*(ch+gap);shape('card-'+k,x,y,cw,ch,t.paper,{decorative:true});shape('card-rail-'+k,x,y,.055,ch,k%2?t.secondary:t.accent,{decorative:true});text('num-'+k,String(k+1).padStart(2,'0'),x+.25,y+.22,.6,.35,12,{color:t.accent,bold:true,minFontSize:11});text('label-'+k,item.label,x+.25,y+.78,cw-.5,Math.min(.76,ch*.25),23,{bold:true,minFontSize:17});text('body-'+k,item.body,x+.25,y+1.68,cw-.5,Math.max(.44,ch-1.93),20,{minFontSize:14,role:'body'});});
 }
 return s;
}
export function validateDeck(deck){
 if(!deck||deck.version!==VERSION||!['generated','native'].includes(deck.kind))throw Error('PPT 文稿版本无效');
 if(!Number.isFinite(deck.width)||!Number.isFinite(deck.height)||deck.width<4||deck.width>30||deck.height<3||deck.height>30)throw Error('幻灯片画布尺寸无效');
 if(!deck.theme||typeof deck.theme.font!=='string'||!plainColor(deck.theme.ink)||!plainColor(deck.theme.background)||!plainColor(deck.theme.accent))throw Error('主题字体或颜色无效');
 if(JSON.stringify(deck.assets??{}).length>6*1024*1024)throw Error('图片预览合计超过6MiB，请压缩图片');
 if(!Array.isArray(deck.slides)||deck.slides.length<1||deck.slides.length>40)throw Error('PPT 需要 1–40 张幻灯片');
 const ids=new Set();let count=0;
 for(const slide of deck.slides){
  if(!slide.id||ids.has(slide.id)||!Array.isArray(slide.elements))throw Error('幻灯片 ID 重复或内容无效');ids.add(slide.id);
  if(slide.background&&!plainColor(slide.background))throw Error('幻灯片背景颜色无效');
  const es=new Set();
  for(const e of slide.elements){
   if(!e.id||es.has(e.id)||!['text','shape','image','table','chart','preserved'].includes(e.type))throw Error('幻灯片对象 ID 或类型无效');es.add(e.id);count++;
   for(const f of ['x','y','w','h'])if(!Number.isFinite(e[f])||Math.abs(e[f])>60)throw Error('幻灯片对象坐标无效');
   if(e.rotation!==undefined&&(!Number.isFinite(e.rotation)||Math.abs(e.rotation)>360))throw Error('对象旋转角度无效');
   if(e.opacity!==undefined&&(!Number.isFinite(e.opacity)||e.opacity<0||e.opacity>1))throw Error('对象透明度无效');
   if(e.lineHeight!==undefined&&(!Number.isFinite(e.lineHeight)||e.lineHeight<.9||e.lineHeight>3))throw Error('行高超出支持范围');
   if(e.colors&&(!Array.isArray(e.colors)||e.colors.length>20||e.colors.some(c=>!plainColor(c))))throw Error('图表颜色无效');
   if(e.w<0||e.h<0)throw Error('幻灯片对象尺寸不能为负');
   if(e.type==='text'&&(typeof e.text!=='string'||e.text.length>12000||!Number.isFinite(e.fontSize)||e.fontSize<6||e.fontSize>120))throw Error('文本或字号超出支持范围');
   if(e.fontFamily&&(typeof e.fontFamily!=='string'||e.fontFamily.length>100||/[<>\x00-\x1f]/.test(e.fontFamily)))throw Error('字体名称无效');
   for(const key of ['color','fill','stroke','headerFill','headerColor'])if(e[key]&&e[key]!=='none'&&!plainColor(e[key]))throw Error('对象颜色必须是六位十六进制值');
   if(e.type==='table'&&(!Array.isArray(e.rows)||e.rows.length>20||!e.rows.length||e.rows.some(r=>!Array.isArray(r)||r.length!==e.rows[0].length||r.length<1||r.length>10||r.some(v=>typeof v!=='string'||v.length>1000))))throw Error('表格维度或内容无效');
   if(e.type==='chart')validateChart(e.chart);
   if(e.type==='image'&&(!deck.assets?.[e.assetId]||!/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\r\n]+$/.test(deck.assets[e.assetId].data)))throw Error('图片资源无效');
  }
 }
 if(count>2000)throw Error('对象过多：本引擎单份文稿最多2000个对象');
 return deck;
}
export function validateChart(chart){
 if(!chart||!['bar','line','doughnut','pie'].includes(chart.type)||!Array.isArray(chart.categories)||chart.categories.length<1||chart.categories.length>20||chart.categories.some(c=>typeof c!=='string'||c.length>100)||!Array.isArray(chart.series)||chart.series.length<1||chart.series.length>6)throw Error('图表类型、类别或数据系列无效');
 for(const s of chart.series)if(typeof s.name!=='string'||s.name.length>100||!Array.isArray(s.values)||s.values.length!==chart.categories.length||s.values.some(n=>!Number.isFinite(n)||Math.abs(n)>1e12))throw Error('图表数据必须为与类别一一对应的有限数值');
 if(['pie','doughnut'].includes(chart.type)&&(chart.series.length!==1||chart.series[0].values.some(n=>n<0)||chart.series[0].values.every(n=>n===0)))throw Error('饼图/环图需要单系列非负数据且合计大于零');
}
export function inspectDeck(deck){
 validateDeck(deck);const issues=[];
 const issue=(severity,code,slide,e,message)=>issues.push({severity,code,slideId:slide.id,elementId:e?.id,message});
 for(const slide of deck.slides){
  if(!slide.elements.length)issue('error','EMPTY_SLIDE',slide,null,'幻灯片没有可呈现对象');
  for(const e of slide.elements){
   if(e.type==='preserved'){issue('warning','PRESERVED_PREVIEW',slide,e,e.reason??'此对象保留在PPTX中，浏览器仅显示范围占位');continue;}
   if(e.x<-.025||e.y<-.025||e.x+e.w>deck.width+.025||e.y+e.h>deck.height+.025)issue(e.origin?'warning':'error','OUT_OF_BOUNDS',slide,e,'对象超出幻灯片画布');
   if(e.type==='text'&&e.text.trim()){
    const metric=textMetrics(e);
    if(metric.height>e.h+.07)issue(e.origin?'warning':'error','TEXT_OVERFLOW',slide,e,'文字可能溢出：请精简文字、扩大文本框或调整字号');
    if(e.fontSize<12&&!e.decorative&&!['footer','eyebrow'].includes(e.role))issue('warning','SMALL_TEXT',slide,e,'正文小于12pt，投影阅读可能困难');
   }
   if(e.type==='table'){
    const fs=e.fontSize??15,cw=e.w/e.rows[0].length,rh=e.h/e.rows.length;
    if(e.rows.some(row=>row.some(value=>textMetrics({text:value,w:cw-.15,h:rh,fontSize:fs}).height>rh-.06)))issue(e.origin?'warning':'error','TABLE_OVERFLOW',slide,e,'表格文字可能溢出：请减少内容或增大表格');
   }
  }
  if(deck.kind==='generated'){
   const meaningful=slide.elements.filter(e=>!e.decorative&&!['footer','eyebrow'].includes(e.role)&&e.type!=='shape');
   const bodyChars=slide.elements.filter(e=>e.type==='text'&&e.role==='body').reduce((n,e)=>n+e.text.replace(/\s/g,'').length,0);
   const dataObjects=slide.elements.filter(e=>['table','chart'].includes(e.type)).length;
   const sparseExempt=['cover','closing','statement'].includes(slide.layout);
   if(!sparseExempt&&meaningful.length<3)issue('error','LOW_INFORMATION_DENSITY',slide,null,'页面信息密度过低：至少需要三个有效信息单元或一个完整数据表达');
   if(!sparseExempt&&!dataObjects&&bodyChars<70)issue('warning','THIN_CONTENT',slide,null,'正文信息偏少：建议补充证据、解释、约束或行动信息');
   const title=slide.elements.find(e=>e.type==='text'&&e.role==='title');
   if(title&&title.text.replace(/\s/g,'').length<6)issue('warning','WEAK_TITLE',slide,title,'标题过短，建议改为可独立理解的结论式标题');
  }
  const texts=slide.elements.filter(e=>e.type==='text'&&e.text.trim()&&!e.decorative&&!e.origin);
  for(let a=0;a<texts.length;a++)for(let b=a+1;b<texts.length;b++){
   const x=texts[a],y=texts[b],iw=Math.min(x.x+x.w,y.x+y.w)-Math.max(x.x,y.x),ih=Math.min(x.y+x.h,y.y+y.h)-Math.max(x.y,y.y);
   if(iw>.06&&ih>.06&&iw*ih>Math.min(x.w*x.h,y.w*y.h)*.08)issue('error','TEXT_COLLISION',slide,y,'两个文本框相交：'+x.id+' / '+y.id);
  }
 }
 return {passed:!issues.some(i=>i.severity==='error'),errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,issues,slides:deck.slides.length,objects:deck.slides.reduce((n,s)=>n+s.elements.length,0),scope:'结构与保守文字测量；不等同于 Microsoft PowerPoint 像素级渲染'};
}
export function reconcileEdits(base,candidate){
 validateDeck(candidate);
 if(candidate.kind!==base.kind||candidate.width!==base.width||candidate.height!==base.height)throw Error('编辑不能改变文稿类型或画布尺寸');
 if(base.kind==='native'){
  if(candidate.slides.length!==base.slides.length)throw Error('模板保真模式保留原页数');
  if(JSON.stringify(candidate.theme)!==JSON.stringify(base.theme))throw Error('模板主题保持原样');
  const original=new Map(base.slides.map(s=>[s.id,s]));
  for(const slide of candidate.slides){
   const old=original.get(slide.id);if(!old)throw Error('模板保真模式不允许插入不存在的页面，请复制为新创作文稿');
   if(JSON.stringify(slide.origin)!==JSON.stringify(old.origin))throw Error('不能修改原PPTX页面身份');
   const elements=new Map(old.elements.map(e=>[e.id,e]));
   if(slide.elements.length!==old.elements.length)throw Error('模板保真模式不允许删除或插入原生对象');
   if(slide.elements.some((e,i)=>e.id!==old.elements[i]?.id))throw Error('模板保真模式不支持改变对象叠放顺序');
   for(const e of slide.elements){
    const prior=elements.get(e.id);if(!prior||prior.type!==e.type||JSON.stringify(prior.origin)!==JSON.stringify(e.origin))throw Error('模板对象身份不一致');
    if(prior.locked&&JSON.stringify(e)!==JSON.stringify(prior))throw Error('此模板对象只读并在原文件中保留');
    const editable={text:['text','fontSize','fontFamily','color','bold','italic','underline','align','valign','x','y','w','h','rotation'],shape:['fill','stroke','strokeWidth','x','y','w','h','rotation'],image:['x','y','w','h','rotation'],table:['rows','x','y','w','h','rotation'],chart:['chart','x','y','w','h','rotation'],preserved:[]}[e.type];
    for(const key of new Set([...Object.keys(e),...Object.keys(prior)]))if(!editable.includes(key)&&JSON.stringify(e[key])!==JSON.stringify(prior[key]))throw Error('模板对象不支持修改字段：'+key);
    if(e.origin?.grouped&&['x','y','w','h','rotation'].some(k=>e[k]!==prior[k]))throw Error('组合内对象位置保持原模板，请在PowerPoint中调整');
    if(e.type==='table'&&(e.rows.length!==prior.rows.length||e.rows[0].length!==prior.rows[0].length))throw Error('模板表格仅修改单元格内容，保留行列结构');
    if(e.type==='chart'&&JSON.stringify({...e.chart,series:e.chart.series.map(s=>({...s,values:[]}))})!==JSON.stringify({...prior.chart,series:prior.chart.series.map(s=>({...s,values:[]}))}))throw Error('模板图表仅支持改现有数据值，保留系列与类别');
   }
  }
  if(JSON.stringify(candidate.assets)!==JSON.stringify(base.assets))throw Error('模板资产保持原文件内容');
 }
 return clone(candidate);
}
function shapeSVG(e){
 const fill=e.fill&&e.fill!=='none'?'#'+e.fill:'none',stroke=e.stroke&&e.stroke!=='none'?'#'+e.stroke:'none',sw=(e.strokeWidth??1)/72,opacity=e.opacity??1;
 const common=`fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}"`;
 if(e.shape==='line')return `<path d="M ${e.x} ${e.y} L ${e.x+e.w} ${e.y+e.h}" ${common}${e.arrow?' marker-end="url(#arrow)"':''}/>`;
 if(e.shape==='ellipse')return `<ellipse cx="${e.x+e.w/2}" cy="${e.y+e.h/2}" rx="${e.w/2}" ry="${e.h/2}" ${common}/>`;
 if(e.shape==='triangle')return `<path d="M ${e.x+e.w/2} ${e.y} L ${e.x+e.w} ${e.y+e.h} L ${e.x} ${e.y+e.h} Z" ${common}/>`;
 return `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="${e.shape==='roundRect'?Math.min(.16,e.h/6):0}" ${common}/>`;
}
function textSVG(e){
 const size=e.fontSize/72,pad=e.padding??0,m=textMetrics(e),anchor=e.align==='center'?'middle':e.align==='right'?'end':'start',x=e.align==='center'?e.x+e.w/2:e.align==='right'?e.x+e.w-pad:e.x+pad;
 let y=e.y+pad+size*.93;
 if(e.valign==='middle')y+=Math.max(0,(e.h-m.height)/2);
 if(e.valign==='bottom')y+=Math.max(0,e.h-m.height);
 const spans=m.lines.map((line,i)=>`<tspan x="${x}" y="${y+i*size*(e.lineHeight??1.22)}">${xml(line||' ')}</tspan>`).join('');
 return `<text fill="#${e.color??'172438'}" font-family="${xml(e.fontFamily??'Arial')},PingFang SC,Microsoft YaHei,sans-serif" font-size="${size}" font-weight="${e.bold?'700':'400'}" font-style="${e.italic?'italic':'normal'}" text-anchor="${anchor}"${e.underline?' text-decoration="underline"':''}>${spans}</text>`;
}
function tableSVG(e){
 let out='',cols=e.rows[0].length,rh=e.h/e.rows.length,cw=e.w/cols;
 e.rows.forEach((row,r)=>row.forEach((value,c)=>{const x=e.x+c*cw,y=e.y+r*rh,fill=r===0&&e.header?e.headerFill??'315BE8':e.fill??'FFFFFF';out+=`<rect x="${x}" y="${y}" width="${cw}" height="${rh}" fill="#${fill}" stroke="#${e.stroke??'CBD5E1'}" stroke-width="0.006"/>`;out+=textSVG({text:value,x:x+.085,y:y+.055,w:cw-.17,h:rh-.11,fontSize:e.fontSize??15,color:r===0&&e.header?e.headerColor??'FFFFFF':e.color??'172438',bold:r===0&&e.header,lineHeight:1.17});}));
 return out;
}
function chartSVG(e){
 const {chart}=e,colors=e.colors??['315BE8','138579','8D98AD','B87346'];let out='';
 const label=(text,x,y,w,h=.3,size=11,extra={})=>textSVG({text,x,y,w,h,fontSize:size,color:e.color??'172438',...extra});
 if(['pie','doughnut'].includes(chart.type)){
  const values=chart.series[0].values,total=values.reduce((a,b)=>a+b,0),cx=e.x+e.w*.36,cy=e.y+e.h*.47,r=Math.min(e.w*.28,e.h*.37),ir=chart.type==='doughnut'?r*.57:0;let start=-Math.PI/2;
  values.forEach((v,i)=>{const angle=v/total*Math.PI*2,end=start+angle-.00001,large=angle>Math.PI?1:0,point=(a,radius)=>`${cx+radius*Math.cos(a)} ${cy+radius*Math.sin(a)}`;if(v>0)out+=`<path d="M ${point(start,r)} A ${r} ${r} 0 ${large} 1 ${point(end,r)} L ${ir?point(end,ir):`${cx} ${cy}`} ${ir?`A ${ir} ${ir} 0 ${large} 0 ${point(start,ir)}`:''} Z" fill="#${colors[i%colors.length]}"/>`;start+=angle;out+=`<rect x="${e.x+e.w*.72}" y="${e.y+.35+i*.4}" width=".12" height=".12" fill="#${colors[i%colors.length]}"/>`;out+=label(chart.categories[i]+' · '+v,e.x+e.w*.72+.18,e.y+.29+i*.4,e.w*.26,.3,10);});
 }else{
  const left=e.x+.52,top=e.y+.22,pw=e.w-.72,ph=e.h-.95,all=chart.series.flatMap(s=>s.values),max=Math.max(...all,0),min=Math.min(...all,0),span=Math.max(max-min,1),zero=top+ph-(0-min)/span*ph;
  for(let k=0;k<5;k++){const val=min+span*k/4,y=top+ph-ph*k/4;out+=`<line x1="${left}" y1="${y}" x2="${left+pw}" y2="${y}" stroke="#94A3B8" stroke-opacity=".35" stroke-width=".006"/>`;out+=label(Number(val.toPrecision(3)).toString(),e.x,y-.11,.43,.24,9,{align:'right'});}
  const catW=pw/chart.categories.length;
  chart.series.forEach((serie,j)=>{
   const points=serie.values.map((v,i)=>[left+catW*(i+.5),top+ph-(v-min)/span*ph]);
   if(chart.type==='line'){out+=`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#${colors[j%colors.length]}" stroke-width=".035"/>`;points.forEach(([x,y])=>{out+=`<circle cx="${x}" cy="${y}" r=".045" fill="#${colors[j%colors.length]}"/>`;});}
   else serie.values.forEach((v,i)=>{const bw=catW*.75/chart.series.length,x=left+catW*i+catW*.12+bw*j,y=top+ph-(v-min)/span*ph;out+=`<rect x="${x}" y="${Math.min(y,zero)}" width="${bw*.91}" height="${Math.max(Math.abs(zero-y),.003)}" fill="#${colors[j%colors.length]}"/>`;});
  });
  chart.categories.forEach((c,i)=>{out+=label(c,left+catW*i,top+ph+.12,catW,.33,10,{align:'center'});});
  chart.series.forEach((s,i)=>{const x=left+i*pw/chart.series.length;out+=`<rect x="${x}" y="${e.y+e.h-.14}" width=".12" height=".12" fill="#${colors[i%colors.length]}"/>`;out+=label(s.name,x+.18,e.y+e.h-.22,pw/chart.series.length-.25,.25,10);});
 }
 if(chart.unit)out+=label(chart.unit,e.x,e.y-.12,e.w,.23,9,{align:'right'});
 return out;
}
export function slideSVG(deck,slide,{interactive=false}={}){
 const body=slide.elements.map(e=>{
  let content=e.type==='shape'?shapeSVG(e):e.type==='text'?textSVG(e):e.type==='table'?tableSVG(e):e.type==='chart'?chartSVG(e):e.type==='image'?`<image href="${xml(deck.assets[e.assetId]?.data)}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="${e.fit==='cover'?'xMidYMid slice':'xMidYMid meet'}"/>`:`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="#DDE4EE" fill-opacity=".45" stroke="#8796AA" stroke-dasharray=".05 .04" stroke-width=".01"/>`;
  if(e.type==='preserved')content+=textSVG({text:e.label??'原生对象 · 保留',x:e.x+.1,y:e.y+.1,w:Math.max(.2,e.w-.2),h:Math.max(.3,e.h-.2),fontSize:12,color:'627186'});
  return `<g data-element-id="${xml(e.id)}"${interactive&&!e.locked?' class="ppt-pickable"':''}${e.rotation?` transform="rotate(${e.rotation} ${e.x+e.w/2} ${e.y+e.h/2})"`:''}>${interactive&&!e.locked?`<rect x="${e.x}" y="${e.y}" width="${Math.max(e.w,.05)}" height="${Math.max(e.h,.05)}" fill="transparent"/>`:''}${content}</g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="${1280*deck.height/deck.width}" viewBox="0 0 ${deck.width} ${deck.height}" role="img" aria-label="${xml(slide.title)}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="context-stroke"/></marker></defs><rect width="${deck.width}" height="${deck.height}" fill="#${slide.background??deck.theme.background}"/>${body}</svg>`;
}
export function previewHTML(deck){
 const pages=deck.slides.map((s,i)=>`<section><header>${i+1} / ${deck.slides.length} · ${xml(s.title)}</header>${slideSVG(deck,s)}</section>`).join('');
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${xml(deck.title)}</title><style>body{background:#e6eaf0;font:14px Arial,sans-serif;margin:24px}section{max-width:1280px;margin:0 auto 30px}header{padding:12px;color:#4b5e77}svg{display:block;width:100%;height:auto;box-shadow:0 12px 40px #10213822}</style>${pages}</html>`;
}

export function normalizeGenerated(deck){
 if(deck.kind!=='generated')return deck;
 for(let i=0;i<deck.slides.length;i++)for(const e of deck.slides[i].elements)if(e.pageNumber)e.text=String(i+1).padStart(2,'0')+' / '+String(deck.slides.length).padStart(2,'0');
 return deck;
}
