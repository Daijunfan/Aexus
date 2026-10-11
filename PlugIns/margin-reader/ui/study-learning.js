import {imageInkHtml} from './image-ink.js';
import {editEmphasis,generateReview} from './study-emphasis.js';
import {$,escape,field,showDialog,closeDialog,run,toast} from './dom.js';
import {faceHtml,editHandwriting} from './review-faces.js';
import {api,base} from './transport.js';
const area=(name,label,value='')=>`<label class="dialog-field"><span>${escape(label)}</span><textarea name="${name}">${escape(value)}</textarea></label>`;
const ratings=[['again','重来'],['hard','困难'],['good','良好'],['easy','简单']];
export class StudyLearning {
  constructor(study){
    this.study=study;const bar=document.createElement('span');bar.className='study-learning-tools';
    bar.innerHTML='<button id="study-learning-menu">复习 / 回忆</button><button id="study-presentation">演示</button><button id="recall-reset" hidden>重新遮挡</button>';
    $('study-review-settings').after(bar);
    $('study-learning-menu').onclick=()=>this.menu();$('study-presentation').onclick=run(()=>this.present());$('recall-reset').onclick=run(()=>study.change('study.recall.set',{reset:true}));
    const screen=document.createElement('section');screen.id='presentation-screen';screen.hidden=true;screen.setAttribute('role','dialog');screen.setAttribute('aria-label','本地卡片演示');screen.innerHTML='<header><span id="presentation-progress"></span><button id="presentation-close">退出演示 · Esc</button></header><article id="presentation-content"></article><footer><button id="presentation-previous">上一张 · ←</button><button id="presentation-next">下一张 · →</button></footer>';document.body.append(screen);
    $('presentation-close').onclick=run(()=>study.change('study.presentation.action',{action:'stop'}));
    for(const direction of ['previous','next'])$('presentation-'+direction).onclick=run(()=>study.change('study.presentation.action',{action:direction}));
    document.addEventListener('keydown',event=>{
      if(!$('presentation-screen').hidden&&!event.target.closest('input,textarea,[contenteditable]')){
        const id=event.key==='Escape'?'presentation-close':event.key==='ArrowLeft'?'presentation-previous':['ArrowRight',' '].includes(event.key)?'presentation-next':null;
        if(id){event.preventDefault();event.stopImmediatePropagation();if(!$(id).disabled)$(id).click();}
      }
    },true);
    study.map.board.addEventListener('click',event=>{const button=event.target.closest('[data-recall-card]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();run(()=>study.change('study.recall.reveal',{cardId:button.dataset.recallCard}))();},true);
  }
  menu(){
    const set=this.study.current;
    showDialog({title:'复习与主动回忆',html:'<div class="organize-actions">'+[['session','开始 / 重建复习队列'],['batch','批量加入 / 移出牌组'],['generate','从强调与荧光笔出题'],['recall','文档 / 脑图回忆遮挡'],['log','查看复习记录'],['step','脑图逐级展开'],['collapse','收起全部分支'],['expand','展开全部分支']].map(([id,text])=>`<button type="button" data-learning="${id}">${text}</button>`).join('')+'</div>',onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-learning]').forEach(b=>b.onclick=run(()=>{closeDialog();switch(b.dataset.learning){case'session':return this.start();case'batch':return this.batch();case'generate':return generateReview(this.study);case'recall':return this.recallDialog();case'log':return this.logs();case'step':return this.expandOneLevel();default:return this.study.change('study.cards.batch',{cardIds:set.cards.map(c=>c.id),patch:{collapsed:b.dataset.learning==='collapse'}},set.revision);}}));}});
  }
  start(){
    const set=this.study.current,selected=this.study.organization.ids();
    showDialog({title:'开始复习',html:field('mode','方式','scheduled',{choices:[['scheduled','FSRS 到期复习'],['practice','练习 · 不改复习计划']]})+field('scope','范围','all',{choices:[['all','全部符合条件的卡片'],['selection',`选中卡片 / 分支 (${selected.length})`]]})+field('deckId','牌组','',{choices:[['','当前全部牌组'],...set.decks.filter(d=>!d.deletedAt).map(d=>[d.id,d.title])]})+field('query','包含文字（可选）')+field('sort','顺序','due',{choices:[['due','到期时间'],['outline','大纲顺序'],['source','原文顺序'],['title','标题'],['created','创建日期'],['random','随机']]})+field('limit','最多题数',100,{type:'number',min:1,max:10000})+'<p class="dialog-note">复习进度和翻面状态自动保存。练习模式不更改 FSRS；分组可按顺序揭示，也可选择各组独立排程。</p>',submit:'开始',onSubmit:v=>{if(v.scope==='selection'&&!selected.length)throw Error('请先选择卡片或分支');return this.study.change('study.review.session.start',{mode:v.mode,sort:v.sort,limit:Number(v.limit),...(v.deckId?{deckId:v.deckId}:{}),...(v.query?{filter:{query:v.query}}:{}),...(v.scope==='selection'?{cardIds:selected,descendants:true}:{})},set.revision);}});
  }
  batch(){
    const set=this.study.current,selected=this.study.organization.ids();
    showDialog({title:'批量复习设置',html:field('scope','范围',selected.length?'selection':'all',{choices:[['selection',`选中卡片与分支 (${selected.length})`],['all','此学习集全部卡片']]})+field('query','限定文字（可选）')+field('enabled','复习状态','yes',{choices:[['yes','加入 / 恢复复习'],['no','移出复习（保留记录）']]})+field('deckId','牌组','keep',{choices:[['keep','保持原牌组'],['','不分组'],...set.decks.filter(d=>!d.deletedAt).map(d=>[d.id,d.title])]})+field('frontMode','正面来源','keep',{choices:[['keep','保持原设置'],['title','标题'],['card','完整卡片'],['emphasis','已标记的挖空文本'],['custom','自定义问题']]})+field('backMode','背面来源','keep',{choices:[['keep','保持原设置'],['card','完整卡片'],['custom','独立答案']]})+field('revealMode','分组方式','keep',{choices:[['keep','保持原设置'],['sequential','按组依次揭示'],['independent','独立分组排程']]})+area('front','正面模板（空白保持；支持 {title}）')+area('back','背面模板（空白保持；支持 {text} / {note}）'),submit:'批量保存',onSubmit:v=>{if(v.scope==='selection'&&!selected.length)throw Error('先选择卡片');return this.study.change('study.review.batch',{...(v.scope==='selection'?{cardIds:selected,descendants:true}:{}),...(v.query?{filter:{query:v.query}}:{}),patch:{enabled:v.enabled==='yes',...Object.fromEntries(['frontMode','backMode','revealMode'].filter(k=>v[k]!=='keep').map(k=>[k,v[k]])),...(v.deckId!=='keep'?{deckId:v.deckId||null}:{}),...(v.front.trim()?{frontTemplate:v.front}:{}),...(v.back.trim()?{backTemplate:v.back}:{})}},set.revision);},afterOpen:()=>{for(const side of ['front','back'])$('dialog-fields').querySelector(`[name=${side}]`).oninput=()=>{$('dialog-fields').querySelector(`[name=${side}Mode]`).value='custom';};}});
  }
  recallDialog(){
    const set=this.study.current,r=set.recall||{};
    showDialog({title:'主动回忆 · 文档与脑图',html:field('enabled','状态',r.enabled?'yes':'no',{choices:[['yes','开启回忆遮挡'],['no','恢复正常阅读']]})+field('scope','遮挡范围',r.scope||'both',{choices:[['both','文档与脑图'],['document','仅文档'],['map','仅脑图']]})+field('mode','表现形式',r.mode||'mask',{choices:[['mask','遮挡答案'],['blur','模糊答案'],['titles','保留卡片标题作为提示']]})+'<p class="dialog-note">点击原文遮挡或卡片遮挡揭示答案；重新遮挡可重复练习。不会删除标注或更改复习安排。</p>',onSubmit:v=>this.study.change('study.recall.set',{enabled:v.enabled==='yes',scope:v.scope,mode:v.mode,reset:true},set.revision)});
  }
  masked(card,scope){const r=this.study.current?.recall;return Boolean(r?.enabled&&(r.scope==='both'||r.scope===scope)&&(!r.cardIds?.length||r.cardIds.includes(card.id))&&!r.revealedIds?.includes(card.id));}
  paintMark(el,card){
    if(!this.masked(card,'document'))return;el.classList.add('study-recall-mask');
    const blur=this.study.current.recall.mode==='blur';Object.assign(el.style,{background:blur?'rgba(70,82,97,.4)':'#52616b',opacity:'1',mixBlendMode:'normal',borderRadius:'2px',backdropFilter:blur?'blur(7px)':'none'});
    el.setAttribute('aria-label','回忆遮挡，点击显示答案');
  }
  render(set){
    $('recall-reset').hidden=!set.recall?.enabled;const byId=new Map(set.cards.map(c=>[c.id,c]));
    for(const el of this.study.map.board.querySelectorAll('.study-card,.study-list-card')){
      const card=byId.get(el.dataset.cardId);el.querySelector('.recall-card-cover')?.remove();el.classList.remove('recall-blurred');
      if(!card||!this.masked(card,'map')||set.view==='review')continue;
      const cover=document.createElement('button');cover.type='button';cover.className='recall-card-cover';cover.dataset.recallCard=card.id;cover.textContent='回忆后点击揭示';
      if(set.recall.mode==='blur')el.classList.add('recall-blurred');cover.dataset.mode=set.recall.mode;el.append(cover);
    }
    const presentation=set.presentation;const show=presentation?.enabled===true;$('presentation-screen').hidden=!show;
    if(show)run(()=>this.renderPresentation(set))();else this.study.mindmapStudio?.presenter.stop();
  }
  async present(){const ids=this.study.organization.ids();return this.study.change('study.presentation.start',ids.length?{cardIds:ids,descendants:true}:{});}
  async renderPresentation(set){
    const s=set.presentation,key=JSON.stringify([set.id,set.revision,s.index]);if(this.presentationKey===key)return;this.presentationKey=key;
    const card=set.cards.find(c=>c.id===s.cardIds[s.index]);$('presentation-progress').textContent=`${set.title} · ${s.index+1} / ${s.cardIds.length}`;
    $('presentation-previous').disabled=s.index<=0;$('presentation-next').disabled=s.index+1>=s.cardIds.length;
    if(!card){$('presentation-content').textContent='此卡片已被删除，请选择下一张。';return;}
    if(s.mode==='map'&&this.study.mindmapStudio?.presenter.render(set))return;this.study.mindmapStudio?.presenter.stop();
    const rich=await api('study.card.render',{setId:set.id,cardId:card.id});if(this.presentationKey!==key)return;
    $('presentation-content').innerHTML=`<h1>${escape(card.title)}</h1>${s.showImages&&card.imageAsset?`<img src="${new URL('data/'+card.imageAsset,base).href}" alt="${escape(card.title)}">`:''}<div>${rich.html}</div>${s.showNotes?rich.noteHtml+rich.comments.map(c=>`<section>${c.html}</section>`).join(''):''}`;
    const wrapper=document.createElement('div');wrapper.innerHTML=$('presentation-content').innerHTML;$('presentation-content').replaceChildren(wrapper);this.study.content.bindLinks(wrapper,rich);
  }
  expandOneLevel(){
    const set=this.study.current,visible=new Set(this.study.map.layout?.positions.keys()||[]),ids=set.cards.filter(c=>c.collapsed&&visible.has(c.id)).map(c=>c.id);
    if(!ids.length){toast('当前分支已全部展开');return;}return this.study.change('study.cards.batch',{cardIds:ids,patch:{collapsed:false}},set.revision);
  }
  async logs(){
    const set=this.study.current;let offset=0;
    showDialog({title:'复习记录',html:'<div id="review-log"></div><button type="button" id="review-log-more">下一页</button>',onSubmit:null,afterOpen:()=>{
      const load=async()=>{const data=await api('study.review.log',{setId:set.id,offset,limit:50});if(!$('review-log'))return;$('review-log').innerHTML=`<p>共 ${data.total} 次评分</p>`+data.logs.map(l=>`<p>${escape(new Date(l.review).toLocaleString())} · ${escape(l.title)} ${escape(l.variantId||'')} · ${['','重来','困难','良好','简单'][l.rating]}</p>`).join('');$('review-log-more').disabled=data.nextOffset===null;offset=data.nextOffset;};$('review-log-more').onclick=run(load);run(load)();
    }});
  }
  renderReview(set,panel){
    const session=set.reviewSession;if(!session?.id)return false;
    const key=JSON.stringify([set.id,set.revision]);if(this.reviewKey===key)return true;this.reviewKey=key;panel.className='study-review-panel';panel.onkeydown=null;this.renderingFaces=null;
    if(session.finished){panel.innerHTML=`<div class="study-review-empty"><h2>本轮${session.mode==='practice'?'练习':'复习'}完成</h2><p>已回答 ${session.completed} / ${session.total} 题</p><button id="review-session-new">重新选择复习范围</button></div>`;$('review-session-new').onclick=()=>this.start();return true;}
    const current=session.current,card=set.cards.find(c=>c.id===current?.cardId),action=(name,extra={})=>this.study.change('study.review.session.action',{sessionId:session.id,action:name,...extra},set.revision);
    panel.innerHTML=`<div class="study-review-status">${session.mode==='practice'?'练习 · 不更改 FSRS':'FSRS 复习'} · ${session.index+1} / ${session.total}<button id="review-session-star">${card?.favorite?'★ 已收藏':'☆ 收藏'}</button><button id="review-session-context">原文上下文</button><button id="review-edit-card">编辑背面卡片</button><button id="review-emphasis">强调内容</button><button id="review-generate">从标记出题</button><button id="review-edit-settings">正反面设置</button><button id="review-session-comments">全部批注</button><button id="review-session-speech">朗读</button></div><article class="study-flashcard"><div class="review-face-tools"><small>${card?.review?.generation?'自动出题':'问题'}${current?.groups.length?' · 已揭示 '+current.revealedGroups.length+'/'+current.groups.length+' 组':''}</small><button id="review-front-comment">正面批注</button><button id="review-front-ink">手写</button><button id="review-rehide" ${session.revealed||current?.revealedGroups.length?'':'hidden'}>重新遮挡</button></div><div class="study-review-front">${escape(current?.available?current.front:current?.unavailableReason||'题目已删除或分组配置已变化，请重建复习队列')}</div><div class="review-front-extra"></div>${card?.imageAsset?`<div class="review-image-wrap" style="--review-image-ratio:${card.image.width/card.image.height}" ${!current.occlusions.length&&!session.revealed?'hidden':''}><img src="${new URL('data/'+card.imageAsset,base).href}" alt="${escape(card.title)}">${!session.revealed?current.occlusions.map(r=>`<span class="study-occlusion" style="left:${r.x*100}%;top:${r.y*100}%;width:${r.width*100}%;height:${r.height*100}%"></span>`).join(''):''}</div>`:''}<section id="study-review-answer" ${session.revealed?'':'hidden'}><hr><div class="review-face-tools"><small>答案</small><button id="review-back-comment">背面批注</button><button id="review-back-ink">手写</button></div><div class="review-back-content">${escape(current?.back||'')}</div></section></article><button id="study-review-reveal" class="primary" ${session.revealed?'hidden':''} ${current?.available?'':'disabled'}>${current?.remainingGroups.length?'揭示下一组':'显示答案'} · 空格</button><div id="study-review-grades" ${session.revealed?'':'hidden'}>${ratings.map(([id,text],i)=>`<button data-grade="${id}" ${current?.answer||!current?.available?'disabled':''}><strong>${i+1} · ${text}</strong></button>`).join('')}</div><div class="review-session-navigation"><button id="review-session-previous" ${session.index===0?'disabled':''}>上一张</button><button id="review-session-next" ${session.index+1>=session.total?'disabled':''}>下一张</button><button id="review-session-rebuild" ${current?.available?'hidden':''}>重建复习队列</button><button id="review-session-finish">结束本轮</button></div>`;
    const questionKey=[set.id,session.id,current?.key].join('/');if(this.reviewQuestionKey!==questionKey){panel.scrollTop=0;this.reviewQuestionKey=questionKey;}
    if(card){
      $('review-emphasis').onclick=()=>editEmphasis(this.study,card);$('review-generate').onclick=()=>generateReview(this.study,[card.id]);
      $('review-session-comments').onclick=run(()=>this.study.content.comments(card));$('review-edit-card').onclick=()=>this.study.map.edit(card);$('review-edit-settings').onclick=run(()=>this.study.map.workbench.configureReview(card));
      for(const side of ['front','back']){$('review-'+side+'-comment').onclick=run(()=>this.study.content.comments(card,side));$('review-'+side+'-ink').onclick=()=>editHandwriting(this.study,card,side);}
      $('review-rehide').onclick=run(()=>action('reveal',{revealed:false}));
      if(current.available)run(async()=>{const rich=await api('study.review.render',{setId:set.id,cardId:card.id,variantId:current.variantId,sessionId:session.id});if(this.reviewKey!==key||!panel.isConnected)return;if(rich.revision!==set.revision){await this.study.refresh();return;}
        const front=panel.querySelector('.study-review-front'),extra=panel.querySelector('.review-front-extra'),back=panel.querySelector('.review-back-content');front.innerHTML=rich.front.html;extra.innerHTML=faceHtml({...rich.front,html:''},rich.frontInk,rich.colors);back.innerHTML=faceHtml(rich.back,rich.ink,rich.colors);this.study.content.bindLinks(front,rich);this.study.content.bindLinks(extra,rich);this.study.content.bindLinks(back,rich);
        const image=panel.querySelector('.review-image-wrap');if(image){image.querySelectorAll('.image-bound-overlay').forEach(el=>el.remove());image.querySelector('img').insertAdjacentHTML('afterend',imageInkHtml(rich,session.revealed?rich.backImageInk:rich.frontImageInk,rich.colors));}if(image&&rich.frontMode==='card'&&!card.review?.cloze)image.hidden=false;panel.dataset.reviewRendered=key;
      })();
    }

    $('review-session-rebuild').onclick=()=>this.start();
    $('study-review-reveal').onclick=run(()=>action('reveal'));
    panel.querySelectorAll('[data-grade]').forEach(b=>b.onclick=run(()=>action('grade',{rating:b.dataset.grade})));
    for(const id of ['previous','next','finish'])$('review-session-'+id).onclick=run(()=>action(id));
    $('review-session-star').disabled=!card;$('review-session-star').onclick=run(()=>action('favorite'));
    $('review-session-context').disabled=!card||!(card.source||card.anchor||card.reference);$('review-session-context').onclick=run(()=>this.study.source(card));
    $('review-session-speech').onclick=run(()=>this.study.devices.readAloud(card,session.revealed?current.back:current.front));
    panel.tabIndex=0;if(document.activeElement===document.body&&!$('dialog').open)panel.focus({preventScroll:true});panel.onkeydown=event=>{if(event.target.closest('input,textarea,select,audio,video,[contenteditable=true]')||$('dialog').open)return;if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();const button=$(event.key==='ArrowLeft'?'review-session-previous':'review-session-next');if(!button.disabled)button.click();return;}if(event.target.closest('button,a'))return;if(event.code==='Space'){event.preventDefault();event.stopPropagation();if(!$('study-review-reveal').hidden)$('study-review-reveal').click();}else if(/^[1-4]$/.test(event.key)&&!$('study-review-grades').hidden){event.preventDefault();event.stopPropagation();panel.querySelectorAll('[data-grade]')[Number(event.key)-1]?.click();}};
    return true;
  }
}
