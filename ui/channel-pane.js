// Channel workbench: Aexus news/discussion flows over canonical CloudHosts Core.
// This surface never starts an Agent; it only sends explicit API mutations.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=value=>value?new Date(value).toLocaleString(document.documentElement.lang==='zh-CN'?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const unique=()=>crypto.randomUUID().replaceAll('-','');
export function channelPane(root,rpc,toast,{agents=()=>[],onExit=()=>{}}={}){
 let rooms=[],active=null,entries=[],cursor=null,unreadCount=0,sources=[],agentRows=[],loaded=false,busy=false,disposed=false;
 const availableAgents=()=>agentRows.length?agentRows:agents();
 let replyTo=null,draftKey='channel-'+unique(),pendingFiles=[],uploaded=new WeakMap(),refreshing=null,lastSignature='';
 root.innerHTML=`<div class="news-workbench"><aside class="news-sidebar">
  <header><button type="button" class="news-back" title="Back to Discussions">←</button><div><small>MESSAGES</small><h2>Channels</h2></div><button type="button" class="news-add" title="Create Channel" aria-label="Create Channel" disabled>＋</button></header>
  <p>Published articles, discussion and source-scoped updates</p>
  <div class="news-channel-list" role="list" aria-label="Channels"></div>
  <div class="news-foot">Articles and discussions are recorded without sending a new model task.</div>
 </aside><section class="news-main"><header class="news-header"></header>
  <div class="news-timeline" role="log" aria-label="Channel news and discussion"></div>
  <form class="news-composer" hidden><div class="news-reply-label" hidden></div>
   <textarea name="message" rows="3" maxlength="16000" placeholder="Write a public discussion note" aria-label="Channel message"></textarea>
   <div class="news-compose-actions"><label class="news-attach"><input type="file" name="files" multiple hidden>Attach files</label>
   <div class="news-attached"></div><button type="submit" class="primary">Publish message</button></div>
   <small>Public discussion only · sending does not start an Agent task</small>
  </form></section></div>`;
 const q=selector=>root.querySelector(selector),sidebar=q('.news-channel-list'),timeline=q('.news-timeline'),
  header=q('.news-header'),composer=q('.news-composer'),message=composer.elements.message;
 const feedback=error=>{if(!disposed)toast(error?.message||String(error),'error')};
 const row=()=>rooms.find(item=>item.id===active);
 const sourceName=id=>sources.find(item=>item.id===id)?.name||'External source';
 function roomRows(){
  sidebar.innerHTML=rooms.map(room=>`<button type="button" role="listitem" data-channel="${esc(room.id)}"
   class="${room.id===active?'active':''}"><span class="news-channel-letter">${esc(room.name.slice(0,1).toUpperCase())}</span>
   <span><strong data-no-i18n>${esc(room.name)}</strong><small>${room.mode==='external'?'External sources':'Agent publishers'} · ${room.postCount} articles</small></span>
   ${room.unreadCount?`<em aria-label="${room.unreadCount} unread">${room.unreadCount>99?'99+':room.unreadCount}</em>`:''}</button>`).join('')||
   '<p class="news-empty">No channels yet. Create a private Agent channel or an external news feed.</p>';
 }
 function headerView(){
  const room=row();
  if(!room){header.innerHTML='<div><small>CHANNELS</small><h2>Choose a channel</h2><p>Create a real published feed and share it with permitted Agents.</p></div>';composer.hidden=true;return}
  const external=room.mode==='external';
  header.innerHTML=`<div class="news-title"><small>${external?'EXTERNAL NEWS':'AGENT PUBLISHING'}</small>
   <h2 data-no-i18n>${esc(room.name)}</h2><p data-no-i18n>${esc(room.description||'')}${room.memberIds.length?' · '+room.memberIds.length+' Agent members':''}</p></div>
   <div class="news-actions"><button type="button" data-news-edit>Members &amp; Settings</button>
   ${external?'<button type="button" data-news-sources>Sources</button>':''}
   <button type="button" data-news-article>New article</button>
   <button type="button" data-news-read-all title="Acknowledge visible retained entries">Mark all read${unreadCount?' ('+unreadCount+')':''}</button></div>`;
  composer.hidden=false;
 }
 function replyView(){
  const label=q('.news-reply-label'),parent=entries.find(item=>item.id===replyTo);
  label.hidden=!replyTo;label.textContent=replyTo?
   'Replying to '+(parent?.title||parent?.text?.slice(0,130)||replyTo)+' · click to cancel':'';
 }
 function card(item){
  const isNews=item.kind==='news',title=item.title||'Untitled article',name=item.authorName||item.author?.name||'Publisher';
  const link=isNews&&item.url?`<a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>`:'';
  const files=(item.attachments||[]).map(file=>file.stationId?
   `<a href="./station/download/${encodeURIComponent(file.stationId)}" download="${esc(file.name)}">${esc(file.name)}</a>`:
   `<span>${esc(file.name||'Document')}</span>`).join('');
  return `<article class="news-entry ${isNews?'news-article':'news-comment'}" data-news-entry="${esc(item.id)}">
   <div class="news-entry-head"><span class="news-entry-type">${isNews?'ARTICLE':esc(item.messageKind||'DISCUSSION')}</span>
   <strong data-no-i18n>${esc(name)}</strong><time>${esc(dateLabel(item.publishedAt||item.createdAt))}</time></div>
   ${isNews?`<h3 data-no-i18n>${esc(title)}</h3>`:''}
   ${item.replyPreview?`<p class="news-quote">↳ ${esc(item.replyPreview.title||'Referenced entry')} · ${esc(item.replyPreview.authorName||'')}</p>`:''}
   <p class="news-entry-body" data-no-i18n>${esc(isNews?item.body:item.text)}</p>
   ${link?'<div class="news-entry-links">'+link+'</div>':''}
   ${files?'<div class="news-entry-files">'+files+'</div>':''}
   <div class="news-entry-actions"><button type="button" data-news-reply="${esc(item.id)}">Reply</button>
   ${isNews?`<button type="button" data-news-save="${esc(item.id)}">${item.saved?'★ Saved':'☆ Save'}</button>
    <button type="button" data-news-delete="${esc(item.id)}">Delete</button>`:''}
   <button type="button" data-news-read="${esc(item.id)}">Mark read</button></div></article>`;
 }
 function paint({older=false}={}){
  const oldHeight=timeline.scrollHeight,oldTop=timeline.scrollTop,nearBottom=oldHeight-oldTop-timeline.clientHeight<110;
  const sig=JSON.stringify([active,entries,!!cursor]);
  if(!older&&sig===lastSignature)return;
  lastSignature=sig;
  timeline.innerHTML=(cursor?'<button type="button" class="news-load-more" data-news-older>Load earlier entries</button>':'')+
   (entries.map(card).join('')||'<p class="news-empty">No published articles or messages yet.</p>');
  if(older)timeline.scrollTop=oldTop+timeline.scrollHeight-oldHeight;
  else if(nearBottom)timeline.scrollTop=timeline.scrollHeight;
  replyView();
 }
 async function refresh({force=false}={}){
  if(disposed||root.hidden)return;
  if(refreshing){await refreshing;if(force&&!disposed&&!root.hidden)return refresh({force:true});return}
  refreshing=(async()=>{
   const [updated,people]=await Promise.all([rpc('channel.list'),rpc('hosts.agent-list')]);if(disposed)return;
   rooms=updated;agentRows=people;q('.news-add').disabled=false;
   if(active&&!rooms.some(x=>x.id===active)){active=null;entries=[];cursor=null}
   if(!active&&rooms.length)active=rooms[0].id;
   roomRows();
   if(!active){headerView();timeline.innerHTML='<p class="news-empty">Choose or create a channel.</p>';return}
   const channel=active;
   const [page,src]=await Promise.all([rpc('channel.timeline',{id:channel,limit:50}),
    row()?.mode==='external'?rpc('channel.sources',{channelId:channel}):Promise.resolve([])]);
   if(disposed||active!==channel)return;
   sources=src;unreadCount=page.unreadCount;
   const known=new Map(entries.map(item=>[item.id,item]));for(const item of page.entries)known.set(item.id,item);
   entries=[...known.values()].sort((a,b)=>a.sequence-b.sequence);
   if(cursor===null||force)cursor=page.nextCursor;
   headerView();paint();loaded=true;
  })().catch(feedback).finally(()=>{refreshing=null});
  return refreshing;
 }
 async function open(id){
  if(active!==id){active=id;entries=[];cursor=null;replyTo=null;message.value='';draftKey='channel-'+unique();lastSignature='';pendingFiles=[]}
  roomRows();await refresh({force:true});
 }
 function dialog(content,onSubmit){
  const modal=document.createElement('dialog');modal.className='news-dialog';
  modal.innerHTML=content;root.append(modal);
  const close=()=>{modal.close();modal.remove()};
  modal.querySelectorAll('[data-news-close]').forEach(button=>button.onclick=close);
  modal.oncancel=event=>{event.preventDefault();close()};
  const form=modal.querySelector('form');
  if(form)form.onsubmit=async event=>{event.preventDefault();const button=event.submitter||form.querySelector('[type=submit]');
   button.disabled=true;try{await onSubmit(form,close,button,modal)}catch(error){feedback(error);button.disabled=false}};
  modal.showModal();(form?.querySelector('input,textarea,select')||modal.querySelector('button'))?.focus();
  return {modal,close};
 }
 const shell=(title,body,footer='<button type="submit" class="primary">Save</button>')=>
  `<form><header><h2>${esc(title)}</h2><button type="button" data-news-close aria-label="Close">×</button></header>${body}
   <footer><button type="button" data-news-close>Cancel</button>${footer}</footer></form>`;
  function channelEditor(previous){
  const people=availableAgents(),external=previous?.mode==='external';
  const memberCheckbox=person=>`<label><input type="checkbox" name="member" value="${esc(person.id)}"
   ${previous?.memberIds.includes(person.id)?'checked':''}>${esc(person.name||person.id)} <small>${esc(person.engine)}</small></label>`;
  const publishCheckbox=person=>`<label><input type="checkbox" name="publisher" value="${esc(person.id)}"
   ${previous?.publisherIds.includes(person.id)?'checked':''}>${esc(person.name||person.id)}</label>`;
  const body=`<label>Name<input name="name" maxlength="100" required value="${esc(previous?.name||'')}" data-no-i18n></label>
   <label>Description<input name="description" maxlength="1000" value="${esc(previous?.description||'')}" data-no-i18n></label>
   ${previous?`<p>Publishing mode: ${external?'External collector':'Authorized Agent'}. Engine type is fixed.</p>`:
    '<label>Publishing mode<select name="mode"><option value="agents">Authorized Agents</option><option value="external">External source collectors</option></select></label>'}
   <strong>Members (sharing does not change Company permissions)</strong>
   <div class="news-member-picks">${people.map(memberCheckbox).join('')||'<p>Create an Agent in the Agent Board to add channel members.</p>'}</div>
   <div class="news-publish-picks"><strong>Agent publishers · explicit permission</strong>
   <div class="news-member-picks">${people.map(publishCheckbox).join('')}</div></div>
   <label>Channel Owner<select name="ownerId"><option value="">No owner</option>
    ${people.map(person=>`<option value="${esc(person.id)}" ${person.id===previous?.ownerId?'selected':''}>${esc(person.name)}</option>`).join('')}</select></label>
   ${previous?'<p>To remove the Owner, select a new member as Owner in this edit.</p>':''}`;
  const {modal}=dialog(shell(previous?'Channel settings':'Create Channel',body),async(form,close)=>{
   const data=new FormData(form),memberIds=data.getAll('member').map(String),mode=previous?.mode||data.get('mode');
   const publisherIds=mode==='external'?[]:data.getAll('publisher').map(String),ownerId=data.get('ownerId')||null;
   const args={name:data.get('name'),description:data.get('description'),memberIds,publisherIds,ownerId};
   if(ownerId&&!memberIds.includes(ownerId))throw Error('Channel Owner must remain a selected member');
   if(publisherIds.some(id=>!memberIds.includes(id)))throw Error('Channel publishers must be selected members');
   const made=previous?await rpc('channel.update',{id:previous.id,expectedRevision:previous.revision,...args}):
    await rpc('channel.create',{...args,mode});
   close();await refresh();await open(made.id);toast(previous?'Channel updated':'Channel created');
  });
  const modeSelect=modal.querySelector('[name=mode]'),options=modal.querySelector('.news-publish-picks');
  const sync=()=>{options.hidden=(modeSelect?.value||previous?.mode)==='external'};
  modeSelect?.addEventListener('change',sync);sync();
 }
 function articleEditor(){
  const room=row();if(!room)return;
  const external=room.mode==='external';
  if(external&&!sources.length){toast('Add an external source before publishing','error');sourceManager();return}
  const select=external?`<label>Publisher source<select name="sourceId">
   ${sources.filter(item=>item.enabled).map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.plugin)}</option>`).join('')}</select></label>`:'';
  dialog(shell('Publish article',`<p>Publishes a news record. It does not start a Coding Agent.</p>
   ${select}<label>Title<input name="title" maxlength="1000" placeholder="Article headline" data-no-i18n></label>
   <label>Body<textarea name="body" rows="10" maxlength="60000" placeholder="Article content" data-no-i18n></textarea></label>
   <label>Original URL (optional)<input name="url" placeholder="https://..." maxlength="4096" data-no-i18n></label>
   <label>Author (optional)<input name="authorName" maxlength="160" value="You" data-no-i18n></label>
   <p>New articles remain accessible for the configured retention window. Save important items permanently.</p>`,
   '<button class="primary" type="submit">Publish article</button>'),async(form,close)=>{
    const data=new FormData(form),params={externalId:'manual-'+unique(),publishedAt:Date.now(),
     title:data.get('title'),body:data.get('body'),url:data.get('url'),authorName:data.get('authorName')};
    if(external)params.sourceId=data.get('sourceId');
    else params.channelId=room.id;
    const published=await rpc('channel.publish',params);
    close();await refresh();toast(published.status==='created'?'Article published':'Article status: '+published.status);
   });
 }
 function sourceManager(){
  const room=row();if(!room||room.mode!=='external')return;
  const listing=sources.map(item=>`<div class="news-source-row"><strong>${esc(item.name)}</strong>
   <small>${esc(item.plugin)} · ${esc(item.locator)} · ${item.enabled?'active':'disabled'}</small>
   <button type="button" data-toggle-source="${esc(item.id)}">${item.enabled?'Disable':'Enable'}</button></div>`).join('')||
   '<p>No sources configured. Add Telegram, X, YouTube, or an independent process source.</p>';
  const {modal,close}=dialog(shell('Channel sources & collectors',`
   <p>Source names and URLs are configuration only. Connect a separate collector using a source-scoped token.</p>
   <div class="news-source-list">${listing}</div>
   <label>Provider<select name="plugin"><option value="process">External process</option><option value="telegram">Telegram</option>
    <option value="x">X</option><option value="youtube">YouTube</option></select></label>
   <label>Locator<input name="locator" required maxlength="4096" placeholder="@handle or feed identity" data-no-i18n></label>
   <label>Display name<input name="name" maxlength="160" placeholder="Readable source name" data-no-i18n></label>
   <div class="news-source-shortcuts"><button type="button" data-issue-token>Issue collector credential</button>
    <button type="button" data-manage-tokens>Manage credentials</button></div>`,
   '<button type="submit" class="primary">Add source</button>'),async(form,finish)=>{
    const data=new FormData(form);
    await rpc('channel.source-add',{channelId:room.id,plugin:data.get('plugin'),locator:data.get('locator'),
     ...(data.get('name')?{name:data.get('name')}:{})});
    finish();await refresh();sourceManager();toast('Source saved');
   });
  modal.querySelector('.news-source-list').onclick=event=>{
   const toggle=event.target.closest('[data-toggle-source]');if(!toggle)return;
   const source=sources.find(row=>row.id===toggle.dataset.toggleSource);if(!source)return;
   toggle.disabled=true;void rpc('channel.source-update',{id:source.id,expectedRevision:source.revision,
    patch:{enabled:!source.enabled}}).then(async()=>{close();await refresh();sourceManager()}).catch(feedback);
  };
  modal.querySelector('[data-issue-token]').onclick=()=>{close();credentialEditor()};
  modal.querySelector('[data-manage-tokens]').onclick=()=>{close();credentialList()};
 }
 function credentialEditor(){
  const activeSources=sources.filter(item=>item.enabled);
  if(!activeSources.length){toast('Add an enabled source first','error');return}
  const {modal}=dialog(shell('Issue external collector credential',
   `<p>Only selected external sources may publish. The token is shown once and never stored in the UI.</p>
   <label>Collector name<input name="name" required maxlength="100" value="Channel collector" data-no-i18n></label>
   <strong>Allowed source IDs</strong><div class="news-member-picks">
   ${activeSources.map(item=>`<label><input name="source" type="checkbox" value="${esc(item.id)}" checked>${esc(item.name)}</label>`).join('')}</div>`,
   '<button type="submit" class="primary">Issue token</button>'),async(form,_close)=>{
    const data=new FormData(form),sourceIds=data.getAll('source').map(String);
    const result=await rpc('channel.collector-add',{name:data.get('name'),sourceIds});
    form.innerHTML=`<header><h2>Collector credential created</h2></header>
     <p>This token is the only copy. Copy it to your external collector securely.</p>
     <label>Loopback endpoint<input readonly value="${esc(location.origin+'/channel-ingest')}"></label>
     <label>Bearer token<textarea rows="3" spellcheck="false" readonly data-secret-token>${esc(result.token)}</textarea></label>
     <p>The collector sends JSON with method <code>config</code> or <code>publish</code>. Bearer scope is limited to selected sources. Revoke in channel settings.</p>
     <footer><button type="button" data-news-close>Close</button></footer>`;
    form.querySelector('[data-news-close]').onclick=()=>{modal.close();modal.remove()};
   });
 }
 function credentialList(){
  void rpc('channel.collectors').then(items=>{
   const {modal}=dialog(`<div class="news-token-list"><header><h2>Collector credentials</h2>
    <button type="button" data-news-close>×</button></header>
    <p>Stored token hashes are never displayed. Revoking takes effect immediately.</p>
    ${items.map(item=>`<div><strong>${esc(item.name)}</strong><small>${esc(item.id)} · ${item.revokedAt?'Revoked':item.sourceIds.length+' sources'}</small>
    ${item.revokedAt?'':`<button type="button" data-revoke="${esc(item.id)}">Revoke</button>`}</div>`).join('')||'<p>No collector credentials.</p>'}
    <footer><button type="button" data-news-close>Close</button></footer></div>`);
   modal.querySelectorAll('[data-news-close]').forEach(button=>button.onclick=()=>{modal.close();modal.remove()});
   modal.querySelectorAll('[data-revoke]').forEach(button=>button.onclick=async event=>{
    if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='Confirm revoke';return}
    button.disabled=true;
    try{await rpc('channel.collector-revoke',{id:event.currentTarget.dataset.revoke});modal.close();modal.remove();credentialList()}
    catch(error){feedback(error);button.disabled=false}
   });
  }).catch(feedback);
 }
  q('.news-back').onclick=onExit;
 q('.news-add').onclick=()=>channelEditor(null);
 sidebar.onclick=event=>{const button=event.target.closest('[data-channel]');if(button)void open(button.dataset.channel).catch(feedback)};
 header.onclick=event=>{
  if(event.target.closest('[data-news-edit]')){channelEditor(row());return}
  if(event.target.closest('[data-news-sources]')){sourceManager();return}
  if(event.target.closest('[data-news-article]')){articleEditor();return}
  if(event.target.closest('[data-news-read-all]')&&active){
   const button=event.target.closest('button');button.disabled=true;
   void rpc('channel.acknowledge',{id:active,all:true}).then(async()=>{await refresh({force:true})}).catch(feedback)
    .finally(()=>button.disabled=false);
  }
 };
 timeline.onclick=event=>{
  const older=event.target.closest('[data-news-older]');
  if(older&&active&&cursor){
   older.disabled=true;const channel=active,at=cursor;
   void rpc('channel.timeline',{id:channel,cursor:at,limit:50}).then(page=>{
    if(channel!==active)return;
    const known=new Map(entries.map(entry=>[entry.id,entry]));
    for(const entry of page.entries)known.set(entry.id,entry);
    entries=[...known.values()].sort((a,b)=>a.sequence-b.sequence);
    cursor=page.nextCursor;paint({older:true});
   }).catch(feedback).finally(()=>older.disabled=false);
   return;
  }
  const reply=event.target.closest('[data-news-reply]');
  if(reply){replyTo=reply.dataset.newsReply;replyView();message.focus();return}
  const read=event.target.closest('[data-news-read]');
  if(read){read.disabled=true;void rpc('channel.acknowledge',{id:active,entryIds:[read.dataset.newsRead]})
   .then(()=>refresh({force:true})).catch(feedback).finally(()=>read.disabled=false);return}
  const save=event.target.closest('[data-news-save]');
  if(save){
   const article=entries.find(row=>row.id===save.dataset.newsSave);if(!article)return;
   save.disabled=true;void rpc('channel.save',{id:article.id,saved:!article.saved})
    .then(()=>refresh({force:true})).catch(feedback).finally(()=>save.disabled=false);return;
  }
  const remove=event.target.closest('[data-news-delete]');
  if(remove){
   if(remove.dataset.confirm!=='yes'){remove.dataset.confirm='yes';remove.textContent='Confirm delete';return}
   remove.disabled=true;void rpc('channel.delete',{id:remove.dataset.newsDelete})
    .then(()=>refresh({force:true})).catch(feedback).finally(()=>remove.disabled=false);
  }
 };
 q('.news-reply-label').onclick=()=>{replyTo=null;replyView()};
 const paintFiles=()=>{q('.news-attached').innerHTML=pendingFiles.map((file,i)=>
  `<span>${esc(file.name)} <button type="button" data-remove-file="${i}">×</button></span>`).join('')};
 composer.elements.files.onchange=()=>{
  for(const file of composer.elements.files.files||[]){
   if(pendingFiles.length>=8){toast('Maximum eight files','error');break}
   if(file.size>50*1024*1024){toast('Attachments must be at most 50 MiB','error');continue}
   pendingFiles.push(file);
  }
  composer.elements.files.value='';paintFiles();
 };
 q('.news-attached').onclick=event=>{const target=event.target.closest('[data-remove-file]');
  if(target){pendingFiles.splice(Number(target.dataset.removeFile),1);paintFiles()}};
 composer.onsubmit=async event=>{
  event.preventDefault();if(!active||(!message.value.trim()&&!pendingFiles.length)||busy)return;
  const button=composer.querySelector('[type=submit]'),text=message.value,roomId=active,
   target=replyTo,key=draftKey;
  busy=true;button.disabled=true;
  try{
   const files=[];
   for(const file of pendingFiles){
    let transfer=uploaded.get(file);
    if(!transfer){
     const response=await fetch('./station/upload?name='+encodeURIComponent(file.name),{method:'POST',body:file});
     const body=await response.json();
     if(!response.ok||body.error)throw Error(body.error||'Attachment upload failed');
     transfer=body.id;uploaded.set(file,transfer);
    }
    files.push(transfer);
   }
   const sent=await rpc('channel.message-send',{id:roomId,text,replyTo:target||undefined,clientMessageId:key,files});
   if(!sent?.id)throw Error('Channel did not confirm a saved publication');
   if(active===roomId&&message.value===text){message.value='';pendingFiles=[];paintFiles();replyTo=null;
    draftKey='channel-'+unique();replyView()}
   await refresh({force:true});message.focus();
  }catch(error){feedback(error)}
  finally{busy=false;button.disabled=false}
 };
 return {refresh,open,dispose(){disposed=true;root.querySelectorAll('dialog').forEach(modal=>modal.close())}};
}


