import { $, escape, field, showDialog, run } from './dom.js';
import { api, base } from './transport.js';
const area = (name, label, value = '') => `<label class="dialog-field"><span>${label}</span><textarea name="${name}">${escape(value)}</textarea></label>`;
const splitTags = value => value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
const modes = [['map','脑图'],['outline','大纲'],['cards','卡片'],['review','复习']];
export class StudyWorkbench {
  constructor(map) {
    this.map = map; this.study = map.study;
    const tools = document.createElement('div'); tools.className = 'study-workbench-tools';
    tools.innerHTML = `<nav class="study-modes" aria-label="学习视图">${modes.map(([id,label])=>`<button data-study-view="${id}" aria-pressed="false">${label}</button>`).join('')}</nav><div class="study-edit-tools"><button id="study-add-note" title="新建笔记卡 · ⌘ Enter">＋ 笔记</button><button id="study-undo" title="撤销 · ⌘ Z" aria-label="撤销学习编辑">↶</button><button id="study-redo" title="重做 · ⌘ ⇧ Z" aria-label="重做学习编辑">↷</button></div><div class="study-card-filters"><input id="study-card-search" type="search" placeholder="搜索卡片、笔记、标签" aria-label="搜索学习卡片"><select id="study-color-filter" aria-label="筛选卡片颜色"><option value="">全部颜色</option>${this.study.colors.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select><select id="study-tag-filter" aria-label="筛选卡片标签"><option value="">全部标签</option></select></div>`;
    $('study-map-viewport').before(tools);
    const panel = document.createElement('section'); panel.id = 'study-cards-panel'; panel.hidden = true; panel.setAttribute('aria-label','学习卡片'); $('study-map-viewport').after(panel);
    this.panel = panel;this.pageIndex=0;this.pageSize=100;
    const pages=document.createElement('nav');pages.id='study-list-pages';pages.className='study-list-pagination';pages.hidden=true;pages.setAttribute('aria-label','卡片列表分页');
    pages.innerHTML='<button type="button" data-page-step="first" aria-label="卡片列表首页">«</button><button type="button" data-page-step="previous">上一页</button><label>第 <input id="study-list-page" type="number" min="1" value="1" aria-label="卡片列表页码"> 页</label><span id="study-list-range" role="status"></span><button type="button" data-page-step="next">下一页</button><button type="button" data-page-step="last" aria-label="卡片列表末页">»</button>';
    panel.before(pages);this.pages=pages;
    const turn=index=>{this.pageIndex=Math.max(0,Math.min(Math.max(0,Math.ceil((this.visibleCards?.length||0)/this.pageSize)-1),index));this.renderCards(this.lastCards||[]);this.panel.scrollTop=0;this.study.learning?.render(this.set);this.study.organization?.paintListSelection();};
    pages.querySelectorAll('[data-page-step]').forEach(b=>b.onclick=()=>turn(({first:0,previous:this.pageIndex-1,next:this.pageIndex+1,last:Math.ceil((this.visibleCards?.length||0)/this.pageSize)-1})[b.dataset.pageStep]));
    $('study-list-page').onchange=()=>turn(Number.isInteger(Number($('study-list-page').value))?Number($('study-list-page').value)-1:0);
    tools.querySelectorAll('[data-study-view]').forEach(b=>b.onclick=run(async()=>{await this.study.change('study.view.set',{view:b.dataset.studyView});if(b.dataset.studyView==='review')this.panel.focus({preventScroll:true});}));
    $('study-add-note').onclick=()=>this.create();
    $('study-undo').onclick=run(()=>this.study.change('study.undo',{}));
    $('study-redo').onclick=run(()=>this.study.change('study.redo',{}));
    for(const id of ['study-card-search','study-color-filter','study-tag-filter'])$(id).addEventListener('input',()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>run(()=>this.filter())(),120);});
    document.addEventListener('keydown',e=>{
      if(!this.study.current||e.target.closest('input,textarea,select,[contenteditable=true]')||$('dialog').open||!(e.metaKey||e.ctrlKey))return;
      if(e.key.toLowerCase()==='z'){e.preventDefault();const method=e.shiftKey?'redo':'undo';if(this.study.current.history?.[method==='undo'?'canUndo':'canRedo'])run(()=>this.study.change('study.'+method,{}))();}
      if(e.key==='Enter'){e.preventDefault();this.create();}
    });
  }
  render(set) {
    const changed=this.set?.id!==set.id, previous=this.set;this.set=set;
    if(changed){this.pageIndex=0;this.queryKey=null;$('study-card-search').value='';$('study-color-filter').value='';$('study-tag-filter').value='';this.filtered=null;this.reviewKey=null;}
    const view=set.view||'map';this.map.board.dataset.view=view;
    if(view!=='review')this.panel.onkeydown=null;
    document.querySelectorAll('[data-study-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.studyView===view));
    $('study-undo').disabled=!set.history?.canUndo;$('study-redo').disabled=!set.history?.canRedo;
    const tag=$('study-tag-filter').value,tags=[...new Set(set.cards.flatMap(c=>c.tags||[]))].sort();
    $('study-tag-filter').innerHTML='<option value="">全部标签</option>'+tags.map(t=>`<option value="${escape(t)}">${escape(t)}</option>`).join('');$('study-tag-filter').value=tags.includes(tag)?tag:'';
    const filtering=Boolean($('study-card-search').value||$('study-color-filter').value||$('study-tag-filter').value);
    $('study-map-viewport').hidden=view!=='map'||filtering;this.panel.hidden=view==='map'&&!filtering;
    document.querySelector('.study-card-filters').hidden=view==='review';this.pages.hidden=this.panel.hidden||view==='review'||(this.visibleCards?.length||0)<=this.pageSize;
    for(const id of ['study-zoom-in','study-zoom-out','study-zoom-fit'])$(id).hidden=view!=='map'||filtering;
    if(view==='review'){this.renderReview();return;}
    if(filtering){if(changed||previous?.revision!==set.revision)run(()=>this.filter())();else this.renderCards(this.filtered||[]);}
    else this.renderCards(set.cards);
  }
  async filter() {
    if(!this.study.current)return;
    const serial=this.serial=(this.serial||0)+1,setId=this.study.current.id;
    const queryKey=JSON.stringify([setId,$('study-card-search').value,$('study-color-filter').value,$('study-tag-filter').value]);if(queryKey!==this.queryKey){this.pageIndex=0;this.queryKey=queryKey;}
    const data=await api('study.cards.query',{setId,query:$('study-card-search').value,...($('study-color-filter').value?{color:$('study-color-filter').value}:{}),...($('study-tag-filter').value?{tag:$('study-tag-filter').value}:{})});
    if(serial!==this.serial||this.study.current?.id!==setId)return;
    this.filtered=data.cards;
    const filtering=Boolean($('study-card-search').value||$('study-color-filter').value||$('study-tag-filter').value);
    $('study-map-viewport').hidden=this.set.view!=='map'||filtering;this.panel.hidden=this.set.view==='map'&&!filtering;
    this.pages.hidden=this.panel.hidden||(this.visibleCards?.length||0)<=this.pageSize;this.map.window.schedule();this.renderCards(data.cards);
  }
  reveal(id){
    if(this.panel.hidden||this.set?.view==='review')return;
    const index=(this.visibleCards||[]).findIndex(c=>c.id===id);if(index<0)return;
    const page=Math.floor(index/this.pageSize);if(page!==this.pageIndex){this.pageIndex=page;this.renderCards(this.lastCards||[]);this.study.learning?.render(this.set);}
    const el=this.panel.querySelector(`[data-card-id="${id}"]`);if(el){el.classList.add('selected');const p=el.getBoundingClientRect(),v=this.panel.getBoundingClientRect();if(p.top<v.top||p.bottom>v.bottom)this.panel.scrollTop+=p.top-v.top-16;}
  }
  renderCards(cards) {
    if(this.panel.hidden||this.set.view==='review')return;
    this.lastCards=cards;
    const key=JSON.stringify([this.set.id,this.set.revision,this.set.view,this.pageIndex,cards.map(c=>[c.id,c.title,c.text,c.editedText,c.imageAsset,c.referenceStatus]),$('study-card-search').value,$('study-color-filter').value,$('study-tag-filter').value]);
    if(this.cardsKey===key)return;this.cardsKey=key;
    const outline=this.set.view==='outline';this.panel.className=outline?'study-outline-list':'study-card-grid';
    const depths=new Map();for(const c of this.set.cards)depths.set(c.id,c.parentId?(depths.get(c.parentId)||0)+1:0);
    const visible=outline&&!$('study-card-search').value&&!$('study-color-filter').value&&!$('study-tag-filter').value?new Set(this.map.layout?.positions.keys()||[]):null;
    this.visibleCards=cards.filter(c=>!visible||visible.has(c.id));const count=this.visibleCards.length,pages=Math.max(1,Math.ceil(count/this.pageSize));this.pageIndex=Math.max(0,Math.min(this.pageIndex,pages-1));
    const start=this.pageIndex*this.pageSize;this.pages.hidden=count<=this.pageSize;$('study-list-page').value=this.pageIndex+1;$('study-list-page').max=pages;
    $('study-list-range').textContent=`/ ${pages} 页 · ${count?start+1:0}–${Math.min(start+this.pageSize,count)} / ${count} 张`;
    for(const b of this.pages.querySelectorAll('[data-page-step]'))b.disabled=['first','previous'].includes(b.dataset.pageStep)?!this.pageIndex:this.pageIndex>=pages-1;
    const children=new Set(this.set.cards.map(c=>c.parentId)),byId=new Map(this.set.cards.map(c=>[c.id,c]));
    this.panel.innerHTML=this.visibleCards.slice(start,start+this.pageSize).map(c=>`<article class="study-list-card" data-card-id="${c.id}" style="--card-color:${this.set.colors[c.color]};--depth:${Math.min(depths.get(c.id)||0,12)}" tabindex="0"><header><button data-do="collapse" aria-label="${c.collapsed?'展开':'收起'}子卡片" ${children.has(c.id)?'':'disabled'}>${c.collapsed?'▸':'▾'}</button><strong>${escape(c.title)}</strong><button data-do="edit" aria-label="编辑卡片">⋯</button></header>${outline?'':c.imageAsset?`<img src="${new URL('data/'+c.imageAsset,base).href}" alt="${escape(c.title)}" loading="lazy">`:`<p class="study-note-body">${escape(c.editedText??c.text)}</p>`}<p class="study-tags">${(c.tags||[]).map(t=>`<span>#${escape(t)}</span>`).join('')}</p><footer><button data-do="source">${c.source?'↗ 原文':'编辑笔记'}</button><button data-do="links">关联</button><button data-do="review">${c.review?.enabled?'已加入复习':'加入复习'}</button></footer></article>`).join('')||'<p class="study-empty-message">没有符合条件的卡片</p>';
    for(const el of this.panel.querySelectorAll('[data-card-id]')){
      const card=byId.get(el.dataset.cardId);
      el.onclick=run(e=>{if(e.target.closest('button')||e.shiftKey||e.metaKey||e.ctrlKey||e.detail>1)return;this.map.select(card.id);if(card.source||card.anchor||card.reference)return this.study.activateCard(card);});
      el.ondblclick=()=>this.map.edit(card);
      el.querySelectorAll('[data-do]').forEach(b=>b.onclick=run(e=>{e.stopPropagation();switch(b.dataset.do){case'edit':return this.map.menu(card,b);case'collapse':return this.study.change('study.card.update',{cardId:card.id,collapsed:!card.collapsed});case'source':return this.study.source(card);case'links':return this.links(card);case'review':return this.configureReview(card);}}));
      el.onkeydown=e=>{if(e.target!==el)return;if(e.key==='Tab'){e.preventDefault();this.map.nest(card,e.shiftKey);}else if(e.key==='Enter'){e.preventDefault();run(()=>this.study.source(card))();}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.map.remove(card);}};
    }
  }
  create(parentId) {
    const set=this.study.current;
    showDialog({title:parentId?'新建子卡片':'新建笔记卡',html:field('title','标题','',{required:true})+area('text','正文')+field('color','颜色','yellow',{choices:this.study.colors})+field('tags','标签（逗号分隔）'),submit:'创建',onSubmit:async v=>{const next=await this.study.change('study.note.create',{...v,tags:splitTags(v.tags),...(parentId?{parentId}:{})},set.revision);const c=next.cards.find(c=>!set.cards.some(old=>old.id===c.id));if(c)this.map.select(c.id);}});
  }
  edit(card) {
    const revision=this.study.current.revision;
    showDialog({title:card.source?'编辑摘录卡片':'编辑笔记卡',html:field('title','标题',card.title,{required:true})+(!card.source?area('text','正文',card.text):area('editedText','摘录显示文字（原文快照保留）',card.editedText??card.text))+area('note','笔记',card.note)+field('color','颜色',card.color,{choices:this.study.colors})+field('tags','标签（逗号分隔）',(card.tags||[]).join(', ')),onSubmit:v=>this.study.change('study.card.update',{cardId:card.id,...v,tags:splitTags(v.tags)},revision)});
  }
  links(card) { return this.study.content.links(card); }
  async configureReview(card) {
    const set=this.study.current,data=await api('study.review.render',{setId:set.id,cardId:card.id}),revision=data.revision;
    showDialog({title:'复习卡片',html:(data.configuration.generation?field('questionBinding','出题方式','auto',{choices:[['auto','标记变化时自动同步'],['manual','保留为手工问题']]})+'<p class="dialog-note">修改问题内容或分组方式会转为手工出题；牌组和暂停设置不会关闭自动同步。</p>':'')+field('frontMode','正面来源',data.frontMode,{choices:[['title','卡片标题'],['card','完整卡片'],['emphasis','已标记的挖空文本'],['custom','自定义问题']]})+area('front','自定义问题',data.configuration.front??data.front.text)+field('backMode','背面来源',data.backMode,{choices:[['card','完整卡片 · 同步原卡片'],['custom','独立答案（兼容旧卡）']]})+area('back','独立答案',data.configuration.back??data.back.text)+area('cloze','挖空问题（填写后优先于正面来源；{{c1::答案::提示}}）',data.configuration.cloze)+field('revealMode','分组方式',data.revealMode,{choices:[['sequential','一张题目，按组依次揭示'],['independent','每组独立题目与排程']]})+field('deckId','牌组',data.configuration.deckId||'',{choices:[['','未分组'],...(set.decks||[]).filter(d=>!d.deletedAt).map(d=>[d.id,d.title])]})+field('enabled','复习状态',data.configuration.enabled===false?'no':'yes',{choices:[['yes','加入复习'],['no','暂停复习']]}),onSubmit:v=>{if(this.study.current?.id!==set.id)throw Error('学习集已切换，请重新打开编辑器。');return this.study.change('study.review.configure',{cardId:card.id,...Object.fromEntries(['frontMode','backMode','revealMode'].filter(k=>v[k]!==data[k]).map(k=>[k,v[k]])),...(v.frontMode==='custom'&&v.front!==(data.configuration.front??data.front.text)?{front:v.front}:{}),...(v.backMode==='custom'&&v.back!==(data.configuration.back??data.back.text)?{back:v.back}:{}),enabled:v.enabled==='yes',deckId:v.deckId||null,...(v.cloze!==data.configuration.cloze?{cloze:v.cloze}:{}),...(v.questionBinding==='manual'?{autoUpdate:false}:{})},revision);},afterOpen:()=>{
      const front=$('dialog-fields').querySelector('[name=front]'),back=$('dialog-fields').querySelector('[name=back]');
      front.oninput=()=>{$('dialog-fields').querySelector('[name=frontMode]').value='custom';};back.oninput=()=>{$('dialog-fields').querySelector('[name=backMode]').value='custom';};
    }});
  }
  renderReview() {
    if(this.study.learning?.renderReview(this.set,this.panel))return;
    this.panel.className='study-review-panel';this.panel.onkeydown=null;
    this.panel.innerHTML='<div class="study-review-empty"><h2>开始复习</h2><p>使用保存的卡片和复习计划建立本次队列。</p><button id="study-review-start" class="primary">开始到期复习</button></div>';
    $('study-review-start').onclick=run(()=>this.study.change('study.review.session.start',{mode:'scheduled',sort:'due'}));
  }
}
