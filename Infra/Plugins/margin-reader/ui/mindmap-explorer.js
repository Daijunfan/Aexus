import {$,escape as E,field,showDialog,closeDialog,modalDirty,run,toast} from './dom.js';
import {api} from './transport.js';
const DAY=86400000,date=(value,days)=>new Date(Date.parse(value)+days*DAY).toISOString().slice(0,10);
export class MindmapExplorer{
 constructor(studio){this.studio=studio;this.study=studio.study;
  studio.bar.querySelector('.mm-active-tools').insertAdjacentHTML('beforeend','<button id="mm-outliner" title="以大纲查看、编辑和拖动同一批主题">主题大纲</button><button id="mm-task-timeline" title="以时间条查看和调整主题任务，不创建调度">任务时间图</button>');
  $('mm-outliner').onclick=run(()=>this.open('outline'));$('mm-task-timeline').onclick=run(()=>this.open('timeline'));
 }
 async open(mode,offset=0){
  this.studio.guard();this.study.inspector.guard();const setId=this.study.current.id,set=await api('study.get',{setId});if(this.study.current?.id!==setId)return;
  const plan=mode==='timeline'?await api('study.mindmap.tasks.plan',{setId,offset,limit:100}):null;if(plan&&plan.revision!==set.revision)throw Error('学习集已变化，请重新打开时间图。');
  const depths=new Map();for(const c of set.cards)depths.set(c.id,c.parentId?(depths.get(c.parentId)||0)+1:0);
  const rows=plan?plan.tasks:set.cards.slice(offset,offset+100),total=plan?.total??set.cards.length,range=plan?.range,days=range?.days||1,scale=Math.min(36,6000/days),width=Math.max(540,days*scale),tick=Math.max(1,Math.ceil(days/12),Math.ceil(90/scale));
  const bars=plan?`<div class="mm-timeline-axis" style="width:${width}px">${range?Array.from({length:Math.ceil(days/tick)},(_,i)=>`<span style="left:${i*tick*scale}px">${date(range.start,i*tick)}</span>`).join(''):'未设日期的任务可在右侧设置开始与截止日期'}</div>`:'';
  let selected=rows.some(c=>c.id===this.studio.map.selected)?this.studio.map.selected:rows[0]?.id;
  const html=`<div class="mm-explorer-toolbar"><button type="button" id="mm-explorer-previous" ${offset?'':'disabled'}>上一页</button><span>${total?offset+1:0}–${Math.min(offset+100,total)} / ${total} 个${plan?'任务':'主题'}</span><button type="button" id="mm-explorer-next" ${offset+100<total?'':'disabled'}>下一页</button><button type="button" id="mm-explorer-focus">定位到脑图</button>${plan?'<button type="button" id="mm-explorer-export">导出 CSV / 日历</button>':'<button type="button" id="mm-explorer-child">子主题</button><button type="button" id="mm-explorer-sibling">同级主题</button><button type="button" id="mm-explorer-outdent">提升一级</button><button type="button" id="mm-explorer-root">移到顶层</button>'}</div><div class="mm-explorer"><div class="mm-explorer-list">${bars}${rows.map(c=>{
   const start=c.start||c.due,end=c.due||c.start,left=start&&range?(Date.parse(start)-Date.parse(range.start))/DAY*scale:0,length=start?Math.max(6,((Date.parse(end)-Date.parse(start))/DAY+1)*scale):0;
   return `<div class="mm-explorer-row" data-explorer-id="${c.id}" ${plan?'':'draggable="true"'}><button type="button" data-explorer-select="${c.id}" style="padding-left:${12+Math.min(12,depths.get(c.id)||0)*14}px" title="${E(c.title)}"><span>${E(c.title)}</span><small>${plan?E((c.assignee||'')+' · '+c.progress+'%'):c.source?'原文摘录':'独立主题'}</small></button>${plan?`<div class="mm-timeline-lane" style="width:${width}px">${start?`<div class="mm-task-bar" data-task-bar="${c.id}" style="left:${left}px;width:${length}px" title="${E(start+' → '+end+'；拖动调整日期')}"><span class="mm-task-progress" style="width:${c.progress}%"></span><button type="button" data-task-handle="start" aria-label="调整开始日期"></button><button type="button" data-task-handle="progress" style="left:${c.progress}%" aria-label="调整完成进度"></button><button type="button" data-task-handle="due" aria-label="调整截止日期"></button></div>`:'<small>未设置日期</small>'}</div>`:''}</div>`;
  }).join('')||'<p class="dialog-note">暂无主题任务。可在主题格式的“标记”中设置日期、进度或状态。</p>'}</div><div class="mm-explorer-editor">${field('explorer-title','主题标题','',{required:true})+(plan?field('explorer-start','开始日期','',{type:'date'})+field('explorer-due','截止日期','',{type:'date'})+field('explorer-assignee','负责人')+field('explorer-status','状态','none',{choices:[['none','无'],['todo','待办'],['doing','进行中'],['done','完成'],['blocked','阻塞']]})+field('explorer-progress','进度 %',0,{type:'number',min:0,max:100,step:1}):'<label class="dialog-field"><span>主题备注</span><textarea name="explorer-note" rows="6"></textarea></label>')}</div></div>`;
  showDialog({title:plan?'主题任务时间图':'主题大纲',html,submit:'保存主题',onSubmit:rows.length?async v=>{
   const card=set.cards.find(c=>c.id===selected);
   if(this.study.current?.id!==setId)throw Error('学习集已切换，草稿保留。');
   if(plan)await this.study.change('study.mindmap.topics.update',{cardIds:[selected],patch:{task:{...card.mindmap?.task,start:v['explorer-start']||null,due:v['explorer-due']||null,assignee:v['explorer-assignee']||null},status:v['explorer-status'],progress:Number(v['explorer-progress'])}},set.revision);
   else await this.study.change('study.card.update',{cardId:selected,title:v['explorer-title'],note:v['explorer-note']},set.revision);
  }:null,afterOpen:()=>{
   $('dialog').classList.add('mm-explorer-dialog');$('dialog').addEventListener('close',()=>$('dialog').classList.remove('mm-explorer-dialog'),{once:true});
   const select=id=>{
    if(modalDirty()){toast('先保存或取消当前主题的修改。',true);return;}
    selected=id;const card=set.cards.find(c=>c.id===id),task=card?.mindmap||{};if(!card)return;
    for(const [name,value]of Object.entries(plan?{title:card.title,start:task.task?.start||'',due:task.task?.due||'',assignee:task.task?.assignee||'',status:task.status||'none',progress:task.progress??0}:{title:card.title,note:card.note||''}))$('dialog-form').elements.namedItem('explorer-'+name).value=value;
    $('dialog-form').elements.namedItem('explorer-title').readOnly=Boolean(plan||card.reference);
    for(const row of $('dialog-fields').querySelectorAll('[data-explorer-id]'))row.classList.toggle('selected',row.dataset.explorerId===id);
   };if(selected)select(selected);
   const guard=()=>{if(modalDirty())throw Error('请先保存或取消当前主题的修改。');if(this.study.current?.id!==setId)throw Error('学习集已切换。');};
   const turn=async pageOffset=>{guard();closeDialog();await this.open(mode,pageOffset);};
   $('mm-explorer-previous').onclick=run(()=>turn(Math.max(0,offset-100)));$('mm-explorer-next').onclick=run(()=>turn(offset+100));
   $('dialog-fields').querySelectorAll('[data-explorer-select]').forEach(b=>b.onclick=()=>select(b.dataset.explorerSelect));
   $('mm-explorer-focus').onclick=run(async()=>{guard();if(!selected)return;closeDialog();await this.studio.map.focus(selected);this.studio.map.center(selected);});
   $('mm-explorer-export')?.addEventListener('click',()=>{guard();closeDialog();this.export(set);});
   for(const kind of ['child','sibling'])$('mm-explorer-'+kind)?.addEventListener('click',run(async()=>{guard();if(!selected)return;closeDialog();this.studio.map.select(selected);await this.studio.add(kind==='child'?'child':'after');}));
   const move=async parentId=>{guard();if(!selected)return;closeDialog();await this.study.change('study.cards.move',{cardIds:[selected],parentId,expandParent:true},set.revision);await this.open(mode,offset);};
   $('mm-explorer-root')?.addEventListener('click',run(()=>move(null)));$('mm-explorer-outdent')?.addEventListener('click',run(()=>{const parent=set.cards.find(c=>c.id===set.cards.find(c=>c.id===selected)?.parentId);return move(parent?.parentId||null);}));
   let dragged;
   for(const row of $('dialog-fields').querySelectorAll('[draggable]')){
    row.ondragstart=e=>{try{guard();dragged=row.dataset.explorerId;e.dataTransfer.setData('application/x-margin-reader-outline',dragged);e.dataTransfer.effectAllowed='move';}catch(error){e.preventDefault();toast(error.message,true);}};
    row.ondragover=e=>{if(dragged){e.preventDefault();e.dataTransfer.dropEffect='move';}};
    row.ondrop=e=>{if(!dragged)return;e.preventDefault();selected=dragged;dragged=null;run(()=>move(row.dataset.explorerId))();};row.ondragend=()=>{dragged=null;};
   }
   if(plan)for(const bar of $('dialog-fields').querySelectorAll('[data-task-bar]'))bar.onpointerdown=e=>{
    if(e.button!==0)return;try{guard();}catch(error){toast(error.message,true);return;}e.preventDefault();const task=plan.tasks.find(t=>t.id===bar.dataset.taskBar),handle=e.target.dataset.taskHandle||'move',initial=bar.style.cssText,b=bar.getBoundingClientRect();let patch;
    bar.setPointerCapture(e.pointerId);
    const preview=event=>{const delta=Math.round((event.clientX-e.clientX)/scale),start=task.start||task.due,due=task.due||task.start;patch=handle==='progress'?{progress:Math.max(0,Math.min(100,Math.round((event.clientX-b.x)/b.width*100)))}:{task:{...set.cards.find(c=>c.id===task.id).mindmap.task,start:handle==='due'?start:date(start,Math.min(delta,handle==='start'?(Date.parse(due)-Date.parse(start))/DAY:Infinity)),due:handle==='start'?due:date(due,Math.max(delta,handle==='due'?(Date.parse(start)-Date.parse(due))/DAY:-Infinity))}};
     if(patch.progress!==undefined)bar.querySelector('.mm-task-progress').style.width=patch.progress+'%';else{bar.style.left=(Date.parse(patch.task.start)-Date.parse(range.start))/DAY*scale+'px';bar.style.width=Math.max(6,((Date.parse(patch.task.due)-Date.parse(patch.task.start))/DAY+1)*scale)+'px';}
    };
    const clean=()=>{bar.onpointermove=bar.onpointerup=bar.onpointercancel=bar.onlostpointercapture=null;if(bar.hasPointerCapture(e.pointerId))bar.releasePointerCapture(e.pointerId);};
    bar.onpointermove=preview;bar.onpointercancel=bar.onlostpointercapture=()=>{clean();bar.style.cssText=initial;bar.querySelector('.mm-task-progress').style.width=task.progress+'%';};
    bar.onpointerup=event=>{preview(event);clean();closeDialog();run(async()=>{await this.study.change('study.mindmap.topics.update',{cardIds:[task.id],patch},set.revision);if(this.study.current?.id===setId)await this.open(mode,offset);})();};
   };
  }});
 }
 export(set){showDialog({title:'导出主题任务',html:field('format','格式','csv',{choices:[['csv','CSV · Excel 可读取'],['ics','ICS · 本地日历']]})+field('path','保存路径','mindmap-tasks.csv',{required:true})+'<p class="dialog-note">CSV 保留全部任务；日历只包含设有日期的任务。已有文件不会被覆盖。</p>',submit:'导出',onSubmit:async v=>{const result=await api('study.mindmap.tasks.export',{setId:set.id,expectedRevision:set.revision,...v});toast(`已导出 ${result.tasks} 个任务：${result.path}`);},afterOpen:()=>{$('dialog-form').elements.namedItem('format').onchange=e=>$('dialog-form').elements.namedItem('path').value='mindmap-tasks.'+e.target.value;}});}
}
