import { configureDictionary } from './dictionary-settings.js';
import {imageInkHtml} from './image-ink.js';
import {imageEmphasis} from './study-emphasis.js';
import { $, escape, field, showDialog, closeDialog, run, toast, modalDirty } from './dom.js';
import { api, base, external } from './transport.js';
const area = (name, label, value = '') => `<label class="dialog-field"><span>${escape(label)}</span><textarea name="${name}">${escape(value)}</textarea></label>`;
const uri = (setId, cardId) => `margin-reader://card/${setId}/${cardId}`;
const mediaHtml = media => !media ? '' : media.kind === 'image'
  ? `<img class="comment-image" src="${new URL('data/' + media.asset, base).href}" alt="${escape(media.name)}">`
  : `<audio controls preload="metadata" src="${new URL('data/' + media.asset, base).href}" aria-label="${escape(media.name)}"></audio>`;
async function base64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = '';
  for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(value);
}
export class StudyContent {
  constructor(study) {
    this.study = study;
    const buttons = document.createElement('span'); buttons.className = 'study-content-tools';
    buttons.innerHTML = '<button id="study-media-add">图片 / 音频</button><button id="study-link-open">链接 / 检索</button><button id="study-dictionary">字典</button>';
    $('study-capture-tools').after(buttons);
    $('study-media-add').onclick = () => this.importMedia();
    $('study-link-open').onclick = () => this.find();
    $('study-dictionary').onclick = run(() => this.dictionary());
  }
  async openUri(value) {
    const study = this.study;
    if (modalDirty()) throw new Error('请先保存或取消当前编辑，再跳转。');
    const target = await api('link.resolve', { uri: value });
    await study.beforeNavigate(); closeDialog(); study.busy = true;
    try {
      const result = await api('link.open', { uri: value });
      if (target.kind === 'card') {
        study.current = result.set;
        if (result.source) await study.loadSource(result.source.documentId); else await study.showHome();
        study.render(result.set, result.cardId); study.excerpts.revealCard(result.cardId);
      } else if (target.kind === 'study') {
        study.current = await api('study.get', { setId: target.setId });
        await study.showHome(); study.render(study.current);
      } else {
        await study.leave(false); await study.loadSource(target.id);
      }
      await study.refreshList();
    } finally { study.busy = false; }
  }
  bindLinks(root, data) {
    root.addEventListener('click', event => {
      const a = event.target.closest('a'); if (!a) return;
      event.preventDefault(); event.stopPropagation(); const href = a.getAttribute('href') || '';
      run(async () => {
      if (href.startsWith('margin-reader:')) return this.openUri(href);
      const match = /^#reader-link-choice-(\d+)$/.exec(href);
      if (match) {
        const choice = data.choices[Number(match[1])]; if (!choice) return;
        closeDialog();
        showDialog({ title: `选择「${choice.label}」的目标`, html: '<div class="link-candidates">' + choice.targets.map(t => `<button type="button" data-uri="${uri(t.setId,t.cardId)}">${escape(t.setTitle)} / ${escape(t.title)}</button>`).join('') + '</div>', onSubmit: null,
          afterOpen: () => $('dialog-fields').querySelectorAll('[data-uri]').forEach(b => b.onclick = run(() => this.openUri(b.dataset.uri))) });
      } else if (/^https?:/i.test(href)) external(href);
      })();
    });
  }
  async preview(card) {
    const set = this.study.current, data = await api('study.card.render', { setId: set.id, cardId: card.id });
    const fresh = (await api('study.get', { setId: set.id })).cards.find(c => c.id === card.id);
    const comments = new Map((fresh.comments || []).map(c => [c.id,c]));
    const parts = (fresh.mergedIds || []).map(id => set.cards.find(c => c.id === id)).filter(Boolean);
    showDialog({ title: fresh.title, html: `${data.linkStatus?.complete===false?'<p class="dialog-note" role="status">本卡自动链接已达 200 处；全部正文仍保留。其余词条可通过全局卡片搜索查找。</p>':''}<div class="study-card-preview">${fresh.imageAsset ? `<div class="emphasis-image-preview"><img src="${new URL('data/'+fresh.imageAsset,base).href}" alt="${escape(fresh.title)}">${imageEmphasis(fresh)}${imageInkHtml(fresh,(fresh.ink||[]).filter(s=>s.imageBound&&s.reviewSide!=='front'&&!s.hidden&&set.layers.some(l=>l.id===(s.layerId||'default')&&l.visible&&!l.deletedAt)),set.colors)}</div>` : ''}${data.html}${data.noteHtml ? '<hr>'+data.noteHtml : ''}${parts.map(c => `<hr><h4>${escape(c.title)}</h4>${c.imageAsset?`<img class="comment-image" src="${new URL('data/'+c.imageAsset,base).href}" alt="${escape(c.title)}">`:''}<p>${escape(c.editedText??c.text)}</p>`).join('')}${data.comments.map(c => `<section class="rich-comment">${c.html}${mediaHtml(comments.get(c.id)?.media)}</section>`).join('')}</div><div class="content-actions"><button type="button" id="preview-comments">管理评论</button><button type="button" id="preview-links">关联与反向链接</button><button type="button" id="preview-uri">复制回源链接</button><button type="button" id="preview-speech">本地朗读</button></div>`, onSubmit: null,
      afterOpen: () => {
        this.bindLinks($('dialog-fields').querySelector('.study-card-preview'),data);
        $('preview-comments').onclick = run(() => { closeDialog(); return this.comments(fresh); });
        $('preview-links').onclick = run(() => { closeDialog(); return this.links(fresh); });
        $('preview-uri').onclick = run(() => this.copyUri(set.id, card.id));
        $('preview-speech').onclick=run(()=>{closeDialog();return this.study.devices.readAloud(fresh);});
      }
    });
  }
  async copyUri(setId, cardId) {
    const value = (await api('link.create',{ kind:'card', setId, id:cardId })).uri;
    try { await navigator.clipboard.writeText(value); toast('回源链接已复制'); }
    catch { closeDialog(); showDialog({title:'回源链接',html:field('uri','复制此稳定链接',value),onSubmit:null}); }
  }
  async comments(card,reviewSide='back') {
    const setId = this.study.current.id;
    const data = await api('study.comment.list', { setId, cardId:card.id, includeDeleted:true });
    const active = data.comments.filter(c=>!c.deletedAt);
    showDialog({ title:'评论 · '+card.title, html:'<div class="comment-list">'+data.comments.map(c => `<section class="comment-row ${c.deletedAt?'deleted':''}" data-comment="${c.id}"><p>${escape(c.text)}</p>${mediaHtml(c.media)}<small>${({front:'正面',back:'背面',both:'双面'})[c.reviewSide||'back']} · ${escape(new Date(c.createdAt).toLocaleString())}</small><div>${c.deletedAt?'<button type="button" data-comment-action="restore">恢复评论</button>':'<button type="button" data-comment-action="edit">编辑</button><button type="button" data-comment-action="up">上移</button><button type="button" data-comment-action="down">下移</button><button type="button" data-comment-action="remove">删除</button>'}</div></section>`).join('')+'</div>'+field('reviewSide','显示位置',reviewSide,{choices:[['back','背面 / 卡片内容'],['front','正面提示'],['both','正反面']]})+area('text','添加评论 · Markdown / 公式 / [[卡片标题]]')+'<button type="button" id="comment-attach">添加图片 / 音频评论</button>', submit:'添加评论', onSubmit:v=>this.study.change('study.comment.add',{cardId:card.id,text:v.text,reviewSide:v.reviewSide},data.revision),
      afterOpen:()=>{
        $('comment-attach').onclick=()=>{if(modalDirty()){toast('先保存或取消已输入的评论',true);return;}const side=$('dialog-fields').querySelector('[name=reviewSide]').value;closeDialog();this.importMedia(card,side);};
        $('dialog-fields').querySelectorAll('[data-comment-action]').forEach(b=>b.onclick=run(async()=>{
          if(modalDirty())throw new Error('先保存或取消已输入的评论。');
          const c=data.comments.find(c=>c.id===b.closest('[data-comment]').dataset.comment),action=b.dataset.commentAction;
          if(action==='edit'){closeDialog();showDialog({title:'编辑评论',html:field('reviewSide','显示位置',c.reviewSide||'back',{choices:[['back','背面 / 卡片内容'],['front','正面提示'],['both','正反面']]})+area('text','评论',c.text),onSubmit:v=>this.study.change('study.comment.update',{cardId:card.id,commentId:c.id,text:v.text,reviewSide:v.reviewSide},data.revision)});return;}
          const params={cardId:card.id,commentId:c.id};let method='study.comment.update';
          if(action==='up'||action==='down'){const index=active.indexOf(c)+(action==='up'?-1:1);if(index<0||index>=active.length)return;method='study.comment.move';params.index=index;}
          else params.deleted=action==='remove';
          b.disabled=true;
          try{await this.study.change(method,params,data.revision);closeDialog();await this.comments(card);}finally{b.disabled=false;}
        }));
      }
    });
  }
  importMedia(card,reviewSide='back') {
    const set=this.study.current;if(!set)return;
    showDialog({title:card?'添加媒体评论':'新增图片 / 音频卡片',html:field('title','标题',card?.title||'')+'<label class="dialog-field"><span>本地图片或音频</span><input name="attachment" type="file" accept="image/png,image/jpeg,image/gif,image/webp,audio/wav,audio/mpeg,audio/mp4,audio/ogg,audio/webm" required></label>'+area('text','评论文字（可选）')+'<p class="dialog-note">图片最多 8 MiB，音频最多 16 MiB。只保存所选文件，不上传至外部服务。</p>',submit:'保存媒体',onSubmit:async v=>{
      const file=$('dialog-fields').querySelector('[name=attachment]').files[0];if(!file)throw Error('请选择文件');
      const audio=/^audio\//.test(file.type)||/\.(wav|mp3|m4a|ogg|webm)$/i.test(file.name),kind=audio?'audio':'image';
      if(file.size>(audio?16:8)*1024*1024)throw Error('文件超过大小限制');
      const mime=({wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',ogg:'audio/ogg',webm:'audio/webm'})[file.name.split('.').pop().toLowerCase()]||file.type;
      await this.study.change('study.media.import',{kind,name:file.name,title:v.title||file.name,text:v.text,mimeType:mime,contentBase64:await base64(file),...(card?{cardId:card.id,target:'comment',reviewSide}:{})},set.revision);
    }});
  }
  transform(card) {
    const set=this.study.current,revision=set.revision;
    showDialog({title:'裁剪 / 旋转图片',html:mediaHtml(card.media)+field('x','左边界 (%)',0,{type:'number',min:0,max:99})+field('y','上边界 (%)',0,{type:'number',min:0,max:99})+field('width','宽度 (%)',100,{type:'number',min:1,max:100})+field('height','高度 (%)',100,{type:'number',min:1,max:100})+field('rotation','顺时针旋转',0,{choices:[0,90,180,270]})+'<p class="dialog-note">图片强调与复习遮罩会跟随裁剪和旋转；裁掉的区域从当前图片移除。撤销会连同图片和标记一起恢复。</p>',onSubmit:async v=>{if(this.study.current?.id!==set.id)throw Error('学习集已切换，请重新打开图片编辑器。');const result=await this.study.change('study.media.transform',{cardId:card.id,crop:Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(v[k])/100])),rotation:Number(v.rotation)},revision);const ink=result.lastMedia?.imageMarks?.unmappedInk;if(ink)toast('卡片手写保留原位置；从图片荧光笔再次出题前，请重新标记图片区域。');return result;}});
  }
  async links(card) {
    const set=this.study.current,listing=await api('study.links.list',{setId:set.id,cardId:card.id,limit:500}),backs=await api('study.card.backlinks',{setId:set.id,cardId:card.id,limit:500});
    showDialog({title:'关联与反向链接 · '+card.title,html:listing.links.map(l=>`<div class="study-link-row"><button type="button" data-uri="${l.target.uri}" ${l.target.available?'':'disabled'}>${l.bidirectional?'↔':l.outgoing?'→':'←'} ${escape(l.target.setTitle)} / ${escape(l.target.title)}${l.label?' · '+escape(l.label):''}</button><button type="button" data-link-edit="${l.id}">编辑</button><button type="button" data-unlink="${l.id}">移除</button></div>`).join('')+`<p class="dialog-note">关联 ${listing.total} 条；下方为引用/行内反向链接 ${backs.total} 条。</p>`+backs.backlinks.map(b=>`<button type="button" class="backlink-row" data-uri="${uri(b.setId,b.cardId)}">${escape(b.setTitle)} / ${escape(b.title)}</button>`).join('')+'<button type="button" id="content-add-link">添加跨学习集关联</button>',onSubmit:null,afterOpen:()=>{
      $('dialog-fields').querySelectorAll('[data-uri]').forEach(b=>b.onclick=run(()=>this.openUri(b.dataset.uri)));
      $('content-add-link').onclick=()=>{closeDialog();this.find(card);};
      $('dialog-fields').querySelectorAll('[data-unlink],[data-link-edit]').forEach(b=>b.onclick=run(async()=>{
        const l=listing.links.find(l=>l.id===(b.dataset.unlink||b.dataset.linkEdit));
        if(b.dataset.linkEdit){closeDialog();showDialog({title:'编辑关联',html:field('label','说明',l.label)+field('direction','方向',l.bidirectional?'both':'one',{choices:[['both','双向'],['one','单向']]}),onSubmit:async v=>{await api('study.link.update',{setId:l.ownerSetId,expectedRevision:l.ownerRevision,linkId:l.id,label:v.label,bidirectional:v.direction==='both'});await this.study.refresh();}});return;}
        b.disabled=true;try{await api('study.link.remove',{setId:l.ownerSetId,expectedRevision:l.ownerRevision,linkId:l.id});await this.study.refresh();closeDialog();await this.links(card);}finally{b.disabled=false;}
      }));
    }});
  }
  find(from) {
    const set=this.study.current;let offset=0,next=null,serial=0;
    showDialog({title:from?'添加关联 · '+from.title:'全库卡片 / 回源链接',html:field('query','搜索标题、正文、评论和标签')+field('uri','或粘贴 margin-reader:// 链接')+(from?field('label','关联说明')+field('direction','方向','both',{choices:[['both','双向'],['one','单向']]}):'')+'<div class="content-actions"><button type="button" id="link-search">搜索</button><button type="button" id="link-more">下一页</button></div><p id="link-results-status"></p><div id="link-results"></div>',submit:from?'关联到粘贴的链接':'打开粘贴的链接',onSubmit:async v=>{
      if(from){const target=await api('link.resolve',{uri:v.uri});if(target.kind!=='card')throw Error('请选择卡片链接');await this.study.change('study.link.add',{from:from.id,to:target.cardId,toSetId:target.setId,label:v.label,bidirectional:v.direction==='both'},set.revision);}
      else {const target=await api('link.resolve',{uri:v.uri});this.pendingOpen=v.uri;setTimeout(()=>run(()=>this.openUri(this.pendingOpen))(),0);return target;}
    },afterOpen:()=>{
      const load=async()=>{const ticket=++serial,data=await api('study.catalog',{query:$('dialog-fields').querySelector('[name=query]').value,offset,limit:50});if(ticket!==serial||!$('link-results'))return;next=data.nextOffset;$('link-more').disabled=next===null;$('link-results-status').textContent=`共 ${data.total} 条 · 第 ${offset+1}–${Math.min(offset+50,data.total)} 条`;$('link-results').innerHTML=data.cards.map(c=>`<button type="button" data-uri="${c.uri}">${escape(c.setTitle)} / ${escape(c.title)}<small>${escape(c.text)}</small></button>`).join('');$('link-results').querySelectorAll('button').forEach(b=>b.onclick=run(async()=>{if(from){$('dialog-fields').querySelector('[name=uri]').value=b.dataset.uri;$('dialog-fields').dispatchEvent(new Event('input',{bubbles:true}));}else{closeDialog();await this.openUri(b.dataset.uri);}}));};
      $('link-search').onclick=run(()=>{offset=0;return load();});$('link-more').onclick=run(()=>{if(next!==null)offset=next;return load();});run(load)();
    }});
  }
  async dictionary() { return configureDictionary(this.study); }
}
