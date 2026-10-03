import {$,escape,field,showDialog,closeDialog,run,toast} from './dom.js';
import {api} from './transport.js';
const labels={source:'回源',image:'截图',edit:'编辑',preview:'Markdown',parts:'连续摘录',occlude:'图片遮挡',child:'子卡片',links:'关联',review:'复习',annotation:'标注',unmerge:'解除合并',batch:'批量',copy:'复制',submap:'子脑图','un-submap':'普通分支',split:'拆分',outdent:'提升',root:'顶层',remove:'删除'};
export class StudyTools {
  constructor(study){
    this.study=study;this.defaultColors=[...study.colors];this.defaultHex={...study.hex};
  }
  render(set){
    const colorKey=JSON.stringify(set.palette);if(this.colorKey!==colorKey){
      this.colorKey=colorKey;this.study.colors=set.palette?.length?set.palette.map(c=>[c.color,c.title]):this.defaultColors;
      this.study.hex={...set.colors,...this.defaultHex,...Object.fromEntries(this.study.colors.filter(([c])=>c.startsWith('#')).map(([c])=>[c,c]))};
      const swatches=this.study.excerpts.palette.querySelector('.study-swatches');swatches.innerHTML=this.study.colors.map(([color,label])=>`<button data-color="${escape(color)}" aria-label="标注${escape(label)}并保存" title="${escape(label)}" style="background:${this.study.hex[color]}"></button>`).join('');swatches.querySelectorAll('button').forEach(b=>b.onclick=()=>this.study.excerpts.save(b.dataset.color));
      for(const id of ['study-ink-color','card-ink-color','study-color-filter']){const select=$(id);if(!select)continue;const value=select.value;select.innerHTML=(id==='study-color-filter'?'<option value="">全部颜色</option>':'')+this.study.colors.map(([v,t])=>`<option value="${escape(v)}">${escape(t)}</option>`).join('');if(![...select.options].some(o=>o.value===value)&&value)select.add(new Option(value,value));select.value=value;}
    }
  }
  menu(){
    showDialog({title:'工具与便携样式',html:'<div class="organize-actions">'+[['save-capture','保存当前摘录工具'],['save-ink','保存当前笔刷'],['manage','重命名 / 复制 / 删除工具'],['palette','自定义颜色栏'],['menus','自定义卡片菜单'],['export','导出样式模板'],['import','导入样式模板']].map(([id,title])=>`<button type="button" data-template-action="${id}">${title}</button>`).join('')+'</div>',onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-template-action]').forEach(b=>b.onclick=run(()=>{closeDialog();return this.action(b.dataset.templateAction);}));}});
  }
  action(action){
    const set=this.study.current;
    if(action==='save-capture'||action==='save-ink'){const kind=action==='save-capture'?'capture':'ink';showDialog({title:'保存命名工具',html:field('title','名称',kind==='capture'?'我的摘录':'我的笔刷',{required:true}),onSubmit:v=>this.study.change('study.tool.save',{kind,title:v.title},set.revision)});return;}
    if(action==='palette'){showDialog({title:'自定义颜色栏',html:'<label class="dialog-field"><span>每行：名称:颜色名称 或 #RRGGBB；最多32种</span><textarea name="colors">'+escape(this.study.colors.map(([color,title])=>title+':'+color).join('\n'))+'</textarea></label>',onSubmit:v=>{const colors=v.colors.split('\n').filter(line=>line.trim()).map(line=>{const at=line.lastIndexOf(':');if(at<0)throw Error('每行需要 名称:颜色');return {title:line.slice(0,at).trim(),color:line.slice(at+1).trim()};});return this.study.change('study.palette.set',{colors},set.revision);}});return;}
    if(action==='menus'){showDialog({title:'卡片菜单顺序',html:'<label class="dialog-field"><span>优先显示的操作 ID，用逗号分隔；其余操作仍在菜单内</span><textarea name="actions">'+escape((set.menuSettings.cardActions||[]).join(', '))+'</textarea></label><p class="dialog-note">'+Object.entries(labels).map(([id,title])=>`${id} = ${title}`).join(' · ')+'</p>',onSubmit:v=>this.study.change('study.menu.set',{cardActions:v.actions.split(/[,，]/).map(t=>t.trim()).filter(Boolean)},set.revision)});return;}
    if(action==='export'||action==='import'){showDialog({title:action==='export'?'导出样式模板':'导入样式模板',html:field('path','工作区内的 JSON 路径','reader-style.json',{required:true})+'<p class="dialog-note">模板包括颜色、菜单、命名工具和排版。不包含书籍、笔记、凭据或字体文件。</p>',onSubmit:async v=>{if(action==='import')await this.study.change('study.template.import',{path:v.path},set.revision);else{const r=await api('study.template.export',{setId:set.id,expectedRevision:set.revision,path:v.path});toast('已导出 '+r.path);}}});return;}
    this.manage();
  }
  manage(){
    const set=this.study.current;showDialog({title:'管理命名工具',html:set.tools.map(t=>`<section class="layer-row"><strong>${escape(t.title)} · ${t.kind==='ink'?'笔刷':'摘录'}${t.deletedAt?'（已归档）':''}</strong><button type="button" data-tool="${t.id}" data-action="edit">重命名 / 复制</button><button type="button" data-tool="${t.id}" data-action="remove">${t.deletedAt?'恢复':'归档'}</button></section>`).join('')||'<p>先保存当前摘录工具或笔刷。</p>',onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-tool]').forEach(b=>b.onclick=run(()=>{const t=set.tools.find(t=>t.id===b.dataset.tool);closeDialog();if(b.dataset.action==='remove')return this.study.change('study.tool.remove',{toolId:t.id,restore:Boolean(t.deletedAt)},set.revision);showDialog({title:t.title,html:field('title','名称',t.title)+field('copy','保存方式','no',{choices:[['no','修改原工具'],['yes','复制为新工具']]}),onSubmit:v=>this.study.change('study.tool.save',{...(v.copy==='no'?{toolId:t.id}:{}),kind:t.kind,title:v.title,settings:t.settings},set.revision)});}));}});
  }
}
