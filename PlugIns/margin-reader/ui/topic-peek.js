import {escape} from './dom.js';
import {base} from './transport.js';
const selector='.mindmap-topic .mm-topic-details,.mindmap-topic .study-card-source';

// A disposable preview; card IDs, snapshots and edits stay in the shared Core.
export class TopicPeek {
  constructor(study){
    this.study=study;this.board=study.map.board;this.panel=document.createElement('aside');this.panel.id='mindmap-peek';
    this.panel.hidden=true;this.panel.setAttribute('role','tooltip');document.body.append(this.panel);
    this.board.addEventListener('pointerover',e=>{const b=e.target.closest(selector);if(b&&!b.contains(e.relatedTarget))this.schedule(b);});
    this.board.addEventListener('focusin',e=>{const b=e.target.closest(selector);if(b)this.schedule(b);});
    this.board.addEventListener('pointerout',e=>{const b=e.target.closest(selector);if(b&&!b.contains(e.relatedTarget))this.hide();});
    this.board.addEventListener('focusout',()=>this.hide());
    document.addEventListener('pointerdown',()=>this.hide(),true);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.hide();},true);
    this.board.addEventListener('scroll',()=>this.settle(),true);
    window.addEventListener('resize',()=>this.hide());
  }
  hide(){clearTimeout(this.timer);this.panel.hidden=true;this.anchor?.removeAttribute('aria-describedby');this.anchor=null;}
  schedule(button){this.hide();this.timer=setTimeout(()=>this.show(button),260);}
  settle(){this.hide();requestAnimationFrame(()=>{const b=[...this.board.querySelectorAll(selector)].find(el=>el.matches(':hover'));if(b)this.schedule(b);});}
  observe(set){const key=set.id+':'+set.revision;if(key!==this.key){this.key=key;this.settle();}}
  show(button){
    const set=this.study.current,el=button.closest('.mindmap-topic');
    if(!el?.isConnected||!set||this.study.busy)return;
    const card=set.cards.find(c=>c.id===el.dataset.cardId);if(!card)return;
    const parts=[card.sourceTitle||card.source?.title||'',card.source?.locator.page?'第 '+card.source.locator.page+' 页':'',card.tags?.map(v=>'#'+v).join(' ')||''];
    this.panel.innerHTML=`<h3>${escape(card.title)}</h3><small>${escape(parts.filter(Boolean).join(' · '))}</small>${card.imageAsset?`<div class="peek-image"><img src="${escape(new URL('data/'+card.imageAsset,base).href)}" alt="${escape(card.title)} · 原始摘录"></div>`:''}<p>${escape(card.editedText??card.text??card.note??'')}</p><div class="peek-hint">单击预览按钮打开详情 · 单击主题回到原文</div>`;
    this.panel.hidden=false;this.anchor=button;button.setAttribute('aria-describedby',this.panel.id);
    const box=el.getBoundingClientRect(),width=this.panel.offsetWidth,height=this.panel.offsetHeight;
    const left=box.right+14+width<=innerWidth?box.right+14:box.left-width-14;
    this.panel.style.left=Math.max(12,Math.min(left,innerWidth-width-12))+'px';
    this.panel.style.top=Math.max(12,Math.min(box.top,innerHeight-height-12))+'px';
  }
}
