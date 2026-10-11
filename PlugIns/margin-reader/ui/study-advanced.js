import { $,escape,field,showDialog,closeDialog,run,toast } from './dom.js';
import { api,base,external } from './transport.js';
export class StudyAdvanced {
 constructor(study){
  this.study=study;this.selected=new Set();
  this.study.map.board.addEventListener('click',e=>{const el=e.target.closest('.study-card,.study-list-card');if(!el||!e.shiftKey||e.target.closest('button'))return;e.preventDefault();e.stopImmediatePropagation();const id=el.dataset.cardId;if(this.study.current?.map?.mindmap?.enabled&&!this.selected.size&&this.study.map.selected&&this.study.map.selected!==id)this.selected.add(this.study.map.selected);this.selected.has(id)?this.selected.delete(id):this.selected.add(id);this.selection();},true);
 }
 selection(){for(const el of this.study.map.board.querySelectorAll('[data-card-id]'))el.classList.toggle('multi-selected',this.selected.has(el.dataset.cardId));this.study.mindmapStudio?.updateButtons();}
 render(set){this.study.map.board.dataset.revision=String(set.revision);const doc=this.study.getDocument(),key=JSON.stringify([doc?.id,set.cards.filter(c=>c.anchor?.documentId===doc?.id).map(c=>[c.id,c.title,c.text,c.editedText,c.note,c.imageAsset,c.anchor]),set.layers.map(l=>[l.id,l.visible,l.deletedAt])]);if(this.noteKey!==undefined&&key!==this.noteKey&&doc){this.noteKey=key;run(()=>this.study.redrawDocument())();}this.noteKey=key;if(this.setId!==set.id){this.selected.clear();this.setId=set.id;}this.selected=new Set([...this.selected].filter(id=>set.cards.some(c=>c.id===id)));this.selection();}
 combine(action){const cards=this.selected.size?[...this.selected]:this.study.map.selected?[this.study.map.selected]:[];if(!cards.length){toast('按住 Shift 点击选择卡片');return;}const revision=this.study.current.revision;showDialog({title:action==='merge'?'合并卡片':'新建摘要节点',html:field('title','标题','',{required:true})+`<p class="dialog-note">${cards.length} 张卡片将${action==='merge'?'组合为可展开的复合卡片，所有原文和图片保留。':'生成跨分支概要，原卡片层级不变。'}</p>`,onSubmit:async v=>{await this.study.change(action==='summary'?'study.summary.create':'study.cards.'+action,{cardIds:cards,title:v.title},revision);this.selected.clear();this.selection();}});}
 async references(){
  const set=this.study.current,listing=await api('study.list'),other=[];
  for(const summary of listing.sets){if(summary.id===set.id)continue;const value=await api('study.get',{setId:summary.id});for(const card of value.cards)other.push({setId:value.id,setTitle:value.title,cardId:card.id,title:card.title});}
  showDialog({title:'跨学习集引用',html:field('target','卡片','',{choices:other.map(c=>[c.setId+'/'+c.cardId,c.setTitle+' / '+c.title])})+'<p class="dialog-note">引用保留目标卡片 ID，可随时回到原学习集。</p>',submit:'插入引用',onSubmit:other.length?async v=>{const [targetSetId,targetCardId]=v.target.split('/');await this.study.change('study.card.reference',{targetSetId,targetCardId},set.revision);}:null});
 }
 async moveNote(card,patch){
  const doc=this.study.getDocument(),set=this.study.current;if(!doc||!set||!card.anchor)return;
  const {documentId,locator,display,height,rect,layerId}=card.anchor;
  return this.study.change('study.note.place',{cardId:card.id,documentId,expectedSourceVersion:doc.sourceVersion,locator,display,height,...(rect?{rect}:{}),...(layerId?{layerId}:{}),...patch},set.revision);
 }
 extend(card,placement={}){
  const doc=this.study.getDocument(),set=this.study.current;if(!doc||!set)return;
  const anchor=card?.anchor,locator=anchor?.locator||placement.locator||this.study.getRenderer().currentLocator(doc),pdf=doc.kind==='pdf';
  const rect=anchor?.rect||placement.rect||{x:.1,y:Math.min(.7,locator.pageOffset||.1),width:.7,height:.2};
  const html=field('title','标题',card?.title||placement.title||'',{required:true})+'<label class="dialog-field"><span>正文 · Markdown / 公式</span><textarea name="text">'+escape(card?.text||placement.text||'')+'</textarea></label>'+field('display','显示方式',anchor?.display||placement.display||'embedded',{choices:[['margin','页边笔记'],['embedded','在原文位置插入留白'],['collapsed','折叠标记'],...(pdf?[['overlay','原页文本 / 图片框']]:[])]})+
   (pdf?field('page','页码',locator.page,{type:'number',min:1,max:doc.pageCount})+field('at','页内位置（%）',(locator.pageOffset||0)*100,{type:'number',min:0,max:100}):'')+
   field('height','留白高度（PDF 点）',anchor?.height||150,{type:'number',min:36,max:2000})+
   (pdf?field('x','文本 / 图片框左侧（%）',rect.x*100,{type:'number',min:0,max:99})+field('width','文本 / 图片框宽度（%）',rect.width*100,{type:'number',min:1,max:100})+field('boxHeight','文本 / 图片框高度（%）',rect.height*100,{type:'number',min:1,max:100}):'')+
   field('layerId','绑定图层',anchor?.layerId||set.activeLayer||'default',{choices:set.layers.filter(l=>!l.deletedAt&&!l.locked).map(l=>[l.id,l.title])});
  showDialog({title:card?'编辑留白与定位':'在原文位置创建笔记',html,onSubmit:async v=>{
   if(this.study.current?.id!==set.id||this.study.getDocument()?.id!==doc.id)throw Error('学习集或文档已切换，请重新选择位置。');
   const position=pdf?{page:Number(v.page),pageOffset:Number(v.at)/100}:locator;
   const params={...(card?{cardId:card.id}:{}),documentId:doc.id,expectedSourceVersion:doc.sourceVersion,title:v.title,text:v.text,locator:position,display:v.display,height:Number(v.height),layerId:v.layerId};
   if(v.display==='overlay')params.rect={x:Number(v.x)/100,y:position.pageOffset,width:Number(v.width)/100,height:Number(v.boxHeight)/100};
   await this.study.change('study.note.place',params,set.revision);
  },afterOpen:()=>{for(const name of ['at','x','width','boxHeight','height']){const input=$('dialog-fields').querySelector(`[name=${name}]`);if(input)input.step='any';}}});
 }

