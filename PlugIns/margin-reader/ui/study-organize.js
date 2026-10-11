import { $, escape, field, showDialog, run, toast } from './dom.js';
import { api } from './transport.js';
const tags = value => value.split(/[,，]/).map(t=>t.trim()).filter(Boolean);
const styles=[['tree0','树形 · 曲线'],['tree1','树形 · 直角'],['tree2','树形 · 向下'],['tree3','树形 · 向左'],['tree4','树形 · 向上'],['line0','时间线 · 横向'],['line1','时间线 · 纵向'],['line2','时间线 · 折行'],['both','双向分支'],['frame','框架网格']];
const yn=[['','保持不变'],['yes','是'],['no','否']];
export class StudyOrganization {
  constructor(study) {
    this.study=study;this.map=study.map;
    const tools=document.createElement('div');tools.className='study-organization-tools';
    tools.innerHTML='<select id="study-submap-selector" aria-label="脑图层级"><option value="">主脑图</option></select>';
    this.map.board.querySelector('.study-map-toolbar').after(tools);
    $('study-submap-selector').onchange=run(()=>study.change('study.submap.open',{cardId:$('study-submap-selector').value||null}));
    this.map.board.addEventListener('click',e=>{
      const card=e.target.closest('[data-card-id]');if(!card||e.target.closest('button'))return;
      if(e.metaKey||e.ctrlKey){e.preventDefault();e.stopImmediatePropagation();const id=card.dataset.cardId;const multi=this.study.advanced.selected;multi.has(id)?multi.delete(id):multi.add(id);this.study.advanced.selection();this.paintListSelection();}
    },true);
  }
  ids(){const existing=new Set(this.study.current.cards.map(c=>c.id));const ids=[...this.study.advanced.selected].filter(id=>existing.has(id));return ids.length?ids:this.map.selected&&existing.has(this.map.selected)?[this.map.selected]:[];}
  paintListSelection(){const ids=new Set(this.ids());this.map.board.querySelectorAll('.study-list-card').forEach(el=>el.classList.toggle('selected',ids.has(el.dataset.cardId)));}
  render(set){
    const select=$('study-submap-selector');select.innerHTML='<option value="">主脑图</option>'+set.submaps.map(s=>`<option value="${s.id}">${escape(s.title)}</option>`).join('');select.value=set.map?.submapId||'';
    select.hidden=!set.submaps?.length;this.paintListSelection();
  }
  requireSelection(){const ids=this.ids();if(!ids.length)throw new Error('先选择卡片。Shift / Command 点击可多选。');return ids;}
  actions(){
    const items=[['batch','批量颜色 / 标签 / 收藏'],['copy','复制卡片 / 整个分支'],['toc','按原文目录整理'],['document','按文档整理'],['sort','排序当前同级卡片'],['submap','将选中分支转为子脑图'],['new-submap','新建空白子脑图'],['summary','跨分支概要（保留原层级）'],['split','拆分长文本卡片'],['all','选择全部'],['none','取消选择']];
    showDialog({title:'卡片整理',html:`<p class="dialog-note">当前选择 ${this.ids().length} 张。批量写入会检查版本，不会覆盖其他窗口的新修改。</p><div class="organize-actions">${items.map(([id,text])=>`<button type="button" data-organize="${id}">${text}</button>`).join('')}</div>`,onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-organize]').forEach(b=>b.onclick=run(async()=>{$('dialog-cancel').click();return this.action(b.dataset.organize);}));}});
  }
  async action(action,card){
    if(card){this.study.advanced.selected.clear();this.map.select(card.id);}
    if(action==='all'){this.study.current.cards.forEach(c=>this.study.advanced.selected.add(c.id));this.study.advanced.selection();this.render(this.study.current);return;}
    if(action==='none'){this.study.advanced.selected.clear();this.map.selected=null;this.study.advanced.selection();this.render(this.study.current);return;}
    if(action==='batch')return this.batch();if(action==='copy')return this.copy();if(action==='split')return this.split();
    if(action==='sort')return this.sort();if(action==='new-submap')return this.newSubmap();
    const ids=this.requireSelection(),set=this.study.current;
    if(action==='submap'){assertOne(ids);return this.study.change('study.submap.configure',{cardId:ids[0],enabled:true,open:true},set.revision);}
    if(action==='un-submap'){assertOne(ids);return this.study.change('study.submap.configure',{cardId:ids[0],enabled:false},set.revision);}
    if(action==='summary')return this.study.advanced.combine('summary');
    if(['toc','document'].includes(action))return this.study.change('study.cards.organize',{cardIds:ids,by:action},set.revision);
  }
  batch(){
    const cardIds=this.requireSelection(),revision=this.study.current.revision;
    showDialog({title:`批量编辑 ${cardIds.length} 张卡片`,html:field('color','颜色（名称或 #RRGGBB；留空保持）','')+field('addTags','添加标签（逗号分隔）','')+field('removeTags','移除标签（逗号分隔）','')+field('favorite','收藏','',{choices:yn})+field('inMap','加入脑图','',{choices:yn})+field('collapsed','折叠子节点','',{choices:yn})+field('annotationVisible','显示原文标注','',{choices:yn})+field('descendants','包含全部子卡片','no',{choices:[['no','仅选中卡片'],['yes','包含子树']]}),onSubmit:async v=>{const patch={};if(v.color.trim())patch.color=v.color.trim();for(const k of ['addTags','removeTags'])if(v[k].trim())patch[k]=tags(v[k]);for(const k of ['favorite','inMap','collapsed','annotationVisible'])if(v[k])patch[k]=v[k]==='yes';if(!Object.keys(patch).length)throw new Error('至少修改一项。');await this.study.change('study.cards.batch',{cardIds,descendants:v.descendants==='yes',patch},revision);}});
  }
  async copy(){
    const set=this.study.current,cardIds=this.requireSelection(),listing=await api('study.list');
    showDialog({title:'复制卡片与分支',html:field('target','目标学习集',set.id,{choices:listing.sets.map(s=>[s.id,s.title])})+field('descendants','子卡片','yes',{choices:[['yes','完整分支'],['no','仅选中的卡片']]})+'<p class="dialog-note">新卡片有独立 ID；原始图片、来源和笔记保留。新副本默认暂停复习，不重复继承复习日志。</p>',submit:'复制',onSubmit:async v=>{const destination=listing.sets.find(s=>s.id===v.target);const result=await this.study.change('study.cards.copy',{cardIds,targetSetId:destination.id,targetRevision:destination.revision,descendants:v.descendants==='yes'},set.revision);toast(`已复制 ${result.lastCopy.cardIds.length} 张卡片。`);}});
  }
  sort(){
    const set=this.study.current,card=set.cards.find(c=>c.id===this.map.selected);
    showDialog({title:'排序同级卡片',html:field('by','顺序','source',{choices:[['source','原文页码 / 章节'],['title','标题'],['created','创建日期'],['updated','修改日期'],['color','颜色']]})+field('direction','方向','asc',{choices:[['asc','正序'],['desc','倒序']]}),onSubmit:v=>this.study.change('study.cards.sort',{...v,...(card?.parentId?{parentId:card.parentId}:{})},set.revision)});
  }
  newSubmap(){const set=this.study.current;showDialog({title:'新建空白子脑图',html:field('title','标题','',{required:true}),onSubmit:async v=>{const next=await this.study.change('study.note.create',{title:v.title,submap:true,...(set.map?.submapId?{parentId:set.map.submapId}:{})},set.revision);const created=next.cards.find(c=>!set.cards.some(old=>old.id===c.id));await this.study.change('study.submap.open',{cardId:created.id},next.revision);}});}
  split(){
    const ids=this.requireSelection();assertOne(ids);const set=this.study.current,card=set.cards.find(c=>c.id===ids[0]),text=card.editedText??card.text;
    showDialog({title:'拆分文本为子卡片',html:field('separator','按此文本分隔（默认空行）','\\n\\n')+'<p class="dialog-note">原卡片与原文快照保留。拆出的卡片放在原卡片下，摘录子卡片保留回源引用。</p>',submit:'拆分',onSubmit:v=>{const needle=v.separator.replaceAll('\\n','\n');if(!needle)throw new Error('分隔符不能为空。');const offsets=[];let at=text.indexOf(needle);while(at>=0&&offsets.length<100){offsets.push(at+needle.length);at=text.indexOf(needle,at+needle.length);}const valid=offsets.filter(n=>n>0&&n<text.length);if(!valid.length)throw new Error('没有找到内部拆分位置。');return this.study.change('study.card.split',{cardId:card.id,offsets:valid},set.revision);}});
  }
  captureSettings(){
    const set=this.study.current,p=set.captureSettings||{};
    showDialog({title:'摘录自动化',html:field('inMap','自动加入脑图',p.inMap===false?'no':'yes',{choices:[['yes','加入脑图'],['no','仅保留原文标注，暂不显示在脑图']]})+field('organize','自动归档',p.organize||'none',{choices:[['none','指定位置 / 顶层'],['document','按来源文档'],['toc','按原文目录']]})+field('parentId','指定父卡片',p.parentId||'',{choices:[['','顶层'],...set.cards.map(c=>[c.id,c.title])]})+field('color','默认颜色',p.color||'yellow',{choices:this.study.colors})+field('tags','自动标签',(p.tags||[]).join(', '))+field('annotationStyle','标注样式',p.annotationStyle||'highlight',{choices:[['highlight','高亮'],['underline','下划线'],['strike','删除线'],['box','框线']]}),onSubmit:v=>this.study.change('study.capture.settings',{inMap:v.inMap==='yes',organize:v.organize,parentId:v.parentId||null,color:v.color,tags:tags(v.tags),annotationStyle:v.annotationStyle},set.revision)});
  }
  async appearance(){
    const set=this.study.current,s=set.appearance||{};const available=await api('system.fonts');const fontChoices=[['system','系统字体'],['serif','衬线字体'],['mono','等宽字体'],...available.fonts.map(name=>[name,name])];
    showDialog({title:'脑图与卡片样式',html:field('scope','修改范围','all',{choices:[['all','此学习集默认样式'],['selection','仅选中卡片']]})+field('branchStyle','分支排布',set.map?.branchStyle||'tree0',{choices:styles})+field('fontFamily','字体',s.fontFamily||'system',{choices:fontChoices})+field('fontSize','正文字号',s.fontSize||13,{type:'number'})+field('width','卡片宽度',s.width||236,{type:'number'})+field('height','卡片高度',s.height||226,{type:'number'})+field('background','卡片背景',s.background||'#ffffff',{type:'color'})+field('titleOnly','只显示标题',s.titleOnly?'yes':'no',{choices:[['no','显示全卡'],['yes','仅标题']]})+field('uppercase','标题大写',s.uppercase?'yes':'no',{choices:[['no','保留原样'],['yes','大写显示']]})+field('showLinks','显示链接数量',s.showLinks?'yes':'no',{choices:[['no','隐藏'],['yes','显示']]})+field('compact','紧凑宽度',s.compact?'yes':'no',{choices:[['no','使用设定宽度'],['yes','紧凑排列']]})+field('fontScale','字体缩放',s.fontScale||1,{type:'number',min:.5,max:2,step:'any'})+field('mapBackground','画布背景',s.mapBackground||'#f7f8fa',{type:'color'})+field('inkBehind','画布手写层',s.inkBehind?'yes':'no',{choices:[['no','在卡片上层'],['yes','在卡片下层']]})+field('paper','画布纸张',s.paper||'dots',{choices:[['dots','点阵'],['grid','方格'],['lined','横线'],['plain','空白']]}),onSubmit:v=>{const style={fontFamily:v.fontFamily,fontSize:Number(v.fontSize),width:Number(v.width),height:Number(v.height),background:v.background,titleOnly:v.titleOnly==='yes',uppercase:v.uppercase==='yes',showLinks:v.showLinks==='yes',compact:v.compact==='yes',fontScale:Number(v.fontScale)};return v.scope==='selection'?this.study.change('study.cards.batch',{cardIds:this.requireSelection(),patch:{style:{...style,branchStyle:v.branchStyle}}},set.revision):this.study.change('study.appearance.set',{cardStyle:style,branchStyle:v.branchStyle,paper:v.paper,background:v.mapBackground,inkBehind:v.inkBehind==='yes'},set.revision);}});
  }
  boards(){return this.study.boards.open();}
  openBoard(board){return this.study.boards.open(board);}
}
function assertOne(ids){if(ids.length!==1)throw new Error('此操作需要恰好选择一张卡片。');}
