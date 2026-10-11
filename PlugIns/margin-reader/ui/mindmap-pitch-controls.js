import {$,field,showDialog} from './dom.js';
export class MindmapPitchControls{
 constructor(studio){this.studio=studio;const bar=studio.bar.querySelector('.mm-active-tools');bar.insertAdjacentHTML('beforeend','<button id="mm-pitch-settings">演示设置</button>');$('mm-pitch-settings').onclick=()=>this.open();}
 open(){
  this.studio.guard();const set=this.studio.study.current,p=set.map.mindmap.pitch||{},card=set.cards.find(c=>c.id===this.studio.map.selected);
  showDialog({title:'自动编排演示',html:field('layout','版式',p.layout||'auto',{choices:[['auto','自动编排'],['grid','卡片网格'],['list','纵向列表'],['split','内容与图片'],['map','导图上下文']]})+field('delivery','讲述顺序',p.delivery||'topics',{choices:[['topics','逐个主题'],['branches','重点分支'],['step','分支逐步揭示']]})+field('theme','背景',p.theme||'map',{choices:[['map','跟随导图'],['light','明亮'],['dark','深夜']]})+field('ratio','画面比例',p.ratio||'16:9',{choices:[['16:9','16:9'],['4:3','4:3']]})+(card?field('topicVisible','当前主题独立成页',card.mindmap?.pitch?.visible===false?'no':'yes',{choices:[['yes','显示'],['no','隐藏独立页 · 保留上下文']]}):'')+'<p class="dialog-note">大分支自动拆为多页，主题、原图和完整笔记保留。演示中可以打开演讲者视图查看全文和下一页。</p>',onSubmit:async v=>{
   await this.studio.study.change('study.mindmap.configure',{patch:{pitch:{...p,layout:v.layout,delivery:v.delivery,theme:v.theme,ratio:v.ratio}},...(card?{topicPitch:{cardId:card.id,...card.mindmap?.pitch,visible:v.topicVisible==='yes'}}:{})},set.revision);
  }});
 }
}
