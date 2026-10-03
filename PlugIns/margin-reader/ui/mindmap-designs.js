import {$,escape as E,run,showDialog,field,closeDialog,toast} from './dom.js';
import {api} from './transport.js';
import {mapStyle,CATALOG as C} from './mindmap-style.mjs';
import {skeletonThumbnail} from './mindmap-skeletons.mjs';
export class MindmapDesigns{
 constructor(studio){this.studio=studio;this.study=studio.study;}
 editLevels(){
  this.studio.guard();const set=this.study.current,v=mapStyle(set.map.mindmap),levels=v.levels.map(l=>({...l}));
  const row=(l,i)=>`<fieldset class="mm-level-editor"><legend>${i===0?'中心主题':i===1?'主分支':i===levels.length-1?'更深层主题':`第 ${i+1} 层`}</legend>${field('shape-'+i,'形状',l.shape,{choices:Object.entries(C.shapes)})}${field('fill-'+i,'填充',l.fill,{choices:[['solid','实色'],['soft','浅色'],['white','白底描边'],['none','透明文字']]})}${field('size-'+i,'字号增减',l.size,{type:'number'})}${field('weight-'+i,'字重',l.bold?'bold':'normal',{choices:[['normal','常规'],['bold','加粗']]})}${field('padding-'+i,'垂直留白',l.paddingY??(l.shape==='none'||l.shape==='underline'?7:12),{type:'number'})}</fieldset>`;
  showDialog({title:'主题层级设计',html:levels.map(row).join('')+'<p class="dialog-note">每级样式跟随骨架，最后一级用于更深层主题；单个主题的明确样式继续保留。</p>',onSubmit:async values=>{const next=levels.map((l,i)=>({...l,shape:values['shape-'+i],fill:values['fill-'+i],size:Number(values['size-'+i]),bold:values['weight-'+i]==='bold',paddingY:Number(values['padding-'+i])}));await this.study.change('study.mindmap.configure',{patch:{levelStyles:next}},set.revision);}});
 }
 saveCurrent(){
  this.studio.guard();const set=this.study.current;
  run(async()=>{const library=await api('study.mindmap.design.list');showDialog({title:'保存当前导图设计',html:field('title','名称',set.title+' · 设计',{required:true})+'<p class="dialog-note">保存骨架、配色和层级样式，供其他学习集复用。不包含主题文字、文档或摘录。</p>',onSubmit:async v=>{await api('study.mindmap.design.save',{setId:set.id,expectedRevision:set.revision,title:v.title,expectedVersion:library.version});toast('已保存到本地设计库');}});})();
 }
 open(){
  this.studio.guard();let library,epoch=0;
  showDialog({title:'我的导图设计',html:'<div class="mm-design-actions"><button type="button" id="mm-design-import" disabled>导入设计</button><label><input id="mm-design-archived" type="checkbox"> 显示已归档</label></div><div id="mm-design-list" class="mm-design-list"></div>',onSubmit:null,afterOpen:()=>{
   const load=async()=>{const serial=++epoch;const result=await api('study.mindmap.design.list');if(serial!==epoch||!$('mm-design-list'))return;library=result;$('mm-design-import').disabled=false;const archived=$('mm-design-archived').checked;
    $('mm-design-list').innerHTML=result.designs.filter(d=>Boolean(d.archived)===archived).map(d=>`<section class="mm-design-entry" data-design-id="${d.id}"><div class="mm-design-thumb">${skeletonThumbnail(d.settings.skeleton||'classic',d.settings,true)}</div><strong>${E(d.title)}</strong><div>${!d.archived?'<button type="button" data-design-action="apply">应用</button>':''}<button type="button" data-design-action="export">导出</button><button type="button" data-design-action="rename">重命名</button><button type="button" data-design-action="archive">${d.archived?'恢复':'归档'}</button></div></section>`).join('')||'<p class="dialog-note">这里还没有设计。先在“骨架 / 配色”中保存当前设计。</p>';
    $('mm-design-list').querySelectorAll('[data-design-action]').forEach(b=>b.onclick=run(async()=>{const id=b.closest('[data-design-id]').dataset.designId,d=library.designs.find(d=>d.id===id),action=b.dataset.designAction;
     if(action==='archive'){await api('study.mindmap.design.archive',{designId:id,expectedVersion:library.version,archived:!d.archived});return load();}
     if(action==='apply'){const set=this.study.current;const next=await api('study.mindmap.design.apply',{setId:set.id,expectedRevision:set.revision,designId:id,expectedVersion:library.version});closeDialog();this.study.render(next);await this.study.refreshList();return;}
     if(action==='rename'){const version=library.version;closeDialog();showDialog({title:'重命名设计',html:field('title','名称',d.title,{required:true}),onSubmit:async v=>{await api('study.mindmap.design.save',{designId:id,expectedVersion:version,title:v.title,settings:d.settings});toast('设计已更新');}});return;}
     closeDialog();showDialog({title:'导出导图设计',html:field('path','文库内路径','design.json',{required:true}),onSubmit:async v=>{const result=await api('study.mindmap.design.export',{designId:id,expectedVersion:library.version,path:v.path});toast('已导出 '+result.path);}});
    }));
   };
   $('mm-design-archived').onchange=run(load);$('mm-design-import').onclick=()=>this.importFile(library?.version);run(load)();
  }});
 }
 importFile(version){
  let receipt;closeDialog();
  showDialog({title:'导入导图设计',html:field('path','文库内 JSON 路径','design.json',{required:true})+'<button type="button" id="mm-design-inspect">检查设计</button><p id="mm-design-inspection" role="status">检查内容后再确认导入。</p>',submit:'确认导入',afterOpen:()=>{$('mm-design-inspect').onclick=run(async()=>{const path=$('dialog-fields').querySelector('[name=path]').value;const result=await api('study.mindmap.design.import',{path});receipt={path,...result};$('mm-design-inspection').textContent=result.document.title+' · '+(C.skeletons[result.document.settings.skeleton]?.title||'自定义层级');});},onSubmit:async values=>{if(!receipt||receipt.path!==values.path)throw Error('请先检查当前文件。');await api('study.mindmap.design.import',{path:receipt.path,expectedSourceVersion:receipt.sourceVersion,expectedVersion:version,apply:true});toast('设计已导入');}});
 }
}
