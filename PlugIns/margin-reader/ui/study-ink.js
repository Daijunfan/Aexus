import { $, escape, run, toast, describeError, showDialog, field } from './dom.js';
export class StudyInk {
  constructor(study) {
    this.study=study;this.mode='off';this.busy=false;this.draft=null;
    const bar=document.createElement('div');bar.id='study-ink-tools';bar.hidden=true;
    bar.innerHTML=`<button id="study-pen" aria-pressed="false">✎ 手写</button><button id="study-lasso" aria-pressed="false">套索</button><select id="study-ink-layer" aria-label="当前手写图层"></select><button id="study-layers">图层</button><button id="study-eraser" aria-pressed="false">橡皮擦</button><select id="study-ink-color" aria-label="手写颜色">${study.colors.map(([v,t])=>`<option value="${v}" ${v==='blue'?'selected':''}>${t}</option>`).join('')}</select><select id="study-ink-width" aria-label="笔画粗细"><option value="0.002">细</option><option value="0.004" selected>中</option><option value="0.008">粗</option></select><span id="study-ink-status" role="status"></span><button id="study-ink-retry" hidden>重试保存</button><button id="study-ink-discard" hidden>放弃笔画</button>`;
    $('study-reading-bar').after(bar);
    $('study-lasso').onclick=()=>this.setMode(this.mode==='lasso'?'off':'lasso');$('study-layers').onclick=()=>this.manageLayers();$('study-ink-layer').onchange=run(()=>study.change('study.layer.update',{layerId:$('study-ink-layer').value,active:true}));
    $('study-pen').onclick=()=>this.setMode(this.mode==='pen'?'off':'pen');$('study-eraser').onclick=()=>this.setMode(this.mode==='eraser'?'off':'eraser');
    $('study-ink-retry').onclick=run(()=>this.save(this.study.current.revision));$('study-ink-discard').onclick=()=>{this.draft=null;this.status('');this.render();};
    $('reader-scroll').addEventListener('pointerdown',e=>this.start(e),true);
    this.observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches('.pdf-page,.pdf-pages')||n.querySelector('.pdf-page')))))this.render();});this.observer.observe($('reading-surface'),{childList:true,subtree:true,attributes:true,attributeFilter:['data-render-state']});
    this.resize=new ResizeObserver(()=>this.render());this.resize.observe($('reader-scroll'));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')this.setMode('off');});
  }
  get dirty(){return Boolean(this.draft)||this.busy;}
  status(message){$('study-ink-status').textContent=message;$('study-ink-retry').hidden=!this.draft||this.busy;$('study-ink-discard').hidden=!this.draft||this.busy;}
  setMode(mode){this.mode=mode;if(mode!=='off')this.study.excerpts.setRegion(false);$('study-lasso').setAttribute('aria-pressed',mode==='lasso');$('study-pen').setAttribute('aria-pressed',mode==='pen');$('study-eraser').setAttribute('aria-pressed',mode==='eraser');$('reader-scroll').classList.toggle('study-ink-mode',mode!=='off');$('reader-scroll').classList.toggle('study-erase-mode',mode==='eraser');}
  render(){
    const set=this.study.current,doc=this.study.getDocument(),active=set&&doc?.kind==='pdf'&&set.documentIds.includes(doc.id);$('study-ink-tools').hidden=!active;
    if(!active){this.setMode('off');return;}
    const layers=set.layers||[];$('study-ink-layer').innerHTML=layers.filter(l=>!l.deletedAt).map(l=>`<option value="${l.id}" ${l.locked||!l.visible?'disabled':''}>${escape(l.title)}${l.locked?' 🔒':''}</option>`).join('');$('study-ink-layer').value=set.activeLayer||'default';
    const visible=new Set(layers.filter(l=>l.visible&&!l.deletedAt).map(l=>l.id));
    for(const page of $('reading-surface').querySelectorAll('.pdf-page[data-render-state=ready]')){
      const width=page.clientWidth,height=page.clientHeight,number=Number(page.dataset.page);if(!width||!height)continue;
      const strokes=(set.ink||[]).filter(s=>s.documentId===doc.id&&s.page===number&&!s.sourceChanged&&visible.has(s.layerId||'default'));
      const pending=this.draft?.params;if(pending?.documentId===doc.id&&pending.page===number)strokes.push({...pending,id:'draft'});
      let layer=page.querySelector('.study-ink-layer');const key=JSON.stringify([width,height,strokes]);if(layer?.dataset.key===key)continue;
      if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('study-ink-layer');page.append(layer);}
      layer.dataset.key=key;layer.setAttribute('viewBox',`0 0 ${width} ${height}`);
      layer.innerHTML=strokes.map(s=>`${s.points.some(p=>p.length===3&&p[2]!==1)?s.points.slice(1).map((p,i)=>`<path data-stroke-id="${s.id}" d="M${s.points[i][0]*width},${s.points[i][1]*height} L${p[0]*width},${p[1]*height}" fill="none" stroke="${escape(set.colors[s.color])}" stroke-width="${s.width*width*(.2+.8*(p[2]??1))}" stroke-linecap="round"/>`).join(''):''}<polyline data-stroke-id="${s.id}" points="${s.points.map(p=>`${p[0]*width},${p[1]*height}`).join(' ')}" fill="none" stroke="${escape(set.colors[s.color])}" stroke-opacity="${s.points.some(p=>p.length===3&&p[2]!==1)?0:1}" stroke-width="${s.width*width}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    }
  }
  start(e){
    const page=e.target.closest('.pdf-page'),set=this.study.current,doc=this.study.getDocument();
    if(this.mode==='off'||!page||!set||doc?.kind!=='pdf'||e.button!==0)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(this.dirty){toast('请先保存或放弃上一笔。',true);return;}
    if(this.mode==='lasso'){this.lasso(e,page,set,doc);return;}
    if(this.mode==='eraser'){
      const stroke=e.target.closest('[data-stroke-id]');if(stroke&&stroke.dataset.strokeId!=='draft')run(async()=>{this.busy=true;try{await this.study.change('study.ink.remove',{strokeId:stroke.dataset.strokeId},set.revision);}finally{this.busy=false;}})();return;
    }
    const activeLayer=set.layers.find(l=>l.id===set.activeLayer);if(activeLayer?.locked||activeLayer?.visible===false){toast('请选择可见且未锁定的图层',true);return;}
    const box=page.getBoundingClientRect(),point=event=>[Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(event.clientY-box.top)/box.height)),event.pointerType==='pen'?Math.max(.05,event.pressure):1];
    const params={layerId:set.activeLayer||'default',documentId:doc.id,expectedSourceVersion:doc.sourceVersion,page:Number(page.dataset.page),points:[point(e)],color:$('study-ink-color').value,width:Number($('study-ink-width').value)};
    this.draft={setId:set.id,params,revision:set.revision};this.status('正在书写…');const capture=$('reader-scroll');capture.setPointerCapture(e.pointerId);
    const move=event=>{if(params.points.length<2048)params.points.push(point(event));this.render();};
    const stop=event=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);if(capture.hasPointerCapture(e.pointerId))capture.releasePointerCapture(e.pointerId);move(event);if(params.points.length===1)params.points.push(params.points[0]);run(()=>this.save(set.revision))();};
    const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);this.draft=null;this.status('笔画已取消');this.render();};
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
  }
  manageLayers(){
    const set=this.study.current;
    showDialog({title:'手写图层',html:set.layers.filter(l=>!l.deletedAt).map(l=>`<div class="layer-row ${l.id===set.activeLayer?'active':''}"><strong>${escape(l.title)}</strong><button type="button" data-layer="${l.id}" data-action="visible">${l.visible?'隐藏':'显示'}</button><button type="button" data-layer="${l.id}" data-action="locked">${l.locked?'解锁':'锁定'}</button><button type="button" data-layer="${l.id}" data-action="edit">编辑</button></div>`).join('')+field('title','新图层名称',''),submit:'新建图层',onSubmit:v=>this.study.change('study.layer.create',{title:v.title},set.revision),afterOpen:()=>{
      $('dialog-fields').querySelectorAll('[data-layer]').forEach(b=>b.onclick=run(async()=>{const l=set.layers.find(l=>l.id===b.dataset.layer),action=b.dataset.action;
       if(action==='edit'){$('dialog-cancel').click();showDialog({title:'编辑图层',html:field('title','名称',l.title)+field('merge','合并到','',{choices:[['','不合并'],...set.layers.filter(t=>t.id!==l.id&&!t.deletedAt&&!t.locked).map(t=>[t.id,t.title])]})+field('remove','删除此图层','no',{choices:[['no','保留'],['yes','删除（可撤销）']]}),onSubmit:v=>v.remove==='yes'?this.study.change('study.layer.remove',{layerId:l.id},set.revision):v.merge?this.study.change('study.layer.merge',{layerId:l.id,targetId:v.merge},set.revision):this.study.change('study.layer.update',{layerId:l.id,title:v.title},set.revision)});}
       else{await this.study.change('study.layer.update',{layerId:l.id,[action]:!l[action]},set.revision);$('dialog-cancel').click();this.manageLayers();}
      }));
    }});
  }
  lasso(e,page,set,doc){
    const box=page.getBoundingClientRect(),point=ev=>[Math.max(0,Math.min(1,(ev.clientX-box.left)/box.width)),Math.max(0,Math.min(1,(ev.clientY-box.top)/box.height))],points=[point(e)];
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('study-ink-layer');svg.style.zIndex='9';svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');page.append(svg);const capture=$('reader-scroll');capture.setPointerCapture(e.pointerId);
    const move=ev=>{points.push(point(ev));svg.innerHTML=`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="#4b91ed22" stroke="#4b91ed" stroke-width=".002"/>`;};
    const stop=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);svg.remove();const inside=p=>{let yes=false;for(let i=0,j=points.length-1;i<points.length;j=i++)if((points[i][1]>p[1])!==(points[j][1]>p[1])&&p[0]<(points[j][0]-points[i][0])*(p[1]-points[i][1])/(points[j][1]-points[i][1])+points[i][0])yes=!yes;return yes;};
      const selected=(set.ink||[]).filter(s=>s.documentId===doc.id&&s.page===Number(page.dataset.page)&&!s.sourceChanged&&set.layers.some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.locked&&!l.deletedAt)&&s.points.some(inside));
      if(!selected.length){toast('没有选中笔迹');return;}
      showDialog({title:`调整 ${selected.length} 条笔迹`,html:field('dx','水平移动（页面宽度 %）',0,{type:'number',min:-100,max:100})+field('dy','垂直移动（页面高度 %）',0,{type:'number',min:-100,max:100})+field('color','颜色','',{choices:[['','保持原色'],...this.study.colors]})+field('layerId','移动到图层','',{choices:[['','保持原图层'],...set.layers.filter(l=>!l.deletedAt&&!l.locked).map(l=>[l.id,l.title])]}),onSubmit:v=>this.study.change('study.ink.transform',{strokeIds:selected.map(s=>s.id),dx:Number(v.dx)/100,dy:Number(v.dy)/100,...(v.color?{color:v.color}:{}),...(v.layerId?{layerId:v.layerId}:{})},set.revision)});
    };
    const cancel=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',cancel);svg.remove();};document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',cancel,{once:true});
  }
  async save(revision){
    const draft=this.draft;if(!draft||this.busy||draft.setId!==this.study.current?.id)return;
    this.busy=true;this.status('正在保存…');
    try{await this.study.change('study.ink.add',draft.params,revision);this.draft=null;this.status('已保存');}
    catch(e){this.status(describeError(e));}
    finally{this.busy=false;this.status($('study-ink-status').textContent);this.render();}
  }
}
