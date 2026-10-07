/** Durable Engine runtime. All infrastructure operations go through ctx.client.invoke. */
import {create,describe,respond,ENGINE_ID,validateOutline,validateContent,validateDesign,validateReview,validateEdits} from './model.mjs';
import {provision,ask,retry,cancel} from './agents.mjs';
import {makeDeck,clone,inspectDeck,validateDeck,reconcileEdits} from './scene.mjs';
import {decodeBase64,MIME,sha256} from './archive.mjs';
import {importTemplate,exportNative,templateSlots} from './template.mjs';
import {renderGenerated} from './render.mjs';
export {create,describe,respond,retry,cancel};
const brief=state=>({brief:state.input.brief,audience:state.input.audience,style:state.input.style,slideCount:state.input.slideCount,language:state.input.language,sources:state.sources});
const publicDeck=deck=>({...deck,assets:Object.fromEntries(Object.entries(deck.assets??{}).map(([id,a])=>[id,{name:a.name}]))});
function sourcesFor(state){return [{id:'S1',name:'用户制作需求',kind:'user',content:state.input.brief},...state.input.materials.map((m,i)=>({id:'S'+(i+2),name:m.name,kind:'user',content:m.content}))];}
function numericValues(text){
 const result=new Set();for(const m of text.matchAll(/[+-]?\d[\d,]*(?:\.\d+)?(?:[eE][+-]?\d+)?%?/g)){const value=m[0],n=Number(value.replace(/[,%]/g,''));if(Number.isFinite(n)){result.add(n);if(value.endsWith('%'))result.add(n/100);}}return result;
}
function checkChartSources(content,sources){
 for(const s of content.slides)if(s.chart){const pool=numericValues(sources.filter(x=>s.sourceIds.includes(x.id)).map(x=>x.content??'').join('\n'));for(const serie of s.chart.series)for(const value of serie.values)if(!pool.has(value))throw Error('图表数值 '+value+' 未在引用的用户资料中找到。不能为排版补造数据。');}
}
function compile(state,content,design){
 const data=clone(content);for(const s of data.slides){const suggested=design?.slides.find(x=>x.id===s.id)?.layout;if(suggested&&(!['chart','table'].includes(suggested)||suggested==='chart'&&s.chart||suggested==='table'&&s.table))s.layout=suggested;}
 const deck=makeDeck(data,{style:state.input.style,ratio:state.input.ratio,sources:state.sources,title:state.outline.title});deck.language=state.input.language;return deck;
}
async function reviewCurrent(state,ctx,key){
 const review=await ask(state,ctx,key,'reviewer','review',{...brief(state),deck:publicDeck(state.deck),quality:inspectDeck(state.deck),instruction:'只审校当前内容。模板中原有数据不自动作为新事实依据。几何预检提供保守风险提示，未提供的渲染图不得声称已目视验证。'},v=>validateReview(v,state.deck));
 state.review={...review,deckRevision:state.deckRevision,at:Date.now()};await ctx.checkpoint(state);return review;
}
async function fillTemplate(state,ctx){
 const slots=templateSlots(state.deck).map(s=>({...s,dataObjects:state.deck.slides.find(p=>p.id===s.id).elements.filter(e=>['table','chart'].includes(e.type)&&!e.locked).map(e=>({id:e.id,type:e.type,...(e.rows?{rows:e.rows}:{}),...(e.chart?{chart:e.chart}:{})}))}));
 const result=await ask(state,ctx,'template-fill-'+state.generation,'writer','fill',{...brief(state),template:slots,instruction:'按用户要求填写可编辑文本框。表格/图表只在用户提供真实对应数据时修改，不能把模板旧示例当作新事实。可保留明确的品牌、页码、装饰文字。若数据缺失，指出限制。'},v=>{
  if(!Array.isArray(v.slides)||v.slides.length>state.deck.slides.length)throw Error('模板填充JSON页面无效');
  let deck=clone(state.deck);const seen=new Set();
  for(const s of v.slides){if(seen.has(s.id))throw Error('模板填充页面重复');seen.add(s.id);deck=validateEdits(s,deck,s.id).deck;}
  return deck;
 });
 state.deck=result;state.deckRevision++;await ctx.checkpoint(state);
 await reviewCurrent(state,ctx,'template-review-'+state.generation);state.phase='edit';await ctx.checkpoint(state);return {status:'waiting',state};
}
async function loadParent(state,ctx){
 // Parent reads happen in UI/CLI before start; the public runtime forbids recursive workflow calls.
 const snapshot=state.input.parentSnapshot;if(!snapshot?.deck)throw Error('修订缺少明确提交的父版本快照');
 let deck=clone(snapshot.deck);validateDeck(deck);
 if(deck.kind==='native'){
  const file=snapshot.file,bytes=decodeBase64(file.content,8*1024*1024);
  if(bytes.length!==file.bytes||sha256(bytes)!==file.sha256)throw Error('父版本文件长度或SHA-256不一致');
  state.templateContent=file.content;const imported=await importTemplate(bytes,{name:file.name});
  if(imported.slides.length!==deck.slides.length||imported.slides.some((s,i)=>s.id!==deck.slides[i]?.id))throw Error('父版本页面身份与PPTX不一致');
  imported.title=deck.title;imported.sources=clone(deck.sources??[]);
  for(const slide of imported.slides){const previous=deck.slides.find(s=>s.id===slide.id);slide.sourceIds=clone(previous?.sourceIds??[]);}
  state.baseDeck=clone(imported);deck=imported;
 }
 state.sources=clone(deck.sources??[]);state.deck=state.input.deck?reconcileEdits(deck,state.input.deck):deck;state.deckRevision=1;state.title=state.deck.title;
 state.parentRevision=snapshot.revision;state.review=null;delete state.input.deck;delete state.input.parentSnapshot;
 if(state.input.brief){await provision(state,ctx);state.editRequest={slideId:state.deck.slides[0].id,instruction:state.input.brief,generation:++state.generation};state.phase='revising';}else state.phase='edit';
 await ctx.checkpoint(state);
}
export async function run(state,originalContext){
 let chain=Promise.resolve();const ctx={...originalContext,checkpoint:value=>{chain=chain.then(()=>originalContext.checkpoint(clone(value)));return chain;}};
 ctx.signal.throwIfAborted();
 if(state.phase==='complete')return {status:'completed',state,artifacts:[state.artifact]};
 if(state.phase==='outline'||state.phase==='edit')return {status:'waiting',state};
 if(state.phase==='load-parent'){await loadParent(state,ctx);if(state.phase==='edit')return {status:'waiting',state};}
 if(state.phase==='prepare'){
  state.sources=sourcesFor(state);
  if(state.input.template){const bytes=decodeBase64(state.input.template.content);state.templateContent=state.input.template.content;state.deck=await importTemplate(bytes,{name:state.input.template.name});state.baseDeck=clone(state.deck);if(state.input.brief)state.deck.sources=clone(state.sources);state.deckRevision=1;state.title=state.deck.title;delete state.input.template.content;
   if(!state.input.brief){state.phase='edit';state.review=null;await ctx.checkpoint(state);return {status:'waiting',state};}
   state.phase='writing';await ctx.checkpoint(state);
  }else{state.phase='planning';await ctx.checkpoint(state);}
 }
 if(['planning','writing','review','revising'].includes(state.phase))await provision(state,ctx);
 if(state.phase==='planning'){
  state.outline=await ask(state,ctx,'outline','writer','outline',brief(state),v=>validateOutline(v.outline,state.input.slideCount));state.title=state.outline.title;state.phase=state.input.confirmOutline?'outline':'writing';await ctx.checkpoint(state);if(state.phase==='outline')return {status:'waiting',state};
 }
 if(state.phase==='writing'){
  if(state.deck?.kind==='native')return fillTemplate(state,ctx);
  const [content,design]=await Promise.all([
   ask(state,ctx,'content','writer','content',{...brief(state),outline:state.outline},v=>{const c=validateContent(v,state.outline,state.sources);checkChartSources(c,state.sources);return c;}),
   ask(state,ctx,'design','designer','design',{...brief(state),outline:state.outline},v=>validateDesign(v,state.outline))
  ]);
  state.content=content;state.design=design;state.deck=compile(state,content,design);state.deckRevision++;await ctx.checkpoint(state);
  for(let n=0;!inspectDeck(state.deck).passed&&n<2;n++){
   state.content=await ask(state,ctx,'layout-fix-'+n,'writer','content',{...brief(state),outline:state.outline,previous:state.content,quality:inspectDeck(state.deck),instruction:'保持关键事实，缩短溢出页内容；备注可容纳详细信息，不得删掉用户要求或编造数据。'},v=>{const c=validateContent(v,state.outline,state.sources);checkChartSources(c,state.sources);return c;});
   state.deck=compile(state,state.content,design);state.deckRevision++;await ctx.checkpoint(state);
  }
  await reviewCurrent(state,ctx,'initial-review');
  state.phase='edit';await ctx.checkpoint(state);return {status:'waiting',state};
 }
 if(state.phase==='revising'){
  const request=state.editRequest,slide=state.deck.slides.find(s=>s.id===request.slideId);if(!slide)throw Error('需要修订的页面已不存在');
  const result=await ask(state,ctx,'edit-'+request.generation,'designer','edit',{...brief(state),instruction:request.instruction,slide,quality:inspectDeck({...state.deck,slides:[slide]})},v=>validateEdits(v,state.deck,slide.id));
  const unchanged=state.deck.slides.filter(s=>s.id!==slide.id).map(s=>JSON.stringify(s));if(result.deck.slides.filter(s=>s.id!==slide.id).some((s,i)=>JSON.stringify(s)!==unchanged[i]))throw Error('按页修订试图改动其他页面');
  state.deck=result.deck;state.deckRevision++;state.changes=[{kind:'ai',slideId:slide.id,elementIds:result.changed,message:request.instruction,at:Date.now()}];await ctx.checkpoint(state);
  await reviewCurrent(state,ctx,'edit-review-'+request.generation);state.phase='edit';await ctx.checkpoint(state);return {status:'waiting',state};
 }
 if(state.phase==='review'){await reviewCurrent(state,ctx,'user-review-'+state.generation);state.phase='edit';await ctx.checkpoint(state);return {status:'waiting',state};}
 if(state.phase==='export'){
  ctx.signal.throwIfAborted();const quality=inspectDeck(state.deck);if(!quality.passed)throw Error('版面仍有阻断错误，未发布PPTX');
  const exported=state.deck.kind==='native'?await exportNative(decodeBase64(state.templateContent,16*1024*1024),state.baseDeck,state.deck):await renderGenerated(state.deck);
  ctx.signal.throwIfAborted();
  const name='presentation.pptx'; // Contract artifact basename is stable ASCII; the deck title stays inside the PPTX.
  state.exportInfo={...exported.validation,quality,templatePreservation:exported.templatePreservation??null,manualReview:state.manualApproved,review:state.review};
  state.artifact={name,mediaType:MIME,description:'最终可编辑PowerPoint；包含原生文字、图形及实际使用的表格/图表',encoding:'base64',content:exported.bytes.toString('base64')};state.phase='complete';state.finishedAt=Date.now();await ctx.checkpoint(state);
  return {status:'completed',state,artifacts:[state.artifact]};
 }
 throw Error('PPT流程阶段无效：'+state.phase);
}
