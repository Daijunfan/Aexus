import { $, escape, field, showDialog, closeDialog, run } from './dom.js';
import { api } from './transport.js';
export class Bookmarks {
  constructor(options) {
    Object.assign(this, options);
    const button=document.createElement('button');button.id='reader-bookmarks';button.className='icon-button';button.textContent='☆';button.title='书签';button.setAttribute('aria-label','文档书签');
    $('search-document').before(button);button.onclick=run(()=>this.open());
  }
  async open() {
    const doc=this.getDocument();if(!doc)return;
    const data=await api('bookmark.list',{id:doc.id,includeTrashed:true}),locator=this.getLocator(),position=doc.kind==='media'?`${locator.time.toFixed(1)} 秒`:doc.kind==='pdf'?`第 ${locator.page} 页`:`第 ${locator.section+1} 节`;
    showDialog({title:'书签',html:`<div class="bookmark-list">${data.bookmarks.map(b=>`<div class="bookmark-row ${b.deletedAt?'removed':''}"><button type="button" data-bookmark="${b.id}" ${b.deletedAt||b.unresolved||data.sourceChanged?'disabled':''}>☆ ${escape(b.title)}<small>${b.locator.time!==undefined?`${b.locator.time.toFixed(1)} 秒`:b.locator.page?`第 ${b.locator.page} 页`:`第 ${b.locator.section+1} 节`}${b.unresolved||data.sourceChanged?' · 原文已变化':''}${b.deletedAt?' · 已删除':''}</small></button><button type="button" data-rename="${b.id}" ${b.deletedAt?'hidden':''}>重命名</button><button type="button" data-toggle="${b.id}">${b.deletedAt?'恢复':'删除'}</button></div>`).join('')||'<p class="dialog-note">还没有书签</p>'}</div>`+field('title','将当前位置加入书签',position,{required:true}),submit:'添加书签',onSubmit:async v=>{await api('bookmark.add',{id:doc.id,expectedRevision:data.revision,title:v.title,locator});await this.changed();},afterOpen:()=>{
      $('dialog-fields').querySelectorAll('[data-bookmark]').forEach(b=>b.onclick=run(async()=>{const target=data.bookmarks.find(n=>n.id===b.dataset.bookmark);closeDialog();await this.navigate(target.locator);}));
      $('dialog-fields').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=run(async()=>{const item=data.bookmarks.find(n=>n.id===b.dataset.toggle);await api('bookmark.update',{id:doc.id,expectedRevision:data.revision,bookmarkId:item.id,deleted:!item.deletedAt});closeDialog();await this.changed();await this.open();}));
      $('dialog-fields').querySelectorAll('[data-rename]').forEach(b=>b.onclick=()=>{const item=data.bookmarks.find(n=>n.id===b.dataset.rename);closeDialog();showDialog({title:'重命名书签',html:field('title','名称',item.title,{required:true}),onSubmit:async v=>{await api('bookmark.update',{id:doc.id,expectedRevision:data.revision,bookmarkId:item.id,title:v.title});await this.changed();}});});
    }});
  }
}