 async preview(card){return this.study.content.preview(card);}

 async reviewSettings(){
  const set=this.study.current,stats=await api('study.review.stats',{setId:set.id}),defaults=await api('settings.get');
  showDialog({title:'本地复习 · 牌组与统计',html:`<p class="dialog-note">${stats.cards} 张复习卡 · ${stats.reviews} 次复习 · 回忆成功率 ${stats.recallRate===null?'—':Math.round(stats.recallRate*100)+'%'}</p>`+field('deckId','当前牌组',set.reviewSettings.deckId||'',{choices:[['','全部牌组'],...(set.decks||[]).filter(d=>!d.deletedAt).map(d=>[d.id,d.title])]})+field('reviewDefaultFront','新卡默认正面（当前文库）',defaults.reviewDefaultFront||'title',{choices:[['title','标题'],['card','完整卡片']]})+field('reviewDefaultReveal','新卡默认分组',defaults.reviewDefaultReveal||'sequential',{choices:[['sequential','按组依次揭示'],['independent','独立排程']]})+field('retention','目标记忆保持率',set.reviewSettings.retention??.9,{type:'number',min:.7,max:.99})+field('maximumInterval','最长复习间隔（天）',set.reviewSettings.maximumInterval??36500,{type:'number',min:1,max:36500})+(set.decks||[]).map(d=>`<div class="layer-row"><strong>${escape(d.title)}${d.deletedAt?' · 已归档':''}</strong><button type="button" data-deck-edit="${d.id}">编辑牌组</button></div>`).join('')+field('newDeck','新牌组名称（可选）')+'<button type="button" id="study-optimize">用本地复习记录训练参数</button>'+`<p class="dialog-note">${set.reviewSettings.trainedAt?'已训练：'+escape(new Date(set.reviewSettings.trainedAt).toLocaleString()):'至少积累 50 次跨日复习后可训练，全程在本机执行。'}</p>`+`<table class="study-review-stats"><tr><th>日期</th><th>复习</th><th>重来</th></tr>${stats.days.slice(-14).map(d=>`<tr><td>${d.date}</td><td>${d.count}</td><td>${d.again}</td></tr>`).join('')}</table>`,onSubmit:async v=>{if(this.study.current?.id!==set.id)throw Error('学习集已切换，请重新打开设置。');await api('settings.set',{reviewDefaultFront:v.reviewDefaultFront,reviewDefaultReveal:v.reviewDefaultReveal});let revision=set.revision;if(v.newDeck.trim()){const next=await this.study.change('study.deck.create',{title:v.newDeck},revision);revision=next.revision;}await this.study.change('study.review.settings',{deckId:v.deckId||null,retention:Number(v.retention),maximumInterval:Number(v.maximumInterval)},revision);},afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-deck-edit]').forEach(b=>b.onclick=()=>{const deck=set.decks.find(d=>d.id===b.dataset.deckEdit);closeDialog();showDialog({title:'编辑牌组',html:field('title','名称',deck.title,{required:true})+field('deleted','状态',deck.deletedAt?'yes':'no',{choices:[['no','启用'],['yes','归档（保留复习记录）']]}),onSubmit:v=>this.study.change('study.deck.update',{deckId:deck.id,title:v.title,deleted:v.deleted==='yes'},set.revision)});});$('dialog-fields').querySelector('[name=retention]').step='0.01';$('study-optimize').onclick=run(async()=>{$('study-optimize').disabled=true;try{await this.study.change('study.review.optimize',{},set.revision);$('dialog-cancel').click();toast('本地参数训练完成');}finally{if($('study-optimize'))$('study-optimize').disabled=false;}});}});
 }
 async occlude(card){
  const revision=this.study.current.revision,masks=structuredClone(card.review?.occlusions||[]);
  showDialog({title:'图像遮挡 · 拖动画框隐藏答案',html:`<div id="occlusion-editor" class="occlusion-editor"><img src="${new URL('data/'+card.imageAsset,base).href}" alt="摘录原图"></div><button type="button" id="occlusion-clear">清空遮挡</button>`,onSubmit:()=>this.study.change('study.review.configure',{cardId:card.id,enabled:true,occlusions:masks},revision),afterOpen:()=>{
   const root=$('occlusion-editor'),draw=()=>{root.querySelectorAll('.study-occlusion').forEach(el=>el.remove());for(const r of masks){const el=document.createElement('span');el.className='study-occlusion';el.style.cssText=`left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%`;root.append(el);}};draw();$('occlusion-clear').onclick=()=>{masks.length=0;draw();root.dispatchEvent(new Event('input',{bubbles:true}));};
   root.onpointerdown=e=>{e.preventDefault();const box=root.getBoundingClientRect(),x=(e.clientX-box.left)/box.width,y=(e.clientY-box.top)/box.height;root.setPointerCapture(e.pointerId);const draft=document.createElement('span');draft.className='occlusion-draft';root.append(draft);
    const rect=ev=>{const ex=Math.max(0,Math.min(1,(ev.clientX-box.left)/box.width)),ey=Math.max(0,Math.min(1,(ev.clientY-box.top)/box.height));return {x:Math.min(x,ex),y:Math.min(y,ey),width:Math.abs(ex-x),height:Math.abs(ey-y)};};
    root.onpointermove=ev=>{const r=rect(ev);draft.style.cssText=`left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%`;};
    root.onpointerup=end=>{const r=rect(end);root.onpointerup=root.onpointermove=root.onpointercancel=null;draft.remove();if(r.width>.01&&r.height>.01){masks.push(r);root.dispatchEvent(new Event('input',{bubbles:true}));}draw();};root.onpointercancel=()=>{root.onpointerup=root.onpointermove=root.onpointercancel=null;draft.remove();};};

  }});
 }
}
