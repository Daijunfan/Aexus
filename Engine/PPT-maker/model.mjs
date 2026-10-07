/** PPT-maker domain lifecycle. Durable state is owned by the public workflow host. */
import {clone,STYLES,LAYOUTS,validateDeck,validateChart,inspectDeck,reconcileEdits} from './scene.mjs';
export const ENGINE_ID='PPT-maker';
export const ENGINE_VERSION='1.0.0';
export const ENGINE_IDS=['codex','claude','cline','pi'];
export const MAX_TEMPLATE_BYTES=4*1024*1024;
const string=(value,name,max=4000,optional=false)=>{if(optional&&(value===undefined||value===''))return '';if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(name+'需要1–'+max+'个字符');return value.trim();};
export function create(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('PPT输入必须是对象');
 const allowed=['brief','audience','slideCount','style','ratio','template','materials','engines','confirmOutline','parentId','parentSnapshot','deck','language'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('PPT输入包含不支持的字段');
 const brief=string(input.brief,'制作需求',6000,true),parentId=string(input.parentId,'父版本ID',200,true);
 if(!brief&&!input.template&&!parentId)throw Error('请描述制作需求，或上传一个PPTX/POTX模板');
 const count=input.slideCount??8;if(!Number.isInteger(count)||count<3||count>24)throw Error('新建演示支持3–24页；导入模板保留原页数');
 if(input.style&&!STYLES[input.style])throw Error('未知演示风格');if(input.ratio&&!['16:9','4:3'].includes(input.ratio))throw Error('请选择16:9或4:3画布');
 if(input.confirmOutline!==undefined&&typeof input.confirmOutline!=='boolean')throw Error('confirmOutline需要布尔值');
 let template=null;
 if(input.template){const t=input.template;if(typeof t!=='object'||Array.isArray(t)||!/^.+\.(pptx|potx)$/i.test(t.name??'')||typeof t.content!=='string'||t.content.length>Math.ceil(MAX_TEMPLATE_BYTES/3)*4+4)throw Error('模板须为4MiB以内的 .pptx/.potx');template={name:t.name,content:t.content};}
 const materials=(input.materials??[]);if(!Array.isArray(materials)||materials.length>8||materials.some(m=>!m||typeof m.name!=='string'||m.name.length>160||typeof m.content!=='string'||m.content.length>80000)||materials.reduce((n,m)=>n+m.content.length,0)>160000)throw Error('资料最多8份，合计不超过16万个字符');
 let engines=null;if(input.engines!==undefined){if(!Array.isArray(input.engines)||!input.engines.length||input.engines.length>4)throw Error('请选择1–4种已配置的Coding Agent');engines=input.engines.map(s=>{const v=typeof s==='string'?{engine:s}:s;if(!v||!ENGINE_IDS.includes(v.engine)||v.model!==undefined&&(typeof v.model!=='string'||!v.model||v.model.length>200))throw Error('编码引擎选择无效');return {engine:v.engine,...(v.model?{model:v.model}:{})};});}
 if(parentId&&template)throw Error('修订现有成果时不能同时上传另一份模板');
 if(parentId&&!input.parentSnapshot)throw Error('修订需要已授权读取的父版本快照；请使用UI创建修订、CLI fork或prepareRevision。');
 if(input.parentSnapshot){if(!parentId||typeof input.parentSnapshot!=='object'||Array.isArray(input.parentSnapshot))throw Error('父版本快照无效');validateDeck(input.parentSnapshot.deck);if(!Number.isInteger(input.parentSnapshot.revision)||input.parentSnapshot.revision<1)throw Error('父版本修订号无效');if(input.parentSnapshot.deck.kind==='native'){const f=input.parentSnapshot.file;if(!f||typeof f.content!=='string'||f.content.length>11*1024*1024||typeof f.sha256!=='string'||! /^[a-f0-9]{64}$/.test(f.sha256))throw Error('原生模板修订需要完整文件及哈希');}}
 if(input.deck){if(!parentId)throw Error('编辑文稿需指定已完成的父版本');validateDeck(input.deck);}
 return {version:1,phase:parentId?'load-parent':'prepare',input:{brief,audience:string(input.audience,'受众',300,true)||'通用读者',slideCount:count,style:input.style??'executive',ratio:input.ratio??'16:9',confirmOutline:input.confirmOutline!==false,language:input.language==='en'?'en':'zh-CN',materials:clone(materials),template,parentId:parentId||null,...(input.parentSnapshot?{parentSnapshot:clone(input.parentSnapshot)}:{}),...(input.deck?{deck:clone(input.deck)}:{})},title:brief.slice(0,50)||template?.name.replace(/\.(pptx|potx)$/i,'')||'PPT 修订',workers:[],tasks:{},events:[],engines,deck:null,baseDeck:null,deckRevision:0,outline:null,sources:[],review:null,changes:[],generation:0,manualApproved:false};
}
export function describe(state){
 const labels={prepare:'检查输入与模板',planning:'叙事策划',outline:'确认结构',writing:'内容与视觉设计',review:'独立审校',edit:'预览与编辑',revising:'按页修改',export:'验证并导出',complete:'已交付','load-parent':'载入已交付版本'};
 return {title:state.title,phase:state.phase,phaseLabel:labels[state.phase]??state.phase,brief:state.input.brief,audience:state.input.audience,style:state.input.style,slideCount:state.deck?.slides.length??state.input.slideCount,outline:state.outline,deck:state.deck,deckRevision:state.deckRevision,quality:state.deck?inspectDeck(state.deck):null,review:state.review,changes:state.changes,workers:state.workers.map(({id,role,label,engine})=>({id,role,label,engine})),tasks:Object.entries(state.tasks).map(([id,t])=>({id,role:t.role,label:t.label,employeeId:t.employeeId,engine:t.engine,status:t.status,error:t.error,startedAt:t.startedAt,finishedAt:t.finishedAt})),attention:state.attention??null,template:state.deck?.template?{name:state.deck.template.name,warnings:state.deck.template.warnings}:null,parentId:state.input.parentId,exportInfo:state.exportInfo??null,hasMaterials:state.sources.length>1};
}
export function respond(state,answer){
 if(!answer||typeof answer!=='object'||Array.isArray(answer))throw Error('PPT操作参数无效');const action=answer.action;
 if(state.phase==='outline'){
  if(action!=='approve-outline')throw Error('请先确认大纲');
  if(answer.outline)state.outline=validateOutline(answer.outline,state.input.slideCount);
  state.title=state.outline.title;
  state.phase='writing';return state;
 }
 if(state.phase!=='edit')throw Error('当前阶段不能编辑文稿');
 if(answer.deckRevision!==state.deckRevision)throw Error('文稿已在另一窗口更新。请保留本地草稿，重新载入后再提交。');
 if(answer.deck){const next=reconcileEdits(state.deck,answer.deck);state.deck=next;state.deckRevision++;state.review=state.review?{...state.review,stale:true}:null;state.manualApproved=false;}
 if(action==='save'){state.changes=[{kind:'manual',message:'已保存手动编辑',at:Date.now()}];return state;}
 if(action==='review'){state.phase='review';state.generation++;return state;}
 if(action==='ai-edit'){
  const slide=state.deck.slides.find(s=>s.id===answer.slideId);if(!slide)throw Error('请选择要修改的幻灯片');
  state.editRequest={slideId:slide.id,instruction:string(answer.instruction,'修改要求',2000),generation:++state.generation};state.phase='revising';return state;
 }
 if(action==='export'){
  const quality=inspectDeck(state.deck);if(!quality.passed)throw Error('请先修复版面错误：'+quality.issues.filter(i=>i.severity==='error').slice(0,3).map(i=>i.message).join('；'));
  if((state.review?.verdict==='revise'||state.review?.stale)&&answer.confirmReview!==true)throw Error('审校意见未解决或文稿已修改。请重新审校，或明确人工确认后导出。');
  if(quality.warnings>0&&answer.acceptWarnings!==true)throw Error('模板/版面有已说明的预览限制，请确认已检查后导出');
  state.manualApproved=answer.confirmReview===true;state.acceptWarnings=answer.acceptWarnings===true;state.phase='export';return state;
 }
 throw Error('未知PPT操作');
}
export function validateOutline(value,count){
 if(!value||typeof value!=='object'||!Array.isArray(value.slides)||value.slides.length!==count)throw Error('大纲页数必须与要求一致');
 const title=string(value.title,'演示标题',100),ids=new Set();
 const slides=value.slides.map((s,i)=>{const id=s.id??'s'+(i+1);if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,60}$/.test(id)||ids.has(id))throw Error('大纲页面ID无效或重复');ids.add(id);return {id,title:string(s.title,'页标题',90),purpose:string(s.purpose,'本页论点',500)};});
 return {title,slides};
}
export function validateContent(value,outline,sources){
 if(!value||!Array.isArray(value.slides)||value.slides.length!==outline.slides.length)throw Error('正文缺少页面或页数不一致');
 const known=new Set(sources.map(s=>s.id)),rows=[];
 for(const plan of outline.slides){const slide=value.slides.find(s=>s.id===plan.id);if(!slide||rows.some(s=>s.id===slide.id))throw Error('正文页面ID缺失或重复');
  const layout=slide.layout??'cards';if(!LAYOUTS.includes(layout))throw Error('正文版式不受支持');
  const body=slide.body??[],items=slide.items??[];if(!Array.isArray(body)||body.length>6||body.some(s=>typeof s!=='string'||s.length>600)||!Array.isArray(items)||items.length>4||items.some(i=>typeof i.label!=='string'||i.label.length>90||typeof i.body!=='string'||i.body.length>500))throw Error('页面内容过长或字段无效，请精简而不删除重要事实');
  const refs=slide.sourceIds??[];if(!Array.isArray(refs)||refs.some(id=>!known.has(id)))throw Error('引用了不存在的用户资料编号');
  if(slide.chart){validateChart(slide.chart);if(!refs.length)throw Error('图表必须引用实际提供的资料，不得编造数值');}
  if(slide.table){const t=slide.table;if(!Array.isArray(t.columns)||t.columns.length<1||t.columns.length>6||!Array.isArray(t.rows)||t.rows.length>8||t.columns.some(s=>typeof s!=='string'||s.length>80)||t.rows.some(r=>!Array.isArray(r)||r.length!==t.columns.length||r.some(s=>typeof s!=='string'||s.length>180)))throw Error('表格内容或行列数无效');}
  if(layout==='chart'&&!slide.chart||layout==='table'&&!slide.table)throw Error('数据版式缺少实际图表或表格内容');
  rows.push({id:plan.id,title:string(slide.title,'页面标题',100),layout,subtitle:typeof slide.subtitle==='string'?slide.subtitle.slice(0,700):'',body:clone(body),items:clone(items),sourceIds:[...refs],notes:string(slide.notes,'演讲者备注',5000,true),...(slide.chart?{chart:clone(slide.chart)}:{}),...(slide.table?{table:clone(slide.table)}:{})});
 }
 return {title:outline.title,slides:rows};
}
export function validateDesign(value,outline){
 if(!value||!Array.isArray(value.slides)||value.slides.length!==outline.slides.length)throw Error('视觉方案页数不一致');
 return {slides:outline.slides.map(p=>{const s=value.slides.find(s=>s.id===p.id);if(!s||!LAYOUTS.includes(s.layout))throw Error('视觉方案包含未知页面或版式');return {id:p.id,layout:s.layout,rationale:string(s.rationale,'版式理由',300,true)};})};
}
export function validateReview(value,deck){
 if(!value||!['pass','revise'].includes(value.verdict)||!Array.isArray(value.issues)||value.issues.length>40)throw Error('审校结果结构无效');
 const ids=new Set(deck.slides.map(s=>s.id));
 const issues=value.issues.map(i=>{if(!['blocking','warning','note'].includes(i.severity)||i.slideId&&!ids.has(i.slideId))throw Error('审校意见引用未知页面或级别');return {severity:i.severity,slideId:i.slideId??null,message:string(i.message,'审校意见',1000)};});
 if(value.verdict==='pass'&&issues.some(i=>i.severity==='blocking'))throw Error('有阻断意见时不能通过审校');
 return {verdict:value.verdict,issues,summary:string(value.summary,'审校摘要',1500,true),stale:false};
}
export function validateEdits(value,deck,slideId){
 if(!value||!Array.isArray(value.edits)||value.edits.length>160)throw Error('按页修改需要edits数组');
 const next=clone(deck),slide=next.slides.find(s=>s.id===slideId);if(!slide)throw Error('修改目标页面不存在');const changed=[];
 for(const patch of value.edits){const e=slide.elements.find(e=>e.id===patch.elementId);if(!e||e.locked)throw Error('AI修改引用未知或只读对象');
  const allowed=e.type==='text'?['text','fontSize','x','y','w','h','color','bold','align']:e.type==='table'?['rows']:e.type==='chart'?['chart']:[];
  if(Object.keys(patch).some(k=>k!=='elementId'&&!allowed.includes(k)))throw Error('AI修改包含该对象不支持的字段');
  const fields=Object.fromEntries(Object.entries(patch).filter(([k])=>k!=='elementId'));Object.assign(e,fields);
  if(e.type==='text'&&e.role==='title'&&'text' in fields)slide.title=e.text;
  if(e.origin&&['x','y','w','h'].some(k=>k in fields))for(const peer of slide.elements)if(peer.id!==e.id&&peer.origin?.part===e.origin.part&&peer.origin?.shapeId===e.origin.shapeId)for(const k of ['x','y','w','h'])if(k in fields)peer[k]=fields[k];
  changed.push(e.id);
 }
 if(value.notes!==undefined)slide.notes=string(value.notes,'演讲者备注',5000,true);
 reconcileEdits(deck,next);return {deck:next,changed};
}
export function parseAnswer(text,taskId){
 if(typeof text!=='string'||text.length>500000)throw Error('Agent JSON回复大小无效');let raw=text.trim();if(raw.startsWith('```'))raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 let value;try{value=JSON.parse(raw);}catch{throw Error('Agent没有返回完整JSON');}
 if(!value||typeof value!=='object'||Array.isArray(value)||value.taskId!==taskId)throw Error('Agent回复任务ID不匹配');return value;
}
