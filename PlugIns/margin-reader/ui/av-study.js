import {$,field,showDialog,run,escape} from './dom.js';
import {api} from './transport.js';
import {mediaTime} from './av-reader.js';
export class AVStudy {
 constructor(study){this.study=study;const bar=document.createElement('section');bar.id='av-study-tools';bar.hidden=true;bar.innerHTML='<button id="av-excerpt">摘录时间片段</button><span id="av-source-notes" aria-label="时间笔记"></span>';$('reader-view').insertBefore(bar,$('reader-view').querySelector('.reader-viewport'));$('av-excerpt').onclick=run(()=>this.capture());}
 render(){const doc=this.study.getDocument(),set=this.study.current;$('av-study-tools').hidden=doc?.kind!=='media';if(doc?.kind!=='media')return;const cards=(set?.cards||[]).filter(c=>c.anchor?.documentId===doc.id&&c.anchor.locator.time!==undefined).sort((a,b)=>a.anchor.locator.time-b.anchor.locator.time);$('av-source-notes').innerHTML=cards.map(c=>`<button data-time-card="${c.id}" title="${escape(c.title)}">${mediaTime(c.anchor.locator.time)} · ${escape(c.title)}</button>`).join('');$('av-source-notes').querySelectorAll('button').forEach(b=>b.onclick=run(()=>this.study.source(cards.find(c=>c.id===b.dataset.timeCard))));}
 async capture(){
  if(!this.study.current)await this.study.ensureNotes();const set=this.study.current,doc=this.study.getDocument();if(doc?.kind!=='media')return;
  const time=this.study.getRenderer().currentLocator(doc).time;
  showDialog({title:'摘录本地音视频',html:field('title','标题',`${doc.title} · ${mediaTime(time)}`,{required:true})+field('start','起点（秒）',time,{type:'number',min:0,max:doc.media.duration})+field('end','终点（秒）',time,{type:'number',min:0,max:doc.media.duration})+'<label class="dialog-field"><span>笔记</span><textarea name="text"></textarea></label>'+field('color','颜色','yellow',{choices:this.study.colors})+'<p class="dialog-note">视频保存原始时间点画面；音频保存片段波形。卡片来源可跳回原始时间区间，原件保持不变。</p>',submit:'保存摘录',onSubmit:async v=>{const next=await this.study.change('study.av.excerpt',{documentId:doc.id,expectedSourceVersion:doc.sourceVersion,start:Number(v.start),end:Number(v.end),title:v.title,text:v.text,color:v.color},set.revision);const card=next.cards.find(c=>!set.cards.some(old=>old.id===c.id));if(card)this.study.map.select(card.id);},afterOpen:()=>{for(const name of ['start','end'])$('dialog-fields').querySelector(`[name=${name}]`).step='0.1';}});
 }
}
