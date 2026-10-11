import { $, escape, icon, toast } from './dom.js';
import { TOOLS, TOOL_GROUPS, toolMatches, scopeReason } from './tool-catalog.mjs';

export class ToolFinder {
  constructor(study) {
    this.study = study; this.group = 'all'; this.active = 0;
    const trigger = document.createElement('button');
    trigger.id = 'tool-finder-open'; trigger.className = 'icon-button'; trigger.type = 'button';
    trigger.innerHTML = icon('search'); trigger.title = '查找工具 · ⌘ K'; trigger.setAttribute('aria-label', '查找工具');
    trigger.setAttribute('aria-haspopup', 'dialog'); trigger.onclick = () => this.open();
    document.querySelector('.top-actions').prepend(trigger);
    const dialog = document.createElement('dialog'); dialog.id = 'tool-finder'; dialog.setAttribute('aria-labelledby', 'tool-finder-title');
    dialog.innerHTML = `<header><div><small>Margin Reader</small><h2 id="tool-finder-title">查找工具与操作</h2></div><button type="button" id="tool-finder-close" aria-label="关闭工具搜索">×</button></header>
      <div class="tool-finder-search">${icon('search')}<input id="tool-finder-query" placeholder="输入操作、关键词或快捷键…" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="tool-finder-results"><kbd>Esc</kbd></div>
      <nav class="tool-finder-groups" aria-label="工具分类">${Object.entries(TOOL_GROUPS).filter(([id])=>['all','mindmap','reading','appearance'].includes(id)).map(([id,title])=>`<button type="button" data-tool-group="${id}" aria-pressed="${id==='all'}">${title}</button>`).join('')}</nav>
      <p id="tool-finder-status" role="status"></p><div id="tool-finder-results" role="listbox" aria-label="可用工具"></div><footer><span>↑ ↓ 选择 · Enter 执行</span><span>使用当前文库与原有权限</span></footer>`;
    document.body.append(dialog); this.dialog = dialog;
    $('tool-finder-query').oninput = () => { this.active=0; this.render(); };
    $('tool-finder-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { this.origin?.isConnected && this.origin.focus({preventScroll:true}); });
    dialog.querySelectorAll('[data-tool-group]').forEach(button=>button.onclick=()=>{
      this.group=button.dataset.toolGroup;this.active=0;this.render();$('tool-finder-query').focus();
    });
    dialog.addEventListener('keydown',e=>{
      if(e.isComposing)return;
      if(!['ArrowDown','ArrowUp','Home','End','Enter'].includes(e.key))return;
      if(e.target.closest('.tool-finder-groups')&&['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(e.key==='Enter'){if(this.results[this.active])this.invoke(this.results[this.active].tool);return;}
      const count=this.results.length;if(!count)return;
      this.active=e.key==='Home'?0:e.key==='End'?count-1:(this.active+(e.key==='ArrowDown'?1:-1)+count)%count;
      this.highlight(true);
    },true);
    document.addEventListener('keydown',e=>{
      if(!(e.ctrlKey||e.metaKey)||e.altKey||e.key.toLowerCase()!=='k'||e.isComposing)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(dialog.open)dialog.close();else this.open();
    },true);
  }
  context() {
    const study=this.study.current,document=this.study.getDocument();
    return {study:Boolean(study),card:study?.cards.some(c=>c.id===this.study.map.selected),document:Boolean(document),kind:document?.kind};
  }
  reason(tool) {
    if(tool.group==='mindmap'&&tool.id!=='mm-enable'&&!this.study.current?.map?.mindmap?.enabled)return '先切换到思维导图';
    const reason=scopeReason(tool.scope,this.context());if(reason)return reason;
    const target=$(tool.id);if(!target)return '当前视图没有此入口';
    if(target.disabled)return '当前状态下不可用';
    if(target.hidden)return '切换到相应视图后使用';
    return '';
  }
  open() {
    if($('dialog').open){toast('请先完成或关闭当前对话框。');return;}
    if(this.dialog.open)return;
    this.origin=document.activeElement;this.group='all';this.active=0;
    $('tool-finder-query').value='';this.render();this.dialog.showModal();$('tool-finder-query').focus();
  }
  render() {
    const query=$('tool-finder-query').value;
    this.results=TOOLS.filter(tool=>$(tool.id)&&!['mm-enable','mm-more-tools'].includes(tool.id)&&tool.group!=='review'&&toolMatches(tool,query,this.group)).map(tool=>({tool,reason:this.reason(tool)}));
    this.results.sort((a,b)=>Number(Boolean(a.reason))-Number(Boolean(b.reason)));
    this.active=Math.min(this.active,Math.max(0,this.results.length-1));
    $('tool-finder-status').textContent=`${this.results.length} 项操作 · ${this.results.filter(r=>!r.reason).length} 项当前可用`;
    const list=$('tool-finder-results');
    list.innerHTML=this.results.map(({tool,reason},index)=>`<button type="button" id="tool-option-${index}" class="tool-option" role="option" aria-selected="${index===this.active}" aria-disabled="${Boolean(reason)}" data-tool-id="${tool.id}"><span class="tool-option-symbol" data-group="${tool.group}">${icon(({reading:'book',notes:'edit',organize:'grid',links:'link',ink:'edit',review:'refresh',appearance:'sun'})[tool.group])}</span><span><strong>${escape(tool.title)}</strong><small>${escape(reason||tool.description)}</small></span><span class="tool-option-category">${TOOL_GROUPS[tool.group]}</span></button>`).join('')||'<p class="tool-finder-empty">没有匹配的工具。尝试“主题”“格式”或“外观”。</p>';
    list.querySelectorAll('[data-tool-id]').forEach(button=>button.onclick=()=>this.invoke(TOOLS.find(t=>t.id===button.dataset.toolId)));
    this.dialog.querySelectorAll('[data-tool-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.toolGroup===this.group)));
    this.highlight(false);
  }
  highlight(scroll) {
    const nodes=[...$('tool-finder-results').querySelectorAll('[role=option]')];
    nodes.forEach((node,index)=>node.setAttribute('aria-selected',String(index===this.active)));
    const selected=nodes[this.active];
    if(selected){$('tool-finder-query').setAttribute('aria-activedescendant',selected.id);if(scroll)selected.scrollIntoView({block:'nearest'});}
    else $('tool-finder-query').removeAttribute('aria-activedescendant');
  }
  invoke(tool) {
    const reason=this.reason(tool);
    if(reason){$('tool-finder-status').textContent=reason;return;}
    const target=$(tool.id);this.study.toolbar?.showAll();
    this.dialog.close();
    // Invoke the existing action after returning the focus; it retains its own
    // source/permission/version checks and confirmation dialogs.
    queueMicrotask(()=>{target.focus({preventScroll:true});target.click();});
  }
}
