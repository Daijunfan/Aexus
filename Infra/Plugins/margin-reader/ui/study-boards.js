import { $, escape, field, showDialog, closeDialog, run, toast } from './dom.js';
import { api } from './transport.js';
const words=value=>String(value||'').split(/[,，]/).map(v=>v.trim()).filter(Boolean);
const flags=[['','全部'],['yes','是'],['no','否']];
const groups=[['','不分组'],['study','学习集'],['color','颜色'],['tag','标签'],['keyword','标题词条'],['document','来源文档'],['chapter','章节'],['created','创建日期'],['updated','修改日期'],['kind','摘录 / 笔记'],['inMap','脑图状态']];
const keyOf=card=>card.ownerSetId+'/'+card.id;
export class StudyBoards {
  constructor(study){
    this.study=study;
    const button=document.createElement('button');button.id='workspace-card-box';button.className='workspace-card-box';button.textContent='全库卡片盒';
    button.title='跨学习集分组、筛选与批量编辑；范围限于当前文库';
    $('study-set-list').before(button);button.onclick=run(()=>this.open(null,true));
  }
  async open(board,global=false,initialFilter={}){
    const ownerId=this.study.current?.id||null;
    const owner=ownerId?await api('study.get',{setId:ownerId}):null,listing=await api('study.list'),selected=new Map();
    if((this.study.current?.id||null)!==ownerId)return;
    if(board?.id)board=owner?.boards?.find(b=>b.id===board.id)||null;
    let offset=0,nextOffset=null,serial=0,last=null,scope=global||!owner?'workspace':'current';
    const f=board?.filter||initialFilter;
    const formField=(name)=>$('dialog-fields').querySelector(`[name="${name}"]`);
    const html=field('scope','卡片来源',scope,{choices:[...(owner?[['current','当前学习集 · '+owner.title]]:[]),['workspace','当前文库全部学习集'],...listing.sets.filter(s=>s.id!==owner?.id).map(s=>[s.id,s.title])]})+
      (owner?field('boardId','保存的看板',board?.id||'',{choices:[['','新建筛选'],...(owner.boards||[]).map(b=>[b.id,b.title])]})+field('title','看板名称',board?.title||'新看板'):'')+
      '<div class="board-filter-grid">'+field('query','文字',f.query||'')+field('titleKeyword','精确标题词条',f.titleKeyword||'',{help:'按分号别名完整匹配，不匹配正文中的同名词。'})+field('tags','标签（逗号分隔）',(f.tags||[]).join(', '))+
      field('tagMode','标签组合',f.tagMode||'all',{choices:[['all','全部满足（交集）'],['any','任一满足（并集）']]})+
      field('colors','颜色（名称或 #RRGGBB，逗号分隔）',(f.colors||[]).join(', '))+
      field('kind','类型',f.kind||'',{choices:[['','全部'],['excerpt','文档摘录'],['note','独立笔记']]})+
      ['inMap','favorite','reviewEnabled','hasImage'].map((k,i)=>field(k,['已在脑图','收藏','已加入复习','包含图片'][i],f[k]===undefined?'':f[k]?'yes':'no',{choices:flags})).join('')+
      field('createdAfter','创建时间起点',f.createdAfter||'')+field('createdBefore','创建时间终点',f.createdBefore||'')+
      field('documentIds','来源文档 ID（逗号分隔，留空为全部）',(f.documentIds||[]).join(', '))+
      field('group1','一级分组',board?.groupBy?.[0]||'',{choices:groups})+field('group2','二级分组',board?.groupBy?.[1]||'',{choices:groups})+
      field('sort','排序',board?.sort||'outline',{choices:[['outline','脑图顺序'],['title','标题'],['source','原文位置'],['created','创建时间'],['updated','修改时间'],['color','颜色']]})+
      field('direction','方向','asc',{choices:[['asc','正序'],['desc','倒序']]})+'</div>'+
      '<details class="board-advanced"><summary>组合筛选（AND / OR / NOT）</summary><label class="dialog-field"><span>附加 JSON 条件；与上方条件取交集</span><textarea name="compound" placeholder=\'{"any":[{"tags":["重点"]},{"favorite":true}]}\'></textarea></label></details>'+
      '<div class="board-actions"><button type="button" id="board-search">应用筛选</button><button type="button" id="board-select-page">选择本页</button><button type="button" id="board-select-all">选择全部结果</button><button type="button" id="board-clear">清除选择</button><button type="button" id="board-batch">批量编辑</button></div>'+
      '<div class="board-actions"><button type="button" id="board-prev">上一页</button><button type="button" id="board-next">下一页</button><button type="button" id="board-map">从已保存看板生成脑图</button><button type="button" id="board-remove">删除看板定义</button></div><p id="board-status" role="status"></p><p id="board-selected" role="status"></p><div id="board-results"></div>';
    const values=()=>Object.fromEntries(new FormData($('dialog-form')));
    const criteria=v=>{
      const filter={};if(v.query)filter.query=v.query;if(v.titleKeyword.trim())filter.titleKeyword=v.titleKeyword.trim();
      for(const k of ['tags','colors','documentIds'])if(words(v[k]).length)filter[k]=words(v[k]);
      if(filter.tags)filter.tagMode=v.tagMode;
      if(v.kind)filter.kind=v.kind;
      for(const k of ['inMap','favorite','reviewEnabled','hasImage'])if(v[k])filter[k]=v[k]==='yes';
      for(const k of ['createdAfter','createdBefore'])if(v[k])filter[k]=v[k];
      if(v.compound?.trim()){
        let extra;try{extra=JSON.parse(v.compound);}catch{throw Error('组合筛选需要合法 JSON 对象。');}
        return {all:[filter,extra]};
      }
      return filter;
    };
    const options=v=>({filter:criteria(v),groupBy:[v.group1,v.group2].filter(Boolean),sort:v.sort,direction:v.direction});
    const selectedStatus=()=>{
      if(!$('board-selected'))return;
      $('board-selected').textContent=`已选择 ${selected.size} 张卡片`;$('board-batch').disabled=!selected.size;
      for(const input of $('board-results').querySelectorAll('[data-board-check]'))input.checked=selected.has(input.dataset.boardCheck);
    };
    const load=async(reset=false)=>{
      if(reset){offset=0;selected.clear();}
      const ticket=++serial,v=values(),args=options(v);scope=v.scope;
      const local=scope==='current'&&!args.groupBy.includes('study');
      const data=local?await api('study.board.query',{setId:owner.id,...args,offset,limit:100}):await api('study.workspace.query',{...args,...(scope==='workspace'?{}:{setIds:[scope==='current'?owner.id:scope]}),offset,limit:100});
      if(ticket!==serial||!$('board-results'))return;
      data.cards=data.cards.map(c=>({...c,ownerSetId:c.ownerSetId||owner?.id,ownerSetTitle:c.ownerSetTitle||owner?.title,ownerRevision:c.ownerRevision||data.revision}));
      last=data;nextOffset=data.nextOffset;
      $('board-status').textContent=`${data.total} 张卡片 · 当前 ${data.cards.length?offset+1:0}–${offset+data.cards.length}`;
      $('board-prev').disabled=offset===0;$('board-next').disabled=nextOffset===null;
      $('board-map').disabled=!board||scope!=='current';$('board-remove').disabled=!board||scope!=='current';
      const cards=new Map(data.cards.map(c=>[local?c.id:keyOf(c),c]));
      const row=c=>`<article class="board-card" data-board-owner="${c.ownerSetId}"><label><input type="checkbox" data-board-check="${keyOf(c)}" aria-label="选择 ${escape(c.title)}"><span class="board-dot" style="background:${escape(c.color.startsWith('#')?c.color:this.study.hex[c.color]||'#999')}"></span></label><button type="button" data-board-card="${keyOf(c)}"><strong>${escape(c.title)}</strong><small>${escape(c.ownerSetTitle)} · ${escape(c.sourcePath||'独立笔记')}</small></button><button type="button" data-board-edit="${keyOf(c)}" aria-label="编辑 ${escape(c.title)}">编辑</button></article>`;
      const render=(items,depth=0)=>items.map(item=>{
        if(typeof item==='string')return cards.has(item)?row(cards.get(item)):'';
        const children=render(item.children,depth+1);return children?`<section class="board-group" data-group-depth="${depth}"><h3>${escape(item.key)} <small>${item.count} 张</small></h3>${children}</section>`:'';
      }).join('');
      $('board-results').innerHTML=(args.groupBy.length?render(data.groups):data.cards.map(row).join(''))||'<p>没有匹配卡片</p>';
      $('board-results').querySelectorAll('[data-board-check]').forEach(input=>input.onchange=()=>{
        const c=data.cards.find(c=>keyOf(c)===input.dataset.boardCheck);input.checked?selected.set(keyOf(c),c):selected.delete(keyOf(c));selectedStatus();
      });
      $('board-results').querySelectorAll('[data-board-card]').forEach(b=>b.onclick=run(()=>this.openCard(data.cards.find(c=>keyOf(c)===b.dataset.boardCard))));
      $('board-results').querySelectorAll('[data-board-edit]').forEach(b=>b.onclick=run(()=>this.openCard(data.cards.find(c=>keyOf(c)===b.dataset.boardEdit),true)));
      selectedStatus();
    };
    showDialog({title:global?'全库卡片盒':'分组筛选看板',html,submit:'保存当前学习集看板',onSubmit:owner?async v=>{
      if(v.scope!=='current'||[v.group1,v.group2].includes('study'))throw Error('跨学习集结果可批量编辑；保存命名看板请切换为当前学习集。');
      const opts=options(v);await this.study.change('study.board.save',{...(board?{boardId:board.id}:{}),title:v.title,filter:opts.filter,groupBy:opts.groupBy,sort:opts.sort},owner.revision);
    }:null,afterOpen:()=>{
      const syncKeyword=()=>{const disabled=formField('scope').value==='current'&&owner?.linkSettings?.titleLinks===false;for(const name of ['group1','group2']){const control=formField(name),option=control.querySelector('option[value=keyword]');option.disabled=disabled;if(disabled&&control.value==='keyword')control.value='';}};syncKeyword();formField('scope').addEventListener('change',syncKeyword);
      if(board?.filter&&(board.filter.any||board.filter.all||board.filter.not))formField('compound').value=JSON.stringify(board.filter);
      const clearAndLoad=run(()=>load(true));$('board-search').onclick=clearAndLoad;formField('scope').onchange=clearAndLoad;
      if(owner)formField('boardId').onchange=()=>{const chosen=owner.boards.find(b=>b.id===formField('boardId').value);closeDialog();run(()=>this.open(chosen))();};
      $('board-prev').onclick=run(()=>{offset=Math.max(0,offset-100);return load();});$('board-next').onclick=run(()=>{if(nextOffset!==null)offset=nextOffset;return load();});
      $('board-clear').onclick=()=>{selected.clear();selectedStatus();};
      $('board-select-page').onclick=()=>{for(const card of last?.cards||[])selected.set(keyOf(card),card);selectedStatus();};
      $('board-select-all').onclick=run(async()=>{
        const v=values(),opts=options(v);let next=0;selected.clear();
        do{
          const data=await api('study.workspace.query',{...opts,...(v.scope==='workspace'?{}:{setIds:[v.scope==='current'?owner.id:v.scope]}),offset:next,limit:500});
          if(!data.cards.length&&data.nextOffset!==null)throw Error('结果正在变化，请重新筛选。');
          if(selected.size+data.cards.length>10000)throw Error('单次批量操作最多 10000 张，请缩小筛选范围。');
          for(const card of data.cards)selected.set(keyOf(card),card);next=data.nextOffset;
        }while(next!==null);
        selectedStatus();
      });
      $('board-batch').onclick=()=>{const cards=[...selected.values()];if(!cards.length)return;closeDialog();this.batch(cards);};
      $('board-map').onclick=run(async()=>{await this.study.change('study.board.materialize',{boardId:board.id},owner.revision);closeDialog();});
      $('board-remove').onclick=run(async()=>{await this.study.change('study.board.remove',{boardId:board.id},owner.revision);closeDialog();toast('看板定义已移除，卡片保留；可撤销。');});
      run(()=>load())();
    }});
  }
  async openCard(card,edit=false){
    closeDialog();if(this.study.current?.id!==card.ownerSetId)await this.study.home(card.ownerSetId);
    const fresh=this.study.current.cards.find(c=>c.id===card.id);if(!fresh)throw Error('卡片已被移除，请重新查询。');
    if(edit)this.study.map.edit(fresh);else await this.study.activateCard(fresh);
  }
  batch(cards){
    const revisions={};for(const c of cards){if(revisions[c.ownerSetId]&&revisions[c.ownerSetId]!==c.ownerRevision){toast('选中的结果来自不同版本，请重新筛选。',true);return;}revisions[c.ownerSetId]=c.ownerRevision;}
    showDialog({title:`批量编辑 ${cards.length} 张卡片 · ${Object.keys(revisions).length} 个学习集`,html:field('color','颜色（留空保持）')+field('addTags','添加标签（逗号分隔）')+field('removeTags','移除标签（逗号分隔）')+
      field('favorite','收藏','',{choices:[['','保持'],['yes','收藏'],['no','取消收藏']]})+field('annotationVisible','原文标注','',{choices:[['','保持'],['yes','显示'],['no','取消标注并保留卡片']]})+
      '<p class="dialog-note">所有选中学习集一起检查版本。任何冲突会取消整次修改，不会只写入部分卡片。</p>',onSubmit:async v=>{
      const patch={};if(v.color.trim())patch.color=v.color.trim();for(const k of ['addTags','removeTags'])if(words(v[k]).length)patch[k]=words(v[k]);for(const k of ['favorite','annotationVisible'])if(v[k])patch[k]=v[k]==='yes';
      if(!Object.keys(patch).length)throw Error('至少修改一项。');
      await api('study.workspace.batch',{targets:cards.map(c=>({setId:c.ownerSetId,cardId:c.id})),expectedRevisions:revisions,patch});await this.study.refresh();toast(`已更新 ${cards.length} 张卡片。`);
    }});
  }
}
