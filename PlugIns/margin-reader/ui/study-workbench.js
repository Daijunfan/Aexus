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
    this.panel = panel;
    tools.querySelectorAll('[data-study-view]').forEach(b=>b.onclick=run(()=>this.study.change('study.view.set',{view:b.dataset.studyView})));
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
    if(changed){$('study-card-search').value='';$('study-color-filter').value='';$('study-tag-filter').value='';this.filtered=null;this.reviewKey=null;}
    const view=set.view||'map';
    if(view!=='review')this.panel.onkeydown=null;
    document.querySelectorAll('[data-study-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.studyView===view));
    $('study-undo').disabled=!set.history?.canUndo;$('study-redo').disabled=!set.history?.canRedo;
    const tag=$('study-tag-filter').value,tags=[...new Set(set.cards.flatMap(c=>c.tags||[]))].sort();
    $('study-tag-filter').innerHTML='<option value="">全部标签</option>'+tags.map(t=>`<option value="${escape(t)}">${escape(t)}</option>`).join('');$('study-tag-filter').value=tags.includes(tag)?tag:'';
    const filtering=Boolean($('study-card-search').value||$('study-color-filter').value||$('study-tag-filter').value);
    $('study-map-viewport').hidden=view!=='map'||filtering;this.panel.hidden=view==='map'&&!filtering;
    document.querySelector('.study-card-filters').hidden=view==='review';
    for(const id of ['study-zoom-in','study-zoom-out','study-zoom-fit'])$(id).hidden=view!=='map'||filtering;
    if(view==='review'){this.renderReview();return;}
    if(filtering){if(changed||previous?.revision!==set.revision)run(()=>this.filter())();else this.renderCards(this.filtered||[]);}
    else this.renderCards(set.cards);
  }
  async filter() {
    if(!this.study.current)return;
    const serial=this.serial=(this.serial||0)+1,setId=this.study.current.id;
    const data=await api('study.cards.query',{setId,query:$('study-card-search').value,...($('study-color-filter').value?{color:$('study-color-filter').value}:{}),...($('study-tag-filter').value?{tag:$('study-tag-filter').value}:{})});
    if(serial!==this.serial||this.study.current?.id!==setId)return;
    this.filtered=data.cards;
    const filtering=Boolean($('study-card-search').value||$('study-color-filter').value||$('study-tag-filter').value);
    $('study-map-viewport').hidden=this.set.view!=='map'||filtering;this.panel.hidden=this.set.view==='map'&&!filtering;
    this.renderCards(data.cards);
  }
  renderCards(cards) {
    if(this.panel.hidden||this.set.view==='review')return;
    const outline=this.set.view==='outline';this.panel.className=outline?'study-outline-list':'study-card-grid';
    const depths=new Map();for(const c of this.set.cards)depths.set(c.id,c.parentId?(depths.get(c.parentId)||0)+1:0);
    const visible=outline&&!$('study-card-search').value&&!$('study-color-filter').value&&!$('study-tag-filter').value?new Set(this.map.layout?.positions.keys()||[]):null;
    this.panel.innerHTML=cards.filter(c=>!visible||visible.has(c.id)).map(c=>`<article class="study-list-card" data-card-id="${c.id}" style="--card-color:${this.set.colors[c.color]};--depth:${Math.min(depths.get(c.id)||0,12)}" tabindex="0"><header><button data-do="collapse" aria-label="${c.collapsed?'展开':'收起'}子卡片" ${this.set.cards.some(n=>n.parentId===c.id)?'':'disabled'}>${c.collapsed?'▸':'▾'}</button><strong>${escape(c.title)}</strong><button data-do="edit" aria-label="编辑卡片">⋯</button></header>${outline?'':c.imageAsset?`<img src="${new URL('data/'+c.imageAsset,base).href}" alt="${escape(c.title)}" loading="lazy">`:`<p class="study-note-body">${escape(c.text)}</p>`}<p class="study-tags">${(c.tags||[]).map(t=>`<span>#${escape(t)}</span>`).join('')}</p><footer><button data-do="source">${c.source?'↗ 原文':'编辑笔记'}</button><button data-do="links">关联</button><button data-do="review">${c.review?.enabled?'已加入复习':'加入复习'}</button></footer></article>`).join('')||'<p class="study-empty-message">没有符合条件的卡片</p>';
    for(const el of this.panel.querySelectorAll('[data-card-id]')){
      const card=this.set.cards.find(c=>c.id===el.dataset.cardId);
      el.onclick=()=>this.map.select(card.id);
      el.ondblclick=()=>this.map.edit(card);
      el.querySelectorAll('[data-do]').forEach(b=>b.onclick=run(e=>{e.stopPropagation();switch(b.dataset.do){case'edit':return this.map.menu(card,b);case'collapse':return this.study.change('study.card.update',{cardId:card.id,collapsed:!card.collapsed});case'source':return this.study.source(card);case'links':return this.links(card);case'review':return this.configureReview(card);}}));
      el.onkeydown=e=>{if(e.target!==el)return;if(e.key==='Tab'){e.preventDefault();this.map.nest(card,e.shiftKey);}else if(e.key==='Enter'){e.preventDefault();this.map.edit(card);}else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();this.map.remove(card);}};
    }
  }
  create(parentId) {
    const set=this.study.current;
    showDialog({title:parentId?'新建子卡片':'新建笔记卡',html:field('title','标题','',{required:true})+area('text','正文')+field('color','颜色','yellow',{choices:this.study.colors})+field('tags','标签（逗号分隔）'),submit:'创建',onSubmit:async v=>{const next=await this.study.change('study.note.create',{...v,tags:splitTags(v.tags),...(parentId?{parentId}:{})},set.revision);const c=next.cards.find(c=>!set.cards.some(old=>old.id===c.id));if(c)this.map.select(c.id);}});
  }
  edit(card) {
    const revision=this.study.current.revision;
    showDialog({title:card.source?'编辑摘录卡片':'编辑笔记卡',html:field('title','标题',card.title,{required:true})+(!card.source?area('text','正文',card.text):'')+area('note','笔记',card.note)+field('color','颜色',card.color,{choices:this.study.colors})+field('tags','标签（逗号分隔）',(card.tags||[]).join(', ')),onSubmit:v=>this.study.change('study.card.update',{cardId:card.id,...v,tags:splitTags(v.tags)},revision)});
  }
  links(card) {
    const set=this.study.current,links=set.links.filter(l=>l.from===card.id||l.to===card.id),others=set.cards.filter(c=>c.id!==card.id);
    showDialog({title:'卡片关联 · '+card.title,html:links.map(l=>{const target=set.cards.find(c=>c.id===(l.from===card.id?l.to:l.from));return `<div class="study-link-row"><button type="button" data-jump="${target.id}">${l.bidirectional?'↔':l.from===card.id?'→':'←'} ${escape(target.title)}${l.label?' · '+escape(l.label):''}</button><button type="button" data-unlink="${l.id}" aria-label="移除关联">×</button></div>`;}).join('')+(others.length?field('to','关联到',others[0].id,{choices:others.map(c=>[c.id,c.title])})+field('label','关联说明')+field('direction','方向','both',{choices:[['both','双向'],['one','单向 →']]}):'<p class="dialog-note">创建另一张卡片后即可建立关联。</p>'),submit:'添加关联',onSubmit:others.length?v=>this.study.change('study.link.add',{from:card.id,to:v.to,label:v.label,bidirectional:v.direction==='both'},set.revision):null,afterOpen:()=>{
      document.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=run(async()=>{await this.study.change('study.link.remove',{linkId:b.dataset.unlink},set.revision);$('dialog-cancel').click();}));
      document.querySelectorAll('[data-jump]').forEach(b=>b.onclick=run(async()=>{$('dialog-cancel').click();await this.study.change('study.view.set',{view:'map'});this.map.select(b.dataset.jump);this.map.center(b.dataset.jump);}));
    }});
  }
  configureReview(card) {
    const revision=this.study.current.revision;
    showDialog({title:'复习卡片',html:area('front','正面 · 问题',card.review?.front??card.title)+area('back','背面 · 答案',card.review?.back??(card.note||card.text||card.title))+area('cloze','挖空文本（可选，用 {{答案}} 标记）',card.review?.cloze||'')+field('deckId','牌组',card.review?.deckId||'',{choices:[['','未分组'],...(this.study.current.decks||[]).filter(d=>!d.deletedAt).map(d=>[d.id,d.title])]})+field('enabled','复习状态',card.review?.enabled===false?'no':'yes',{choices:[['yes','加入复习'],['no','暂停复习']]}),onSubmit:v=>this.study.change('study.review.configure',{cardId:card.id,front:v.front,back:v.back,enabled:v.enabled==='yes',deckId:v.deckId||null,...(v.cloze.trim()?{cloze:v.cloze}:{})},revision)});
  }
  renderReview() {
    this.panel.className='study-review-panel';
    const set=this.set,card=set.cards.find(c=>c.id===set.review.cardIds[0]);
    const key=JSON.stringify([set.id,set.revision,card?.id]);if(this.reviewKey===key)return;this.reviewKey=key;
    this.panel.onkeydown=null;
    if(!card){this.panel.innerHTML=`<div class="study-review-empty"><span>✓</span><h2>${set.review.total?'本轮复习完成':'开始你的第一次复习'}</h2><p>${set.review.total?`已加入 ${set.review.total} 张卡片${set.review.nextDue?' · 下次 '+escape(new Date(set.review.nextDue).toLocaleString()):''}`:'在卡片菜单中选择「加入复习」，设置问题和答案。'}</p><button id="study-review-refresh">刷新到期卡片</button><button id="study-review-browse">浏览卡片</button></div>`;$('study-review-browse').onclick=run(()=>this.study.change('study.view.set',{view:'cards'}));$('study-review-refresh').onclick=run(()=>this.study.refresh());return;}
    this.panel.innerHTML=`<div class="study-review-status">待复习 ${set.review.due} / ${set.review.total}<button id="study-review-source">${card.source?'回到原文':'查看笔记'}</button></div><article class="study-flashcard"><small>问题</small><div class="study-review-front">${escape(card.review.front)}</div>${card.imageAsset?`<div class="review-image-wrap" ${card.review.occlusions?.length?'':'hidden'}><img src="${new URL('data/'+card.imageAsset,base).href}" alt="摘录图片">${(card.review.occlusions||[]).map(r=>`<span class="study-occlusion" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%"></span>`).join('')}</div>`:''}<section id="study-review-answer" hidden><hr><small>答案</small><div>${escape(card.review.back)}</div></section></article><button id="study-review-reveal" class="primary">显示答案 · 空格</button><div id="study-review-grades" hidden>${[['again','重来'],['hard','困难'],['good','良好'],['easy','简单']].map(([id,label],i)=>`<button data-grade="${id}"><strong>${i+1} · ${label}</strong><small>计算下次复习时间…</small></button>`).join('')}</div>`;
    $('study-review-source').onclick=run(()=>this.study.source(card));
    $('study-review-reveal').onclick=()=>{$('study-review-answer').hidden=false;this.panel.querySelectorAll('.study-occlusion').forEach(el=>el.hidden=true);this.panel.querySelectorAll('.review-image-wrap').forEach(el=>el.hidden=false);$('study-review-grades').hidden=false;$('study-review-reveal').hidden=true;};
    this.panel.querySelectorAll('[data-grade]').forEach(b=>b.onclick=run(async()=>{this.panel.querySelectorAll('[data-grade]').forEach(el=>el.disabled=true);try{await this.study.change('study.review.grade',{cardId:card.id,rating:b.dataset.grade},set.revision);}finally{this.panel.querySelectorAll('[data-grade]').forEach(el=>el.disabled=false);}}));
    run(async()=>{const preview=await api('study.review.preview',{setId:set.id,cardId:card.id});if(this.reviewKey!==key)return;for(const [rating,date] of Object.entries(preview)){const el=this.panel.querySelector(`[data-grade="${rating}"] small`);if(el)el.textContent=new Date(date).toLocaleString();}})();
    this.panel.tabIndex=0;
    this.panel.onkeydown=e=>{if(e.target.closest('input,textarea,select'))return;if(e.code==='Space'&&!$('study-review-reveal').hidden){e.preventDefault();$('study-review-reveal').click();}else if(/^[1-4]$/.test(e.key)&&!$('study-review-grades').hidden){e.preventDefault();this.panel.querySelectorAll('[data-grade]')[Number(e.key)-1]?.click();}};
  }
}
