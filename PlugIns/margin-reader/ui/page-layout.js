import {$,escape,field,showDialog,closeDialog,run,toast} from './dom.js';
import {api} from './transport.js';
export class PageLayout {
  constructor(tools){
    this.tools=tools;
    const button=document.createElement('button');button.id='reader-layout';button.textContent='折页 / 留白';
    $('reader-page-tools').after(button);button.onclick=run(()=>this.open());
  }
  async refresh(){await this.tools.openDocument(this.tools.getDocument().path);}
  async open(){
    const doc=this.tools.getDocument();if(doc?.kind!=='pdf')return;
    const data=await api('document.region.list',{id:doc.id}),chapter=doc.toc.filter(n=>!n.unresolved);
    const rows=data.regions.map(r=>`<div class="fold-row"><span>第 ${r.page} 页 · ${Math.round(r.start*100)}–${Math.round(r.end*100)}% ${r.sourceChanged?'· 来源已变化':''}</span><button type="button" data-fold="${r.id}">${r.folded?'展开':'折叠'}</button><button type="button" data-remove-fold="${r.id}">移除</button></div>`).join('');
    const html=rows+field('page','页码',doc.position.page,{type:'number',min:1,max:doc.pageCount})+field('start','上边界（原页 %）',10,{type:'number',min:0,max:99.9})+field('end','下边界（原页 %）',30,{type:'number',min:.1,max:100})+
      '<div class="page-layout-actions"><button type="button" id="layout-undo">撤销折页</button><button type="button" id="layout-redo">重做</button><button type="button" id="layout-note">在当前位置添加留白</button></div>'+
      (chapter.length?field('chapter','按目录操作',chapter[0].id,{choices:chapter.map(c=>[c.id,c.title])})+'<button type="button" id="layout-fold-chapter">折叠此章节</button><button type="button" id="layout-unfold-chapter">展开此章节</button>':'')+
      '<p class="dialog-note">折去的片段不参与新摘录，已有标注和笔迹保留原页坐标。点击折叠线可展开；单击摘录卡片会先展开其目标。</p>';
    const change=async(method,params)=>{await api(method,{id:doc.id,expectedRevision:data.revision,...params});closeDialog();await this.refresh();};
    showDialog({title:'页内折叠与留白',html,submit:'折叠指定区域',onSubmit:async v=>{await api('document.region.set',{id:doc.id,expectedRevision:data.revision,page:Number(v.page),start:Number(v.start)/100,end:Number(v.end)/100});await this.refresh();},afterOpen:()=>{
      for(const name of ['start','end'])$('dialog-fields').querySelector(`[name=${name}]`).step='.1';
      $('layout-undo').disabled=!data.history.canUndo;$('layout-redo').disabled=!data.history.canRedo;
      $('layout-undo').onclick=run(()=>change('document.layout.undo',{}));$('layout-redo').onclick=run(()=>change('document.layout.redo',{}));
      $('layout-note').onclick=run(async()=>{closeDialog();const study=this.tools.getStudy();await study.ensureNotes();study.advanced.extend();});
      $('dialog-fields').querySelectorAll('[data-fold]').forEach(b=>b.onclick=run(()=>change('document.region.set',{regionId:b.dataset.fold,folded:!data.regions.find(r=>r.id===b.dataset.fold).folded})));
      $('dialog-fields').querySelectorAll('[data-remove-fold]').forEach(b=>b.onclick=run(()=>change('document.region.remove',{regionId:b.dataset.removeFold})));
      if(chapter.length)for(const [id,folded] of [['layout-fold-chapter',true],['layout-unfold-chapter',false]])$(id).onclick=run(()=>change('document.fold.chapters',{nodeIds:[$('dialog-fields').querySelector('[name=chapter]').value],folded}));
    }});
  }
}
