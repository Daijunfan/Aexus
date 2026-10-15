// CloudHosts group delivery and native conversation interface.
import {channelPane} from './channel-pane.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt=time=>new Date(time).toLocaleString(document.documentElement.lang==='zh-CN'?'zh-CN':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const kindLabel={operator:'You',core:'Plan',agent:'Agent'};
export function messagesPane(root,rpc,toast,{onPlanDraft,onOpenAgent,initialGroup,onSelectGroup}={}){
 let groups=[],agents=[],nativeSummaries=[],active=initialGroup||null,activeNative=null,mode='groups',disposed=false,oldSignature='',replyTo=null,draftId=crypto.randomUUID(),timer,olderNative=null,olderGroups=null,events=null,realtimeTimer=null,approvals=[];
 let messengerState={revision:0,conversations:{},messages:{},drafts:{},folders:[],orders:{}},personalFilter='all',activeFolder='',personalSearch='';
 let searchDialog=null,searchResults=[],searchBusy=false,draftTimer=null;const draftWriters=new Map();
 const readClaims=new Map();
 let pendingFiles=[];const uploaded=new WeakMap();
 let groupItems=[],groupQuery='',historyEpoch=0,searchTimer=null,olderBusy=false;
 const drafts=new Map(),mentions=new Set();let mentionResults=[],mentionIndex=0;
 root.innerHTML=`<div class="collab-messages"><aside class="collab-sidebar"><div class="collab-sidebar-heading"><div><small>MESSAGES</small><h2>Groups</h2></div><button type="button" class="collab-new-group" title="Create group" aria-label="Create group">＋</button></div><p class="collab-sidebar-hint">Shared tasks, delivery receipts &amp; native conversations</p><div class="collab-source-tabs" role="tablist" aria-label="Message sources"><button type="button" data-source="groups" role="tab" aria-selected="true" class="active">Discussions</button><button type="button" data-source="native" role="tab" aria-selected="false">Native sessions</button><button type="button" data-source="channels" role="tab" aria-selected="false">Channels</button></div><div class="collab-messenger-filters"><div class="collab-messenger-filter-buttons"><button type="button" data-personal-filter="all" class="active">All</button><button type="button" data-personal-filter="favorite">Favorites</button><button type="button" data-personal-filter="archived">Archive</button><button type="button" data-message-search title="Search all conversations">Search</button></div><input type="search" class="collab-conversation-quick-search" placeholder="Filter conversations" aria-label="Filter conversations" maxlength="150"><div class="collab-folder-bar"><select data-message-folder aria-label="Messenger folder"><option value="">All categories</option></select><button type="button" data-folder-create title="Create personal folder">＋</button><button type="button" data-folder-edit title="Edit selected folder" hidden>⋯</button></div></div><div class="collab-group-list" role="list" aria-label="Groups"></div><div class="collab-sidebar-foot">Group Send creates work for addressed Agents. Use Notes for non-executable discussion.</div></aside><section class="collab-conversation"><div class="collab-conversation-head"></div><div class="collab-messages-list" role="log" aria-label="Group history"></div><form class="collab-composer" hidden><div class="collab-reply-label" hidden></div><div class="collab-mention-picks" role="listbox" hidden></div><textarea name="text" rows="3" maxlength="16000" aria-label="Message" placeholder="Write a task… type @ to address an Agent"></textarea><div class="collab-mention-chips"></div><div class="collab-attachment-picks"></div><div class="collab-composer-actions"><label class="collab-upload" title="Attach files"><input type="file" name="files" multiple hidden>Attach files</label><label class="collab-note-control"><input type="checkbox" name="asNote"> Note only · no Agent execution</label><button class="primary" type="submit">Send to Agents</button></div></form></section></div>`;
 const q=sel=>root.querySelector(sel),sidebar=q('.collab-group-list'),stream=q('.collab-messages-list'),head=q('.collab-conversation-head'),form=q('.collab-composer');
 const channelLayer=document.createElement('div');channelLayer.className='news-surface';channelLayer.hidden=true;
 root.querySelector('.collab-messages').append(channelLayer);
 const channelWidget=channelPane(channelLayer,rpc,toast,{agents:()=>agents,onExit:()=>{mode='groups';updateSourceTab();renderHeader(groups.find(item=>item.id===active)||null)}});
 const composer=form.elements.text,mentionBox=q('.collab-mention-picks'),chips=q('.collab-mention-chips'),attachmentPicks=q('.collab-attachment-picks');
 const prefsFor=key=>messengerState.conversations?.[key]||{},messagePrefs=(key,id)=>messengerState.messages?.[key+':'+id]||{};
 const folderFilter=(key,groupUnread=0)=>{
  const folder=messengerState.folders?.find(row=>row.id===activeFolder);
  if(!folder)return true;
  const prefs=prefsFor(key),kind=key.startsWith('group:')?'group':'agent';
  const included=(folder.conversations||[]).includes(key)||folder.include==='all'||folder.include===kind||
   folder.include==='favorites'&&prefs.favorite===true||folder.include==='unread'&&(prefs.unread||groupUnread>0);
  return included&&!(folder.excluded||[]).includes(key);
 };
 const filterConversation=(key,title,unread=0)=>{
  const prefs=prefsFor(key);
  return (personalFilter==='archived'?prefs.archived===true:prefs.archived!==true)&&
   (personalFilter!=='favorite'||prefs.favorite===true)&&folderFilter(key,unread)&&
   (!personalSearch||title.toLowerCase().includes(personalSearch.toLowerCase()));
 };
 const sortPreferences=(rows,keyOf)=>[...rows].sort((a,b)=>{
  const idA=keyOf(a),idB=keyOf(b),pA=prefsFor(idA),pB=prefsFor(idB);
  const orders=messengerState.orders?.all||[],ia=orders.indexOf(idA),ib=orders.indexOf(idB);
  return Number(!!pB.pinned)-Number(!!pA.pinned)||(ia<0?Number.MAX_SAFE_INTEGER:ia)-(ib<0?Number.MAX_SAFE_INTEGER:ib);
 });
 function updateFolderOptions(){
  const picker=q('[data-message-folder]'),selected=activeFolder;
  picker.innerHTML='<option value="">All categories</option>'+(messengerState.folders||[])
   .map(row=>'<option value="'+esc(row.id)+'">'+esc(row.name)+'</option>').join('');
  if(!messengerState.folders?.some(row=>row.id===selected))activeFolder='';picker.value=activeFolder;
  q('[data-folder-edit]').hidden=!activeFolder;
  root.querySelectorAll('[data-personal-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.personalFilter===personalFilter));
 }
 function renderConversationLists(){oldSignature='';updateFolderOptions();mode==='native'?renderNativeList():renderGroups()}
 const renderFiles=()=>{attachmentPicks.innerHTML=pendingFiles.map((file,i)=>'<span class="collab-file-chip" title="'+esc(file.name)+'">'+esc(file.name)+' <button type="button" data-remove-file="'+i+'">×</button></span>').join('')};
 const draftSnapshots=new Map(),draftTimers=new Map();
 function flushDraft(key){
  clearTimeout(draftTimers.get(key));draftTimers.delete(key);
  const args=draftSnapshots.get(key);if(!args)return;draftSnapshots.delete(key);
  const previous=draftWriters.get(key)||Promise.resolve();
  const job=previous.catch(()=>{}).then(()=>rpc('messenger.draft',args));
  draftWriters.set(key,job);
  void job.then(state=>{if(disposed)return;messengerState.drafts=state.drafts})
   .catch(error=>{if(!disposed)feedback(error)});
 }
 function queueDraft(key,args,immediate=false){
  draftSnapshots.set(key,{conversation:key,...args});
  clearTimeout(draftTimers.get(key));
  if(immediate)flushDraft(key);
  else draftTimers.set(key,setTimeout(()=>flushDraft(key),320));
 }
 function persistGroupDraft(id,body){
  queueDraft('group:'+id,{text:body.text,replyTo:body.replyTo||null,
   mentions:body.mentions||[],asNote:body.note===true,clientMessageId:body.draftId});
 }
 function persistNativeDraft(id,text){queueDraft('agent:'+id,{text,clientMessageId:draftId});}
 const saveDraft=()=>{if(mode==='groups'&&active){const body={text:composer.value,replyTo,
  mentions:[...mentions],draftId,note:form.elements.asNote.checked,files:[...pendingFiles]};
  drafts.set(active,body);persistGroupDraft(active,body)}};
 function importServerDrafts(){
  for(const [key,body] of Object.entries(messengerState.drafts||{})){
   const local=key.startsWith('agent:')?'native:'+key.slice(6):key.slice(6);
   if(!drafts.has(local))drafts.set(local,{text:body.text,replyTo:body.replyTo,
    mentions:body.mentions||[],note:body.asNote===true,draftId:body.clientMessageId});
  }
 }
 const renderReplyLabel=()=>{const label=q('.collab-reply-label'),original=groupItems.find(item=>item.id===replyTo);label.hidden=!replyTo;
  label.textContent=replyTo?'Replying to '+(original?original.author.name+': '+original.text.slice(0,145):replyTo.slice(0,12))+' · click to cancel':''};
 const restoreDraft=id=>{const saved=drafts.get(id);composer.value=saved?.text||'';replyTo=saved?.replyTo||null;draftId=saved?.draftId||crypto.randomUUID();form.elements.asNote.checked=saved?.note||false;pendingFiles=saved?.files||[];renderFiles();mentions.clear();for(const item of saved?.mentions||[])mentions.add(item);renderMentions();renderReplyLabel()};
 function renderMentions(){chips.innerHTML=[...mentions].map(id=>{const agent=agents.find(row=>row.id===id);return '<button type="button" class="collab-address-chip" data-unmention="'+esc(id)+'">@'+esc(agent?.name||id)+' ×</button>'}).join('')}
 function resolveMention(){const before=composer.value.slice(0,composer.selectionStart),match=before.match(/(?:^|\s)@([^@\s]*)$/u);return match?{query:match[1],start:composer.selectionStart-match[1].length-1}:null}
 function showMentionPicker(){if(mode!=='groups'){mentionBox.hidden=true;return}const match=resolveMention();const group=groups.find(row=>row.id===active);if(!match||!group){mentionBox.hidden=true;return}mentionResults=[{id:'all',name:'All members'},...agents.filter(a=>group.memberIds.includes(a.id)).filter(a=>a.name.toLocaleLowerCase().includes(match.query.toLocaleLowerCase()))];mentionIndex=0;mentionBox.hidden=false;drawPicker()}
 function drawPicker(){mentionBox.innerHTML=mentionResults.map((item,i)=>'<button type="button" role="option" aria-selected="'+(i===mentionIndex)+'" data-mention="'+esc(item.id)+'">@'+esc(item.name)+'</button>').join('')||'<span>No members found</span>'}
 function chooseMention(id){const match=resolveMention();if(!match)return;const group=groups.find(row=>row.id===active);const agent=agents.find(a=>a.id===id);if(id==='all'){for(const member of group?.memberIds||[])mentions.add(member)}else if(agent)mentions.add(id);else return;const name=id==='all'?'All':agent.name,at=composer.selectionStart;composer.setRangeText('@'+name+' ',match.start,at,'end');mentionBox.hidden=true;renderMentions();saveDraft();composer.focus()}

 const feedback=error=>{if(!disposed)toast(error.message||String(error),'error')};
 function conversationActions(key){
  const pref=prefsFor(key);
  return `<div class="collab-personal-actions" data-conversation-key="${esc(key)}"><button type="button" data-conversation-pref="favorite" aria-pressed="${!!pref.favorite}">${pref.favorite?'★ Favorited':'☆ Favorite'}</button><button type="button" data-conversation-pref="pinned" aria-pressed="${!!pref.pinned}">${pref.pinned?'Unpin':'Pin'}</button><button type="button" data-conversation-pref="archived" aria-pressed="${!!pref.archived}">${pref.archived?'Restore':'Archive for me'}</button><button type="button" data-conversation-pref="unread" aria-pressed="${!!pref.unread}">${pref.unread?'Marked unread':'Mark unread'}</button></div>`;
 }
 async function setMessagePreference(key,id,name,value){
  messengerState=await rpc('messenger.message',{conversation:key,id,patch:{[name]:value}});
  if(mode==='native')await refreshNative();else await refreshHistory(true);
 }
 function renderApprovals(){
  if(!head.firstElementChild)return;
  const group=groups.find(item=>item.id===active),visible=approvals.filter(item=>mode==='native'?item.agentId===activeNative:group?.memberIds.includes(item.agentId));
  let bar=head.querySelector('.collab-approvals');
  if(!visible.length){bar?.remove();return}
  if(!bar){bar=document.createElement('div');bar.className='collab-approvals';head.append(bar)}
  bar.innerHTML=visible.map(item=>'<div class="collab-approval"><strong>'+esc(item.agentName||item.agentId)+'</strong> '+esc(item.detail?.title||item.detail?.toolName||item.method||'Native approval required')+' <button data-approve="'+esc(item.id||item.requestId)+'" data-agent="'+esc(item.agentId)+'" data-decision="accept">Allow once</button><button data-approve="'+esc(item.id||item.requestId)+'" data-agent="'+esc(item.agentId)+'" data-decision="decline">Deny</button></div>').join('');
 }
 function renderNativeList(){
  const summaries=new Map(nativeSummaries.map(row=>[row.sessionId,row]));
  const available=agents.map(agent=>({agent,summary:summaries.get(agent.id)}));
  // Retained history stays readable even if the original Agent role is archived.
  for(const [id,summary] of summaries)if(!available.some(row=>row.agent.id===id))
   available.push({agent:{id,name:'Archived native session',engine:'codex',running:false},summary});
  const visible=sortPreferences(available.filter(row=>filterConversation('agent:'+row.agent.id,row.agent.name)),row=>'agent:'+row.agent.id);
  visible.sort((a,b)=>Number(!!prefsFor('agent:'+b.agent.id).pinned)-Number(!!prefsFor('agent:'+a.agent.id).pinned)||
   String(b.summary?.lastAt||'').localeCompare(String(a.summary?.lastAt||''))||a.agent.name.localeCompare(b.agent.name));
  sidebar.innerHTML=visible.map(({agent,summary})=>`<button type="button" class="collab-group-row ${activeNative===agent.id?'active':''}" data-native-session="${esc(agent.id)}"><img class="collab-native-logo" src="./engines/${esc(agent.engine)}.svg" alt=""><span class="collab-group-text"><strong data-no-i18n>${esc(agent.name)}${prefsFor('agent:'+agent.id).favorite?' ★':''}</strong><small data-no-i18n>${esc(drafts.get('native:'+agent.id)?.text?'Draft: '+drafts.get('native:'+agent.id).text.slice(0,50):summary?.preview||'No cached native messages yet')}</small></span><span class="collab-group-time">${summary?.lastAt?esc(fmt(summary.lastAt)):''}</span></button>`).join('')||'<p class="collab-empty-side">No native Agent sessions yet.</p>';
 }
 function updateSourceTab(){
  root.querySelectorAll('[data-source]').forEach(button=>{const active=button.dataset.source===mode;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
  channelLayer.hidden=mode!=='channels';
  root.querySelector('.collab-new-group').hidden=mode!=='groups';
  if(mode==='channels'){void channelWidget.refresh();return}
  if(mode==='native')renderNativeList();else{oldSignature='';renderGroups()}
 }
 function nativeMessage(item){
  const label={user:'You',assistant:'Agent',turn:'Turn',tool:'Native tool',approval:'Approval',
   'approval-resolved':'Approval resolved'}[item.kind]||item.kind;
  const prefs=messagePrefs('agent:'+activeNative,item.id),isText=['user','assistant'].includes(item.kind);
  return `<article class="collab-bubble-row ${item.kind==='user'?'is-own':''}" data-native-event="${esc(item.id)}"><span class="collab-author-icon">${item.kind==='user'?'●':'✳'}</span><div class="collab-bubble"><div class="collab-bubble-head"><strong>${esc(label)}</strong><time>${esc(fmt(item.time))}</time><span class="collab-message-kind">${esc(item.status||item.kind)}</span></div><p data-no-i18n>${esc(item.text||'')}</p>${item.turnId?`<small class="collab-native-reference" title="Native turn ID" data-no-i18n>${esc(item.turnId)}</small>`:''}${isText?`<div class="collab-bubble-actions"><button type="button" data-personal-save="${esc(item.id)}" aria-pressed="${!!prefs.saved}">${prefs.saved?'★ Saved':'☆ Save'}</button><button type="button" data-personal-pin="${esc(item.id)}" aria-pressed="${!!prefs.pinned}">${prefs.pinned?'Unpin':'Pin'}</button><button type="button" data-forward-message="${esc(item.id)}">Forward</button></div>`:''}</div></article>`;
 }
 async function refreshNative({older=false}={}){
  if(mode!=='native'||!activeNative||disposed)return;
  const id=activeNative,before=older?olderNative:undefined;
  if(older&&before===null)return;
  const page=await rpc('messages.nativeHistory',{sessionId:id,limit:100,...(before?{before}:{})});
  if(disposed||mode!=='native'||activeNative!==id)return;
  const fragment=page.events.map(nativeMessage).join('');
  if(older){
   const height=stream.scrollHeight,position=stream.scrollTop;
   stream.insertAdjacentHTML('afterbegin',fragment);
   stream.scrollTop=position+stream.scrollHeight-height;
  }else{
   const nearBottom=stream.scrollHeight-stream.scrollTop-stream.clientHeight<100;
   const signature=messengerState.revision+'|'+page.events.map(row=>[row.id,row.status,row.text].join(':')).join('|');
   if(signature!==stream.dataset.signature){stream.dataset.signature=signature;
    stream.innerHTML=fragment||'<div class="collab-empty-thread">No cached native transcript yet. Opening Messages does not start an Agent or send model requests.</div>';
    if(nearBottom)stream.scrollTop=stream.scrollHeight;
   }
  }
  olderNative=page.nextBefore;
  const button=head.querySelector('.collab-native-older');if(button)button.disabled=olderNative===null;
  const sync=head.querySelector('.collab-native-sync');if(sync)sync.textContent=page.lastSynchronizedAt?'Cached '+fmt(page.lastSynchronizedAt):'No native history synchronized';
 }
 async function openNative(id){
  if(mode==='groups')saveDraft();else if(activeNative){
   drafts.set('native:'+activeNative,{text:composer.value,draftId});persistNativeDraft(activeNative,composer.value);
  }
  mode='native';activeNative=id;updateSourceTab();
  const agent=agents.find(value=>value.id===id);
  head.innerHTML=`<div class="collab-head-main"><div><small>NATIVE SESSION · INTERACTIVE</small><h2 data-no-i18n>${esc(agent?.name||'Native session')}</h2><p>${esc(agent?.engine||'Native')} · ${esc(agent?.targetHostId||'Archived')}${agent?.transport==='pty'?' · Independent collaboration session':''}</p></div><button type="button" data-open-native="${esc(id)}">Open original TUI</button></div>${conversationActions('agent:'+id)}<div class="collab-native-toolbar"><span class="collab-native-sync">Loading cache…</span><button type="button" class="collab-native-older" disabled>Older history</button><button type="button" class="collab-native-refresh">Refresh</button><button type="button" class="collab-native-interrupt">Stop turn</button></div>`;
  form.hidden=!agent||!['native','pty'].includes(agent.transport);form.querySelector('.collab-note-control').hidden=true;form.querySelector('.collab-upload').hidden=true;form.querySelector('[type=submit]').textContent=agent?.transport==='pty'?'Send to collaboration session':'Send to native session';composer.placeholder=agent?.transport==='pty'?'Send to the persistent independent collaboration session…':'Send to the same exact native session…';composer.value=drafts.get('native:'+id)?.text||'';draftId=drafts.get('native:'+id)?.draftId||crypto.randomUUID();chips.innerHTML='';mentionBox.hidden=true;stream.dataset.signature='';stream.innerHTML='';olderNative=undefined;
  renderApprovals();await refreshNative();
 }
 function renderGroups(){
  if(mode!=='groups')return;
  const signature=JSON.stringify([messengerState.revision,personalFilter,activeFolder,personalSearch,
   groups.map(g=>[g.id,g.name,g.memberIds,g.lastMessage?.text,g.unreadCount,g.updatedAt])]);
  if(signature===oldSignature){sidebar.querySelectorAll('button[data-group]').forEach(node=>node.classList.toggle('active',node.dataset.group===active));return}
  oldSignature=signature;
  sidebar.innerHTML=sortPreferences(groups.filter(group=>filterConversation('group:'+group.id,group.name,group.unreadCount)),group=>'group:'+group.id)
   .map(group=>`<button type="button" role="listitem" class="collab-group-row ${active===group.id?'active':''}" data-group="${esc(group.id)}"><span class="collab-group-mark">${esc(group.name.slice(0,1).toUpperCase())}</span><span class="collab-group-text"><strong data-no-i18n>${esc(group.name)}${prefsFor('group:'+group.id).favorite?' ★':''}</strong><small>${esc(drafts.get(group.id)?.text?'Draft: '+drafts.get(group.id).text.slice(0,50):group.lastMessage?.text||`${group.memberIds.length} agents · No messages yet`)}</small></span><span class="collab-group-meta"><span class="collab-group-time">${group.lastMessage?esc(fmt(group.lastMessage.createdAt)):''}</span>${group.unreadCount?`<span class="collab-unread" aria-label="${group.unreadCount} unread replies">${group.unreadCount>99?'99+':group.unreadCount}</span>`:''}</span></button>`).join('')||'<p class="collab-empty-side">No groups yet. Create one to coordinate native sessions.</p>';
 }
 function messageHtml(item){
  const operator=item.author.kind==='operator',source=item.author.kind==='agent'?item.author.name:kindLabel[item.author.kind]||item.author.name;
  const prefs=messagePrefs('group:'+active,item.id);
  return `<article class="collab-bubble-row ${operator?'is-own':''}" data-message="${esc(item.id)}"><span class="collab-author-icon">${operator?'●':'✳'}</span><div class="collab-bubble"><div class="collab-bubble-head"><strong>${esc(source)}</strong><time>${esc(fmt(item.createdAt))}</time><span class="collab-message-kind">${esc(item.kind)}</span></div>${item.replyTo?`<button type="button" class="collab-quote collab-quote-open" data-open-reply="${esc(item.replyTo)}" title="Open original message"><strong>${esc(item.replyPreview?.authorName||'Reply')}</strong><span data-no-i18n>${esc(item.replyPreview?.text||'Open original message')}</span></button>`:''}<p data-no-i18n>${esc(item.text)}</p>${item.attachments?.length?'<div class="collab-message-files">'+item.attachments.map(file=>'<a download href="./station/download/'+encodeURIComponent(file.stationId)+'" title="'+esc(file.name)+'">'+esc(file.name)+' ('+(file.bytes/1024).toFixed(1)+' KiB)</a>').join('')+'</div>':''}<div class="collab-receipts">${(item.deliveries||[]).map(d=>`<span class="collab-receipt" title="${esc(d.error||d.status)}">${esc(agents.find(a=>a.id===d.agentId)?.name||d.agentId)}: ${esc(d.status)}${['failed','needs_review','awaiting_reply'].includes(d.status)?` <button type="button" data-retry-message="${esc(item.id)}" data-recipient="${esc(d.agentId)}">Retry</button>`:''}</span>`).join('')}</div><div class="collab-bubble-actions"><button type="button" data-reply="${esc(item.id)}">Reply</button><button type="button" data-plan="${esc(item.id)}">Plan this</button><button type="button" data-personal-save="${esc(item.id)}" aria-pressed="${!!prefs.saved}">${prefs.saved?'★ Saved':'☆ Save'}</button><button type="button" data-personal-pin="${esc(item.id)}" aria-pressed="${!!prefs.pinned}">${prefs.pinned?'Unpin':'Pin'}</button><button type="button" data-forward-message="${esc(item.id)}">Forward</button></div></div></article>`;
 }
 function renderHeader(group){
  if(!group){head.innerHTML='<div class="collab-welcome"><h2>Messages</h2><p>Select a group to view the discussion. Native coding sessions keep their original context.</p></div>';stream.innerHTML='';form.hidden=true;return}
  const all=new Map(agents.map(a=>[a.id,a]));
  head.innerHTML=`<div class="collab-head-main"><div><small>SHARED GROUP</small><h2 data-no-i18n>${esc(group.name)}</h2><p data-no-i18n>${esc(group.description||'@ mention an Agent · execution and publication receipts are visible below')}</p></div><button class="collab-edit-group" type="button">Members &amp; settings</button></div>${conversationActions('group:'+group.id)}<div class="collab-member-chips">${group.memberIds.map(id=>{const a=all.get(id);return `<button type="button" class="collab-member-chip" data-open-agent="${esc(id)}" title="Open native Agent session"><img src="./engines/${esc(a?.engine||'codex')}.svg" alt="" draggable="false"><span data-no-i18n>${esc(a?.name||'Missing Agent')}</span><i class="${a?.running?'online':''}"></i></button>`}).join('')||'<span class="collab-no-members">Add Agents in group settings</span>'}</div>`;
  head.insertAdjacentHTML('beforeend',`<div class="collab-group-search"><input type="search" data-group-search maxlength="160" aria-label="Search this group" placeholder="Search messages, authors, attachments…" value="${esc(groupQuery)}"><button type="button" data-clear-search aria-label="Clear search" ${groupQuery?'':'hidden'}>Clear</button></div>`);
  form.hidden=false;form.querySelector('.collab-note-control').hidden=false;form.querySelector('.collab-upload').hidden=false;form.querySelector('[type=submit]').textContent='Send to Agents';composer.placeholder='Write a task… type @ to select Agents';renderApprovals();
 }
 async function refreshGroups(){
  const [g,a,native,pending,state]=await Promise.all([rpc('messages.list'),rpc('hosts.agent-list'),rpc('messages.sessions'),rpc('messages.approvals'),rpc('messenger.state')]);if(disposed)return;
  groups=g;agents=a;nativeSummaries=native;approvals=pending;messengerState=state;
  importServerDrafts();updateFolderOptions();renderApprovals();if(active&&!groups.some(item=>item.id===active))active=null;
  if(mode==='native'){
   renderNativeList();
   // The native tab can be clicked before its read-only catalog finishes
   // loading. Populate it once the catalog arrives, without activating Agents.
   if(!activeNative){const first=agents[0]?.id||nativeSummaries[0]?.sessionId;if(first)await openNative(first)}
  }else renderGroups();
 }
 async function openGroup(id,{preserveDraft=false}={}){
  if(mode==='native'&&activeNative){drafts.set('native:'+activeNative,{text:composer.value,draftId});persistNativeDraft(activeNative,composer.value)}
  else if(active!==id&&!preserveDraft)saveDraft();
  mode='groups';updateSourceTab();
  const group=groups.find(item=>item.id===id);if(!group)return;
  if(active!==id){clearTimeout(searchTimer);active=id;groupQuery='';groupItems=[];olderGroups=undefined;historyEpoch++;stream.dataset.signature='';restoreDraft(id)}
  else if(!composer.value&&drafts.has(id))restoreDraft(id);
  onSelectGroup?.(id);renderGroups();renderHeader(group);
  await refreshHistory(true);
 }
 function markVisibleRead(id,sequence){
  const group=groups.find(item=>item.id===id);
  if(!group||group.readSequence>=sequence||(readClaims.get(id)||0)>=sequence)return;
  readClaims.set(id,sequence);
  void rpc('messages.read',{id,sequence}).then(result=>{
   if(disposed)return;
   const current=groups.find(item=>item.id===id);
   if(current){current.readSequence=result.readSequence;current.unreadCount=result.unreadCount;renderGroups()}
  }).catch(feedback).finally(()=>{if(readClaims.get(id)===sequence)readClaims.delete(id)});
 }
 async function refreshHistory(force=false,{older=false}={}){
  if(mode!=='groups'||!active||disposed)return;
  if(older&&(olderGroups===null||olderBusy))return;
  if(older)olderBusy=true;
  const id=active,query=groupQuery,epoch=historyEpoch;
  const before=older?olderGroups:undefined;
  try{
   const page=await rpc(query?'messages.search':'messages.history',{
    id,limit:100,...(query?{query}:{}),...(older&&before!==undefined?{before}:{})
   });
   if(disposed||mode!=='groups'||active!==id||groupQuery!==query||historyEpoch!==epoch)return;
   const empty=groupItems.length===0;
   if(older||empty)olderGroups=page.nextBefore;
   else if(!query&&page.messages.length){
    // A long-lived conversation can receive over 100 messages while hidden.
    // Restore the gap cursor before older pages become unreachable.
    const first=page.messages[0].sequence;
    const earlier=groupItems.filter(item=>item.sequence<first).at(-1);
    if(earlier&&earlier.sequence+1<first)olderGroups=Math.max(olderGroups||0,first);
   }
   const merged=new Map(groupItems.map(item=>[item.id,item]));
   for(const item of page.messages)merged.set(item.id,item);
   groupItems=[...merged.values()].sort((a,b)=>a.sequence-b.sequence);
   renderReplyLabel();
   const signature=JSON.stringify([messengerState.revision,query,olderGroups,groupItems.map(item=>[
    item.id,item.text,item.kind,item.deliveries,item.attachments
   ])]);
   const nearBottom=stream.scrollHeight-stream.scrollTop-stream.clientHeight<110;
   if(force||signature!==stream.dataset.signature){
    const height=stream.scrollHeight,top=stream.scrollTop;
    stream.dataset.signature=signature;
    const earlier=olderGroups===null?'':`<button type="button" class="collab-load-older" data-load-older>${query?'Earlier search results':'Load earlier messages'}</button>`;
    const body=groupItems.map(messageHtml).join('')||
     `<div class="collab-empty-thread">${query?'No matching messages. Try a different search.':'Write the first task. Send dispatches it to addressed Agents; Notes remain out of band.'}</div>`;
    stream.innerHTML=earlier+body;
    if(older)stream.scrollTop=top+stream.scrollHeight-height;
    else if(force||nearBottom)stream.scrollTop=stream.scrollHeight;
    else stream.scrollTop=top;
   }
   // Opening a conversation at its latest messages acknowledges only the
   // messages actually loaded. Reading older pages or search results does not.
   if(!older&&!query&&!document.hidden&&(empty||nearBottom)&&groupItems.length)
    markVisibleRead(id,groupItems.at(-1).sequence);
  }finally{if(older)olderBusy=false}
 }
 function memberPicker(selected){
  return `<div class="collab-member-picker">${agents.map(agent=>`<label><input type="checkbox" name="member" value="${esc(agent.id)}" ${selected.includes(agent.id)?'checked':''}><img src="./engines/${esc(agent.engine)}.svg" alt=""><span data-no-i18n>${esc(agent.name)}</span><small>${esc(agent.targetHostId||'local')}</small></label>`).join('')||'<p>Create an Agent session before assigning group members.</p>'}</div>`;
 }
 function editGroup(group){
  const dialog=document.createElement('dialog');dialog.className='collab-group-dialog';
  dialog.innerHTML=`<form><header><h2>${group?'Edit group':'Create group'}</h2><button type="button" data-close aria-label="Close">×</button></header><label>Group name<input name="name" maxlength="80" required value="${esc(group?.name||'')}"></label><label>Description<input name="description" maxlength="1000" value="${esc(group?.description||'')}"></label><label class="collab-auto-replies"><input name="autoPublishReplies" type="checkbox" ${!group||group.autoPublishReplies===true?'checked':''}>Auto-publish native final answers to this group</label><strong>Native Agent members</strong>${memberPicker(group?.memberIds||[])}${group?`<label>Group owner<select name="ownerId"><option value="">Unassigned</option>${agents.map(agent=>`<option value="${esc(agent.id)}" ${agent.id===group.ownerId?'selected':''}>${esc(agent.name)}</option>`).join('')}</select><small>To remove the current owner, transfer ownership to another selected member in this same edit.</small></label>`:''}<footer><button type="button" data-close>Cancel</button><button type="submit" class="primary">${group?'Save group':'Create group'}</button></footer></form>`;
  root.append(dialog);
  const close=()=>{dialog.close();dialog.remove()};dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);
  dialog.oncancel=event=>{event.preventDefault();close()};dialog.showModal();dialog.querySelector('[name=name]').focus();
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const submit=dialog.querySelector('[type=submit]');submit.disabled=true;
   try{
    const values={name:dialog.querySelector('[name=name]').value,description:dialog.querySelector('[name=description]').value,
     memberIds:[...dialog.querySelectorAll('[name=member]:checked')].map(input=>input.value),
     autoPublishReplies:dialog.querySelector('[name=autoPublishReplies]').checked,
     ...(group?{ownerId:dialog.querySelector('[name=ownerId]').value||null}:{})};
    if(group&&values.ownerId&&!values.memberIds.includes(values.ownerId))throw Error('Select the new Group owner as a group member first');
    const item=group?await rpc('messages.update',{id:group.id,expectedRevision:group.revision,...values}):await rpc('messages.create',values);
    close();await refreshGroups();await openGroup(item.id,{preserveDraft:false});
   }catch(error){feedback(error);submit.disabled=false}
  };
 }
 async function setConversationPreference(key,field){
  const value=!prefsFor(key)[field],result=await rpc('messenger.conversation',{conversations:[key],patch:{[field]:value}});
  messengerState=result;renderConversationLists();
  const bar=head.querySelector('[data-conversation-key]');
  if(bar?.dataset.conversationKey===key)bar.outerHTML=conversationActions(key);
 }
 function folderEditor(existing){
  const dialog=document.createElement('dialog');dialog.className='collab-personal-dialog';
  const values=[...groups.map(group=>['group:'+group.id,group.name]),...agents.map(agent=>['agent:'+agent.id,agent.name])];
  dialog.innerHTML=`<form><header><h2>${existing?'Edit category':'New category'}</h2><button type="button" data-close aria-label="Close">×</button></header>
   <p>Personal organization only. This does not change group members or native sessions.</p>
   <label>Name<input name="name" required maxlength="80" value="${esc(existing?.name||'')}"></label>
   <label>Auto include<select name="include">${[['explicit','Selected conversations'],['all','All'],['agent','All native sessions'],['group','All groups'],['favorites','Favorites'],['unread','Unread']].map(([key,title])=>`<option value="${key}" ${(existing?.include||'explicit')===key?'selected':''}>${title}</option>`).join('')}</select></label>
   <strong>Specific conversations</strong><div class="collab-personal-members">${values.map(([key,title])=>`<label><input type="checkbox" name="conv" value="${esc(key)}" ${existing?.conversations?.includes(key)?'checked':''}><span data-no-i18n>${esc(title)}</span></label>`).join('')}</div>
   <footer>${existing?'<button type="button" data-delete-folder>Delete category</button>':''}<button type="button" data-close>Cancel</button><button class="primary" type="submit">Save category</button></footer></form>`;
  root.append(dialog);
  const close=()=>{dialog.close();dialog.remove()};
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
  dialog.oncancel=e=>{e.preventDefault();close()};
  const form=dialog.querySelector('form');
  form.onsubmit=async event=>{
   event.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;
   try{
    const saved=await rpc('messenger.folder-save',{...(existing?{id:existing.id,expectedRevision:existing.revision}:{}),
     name:form.elements.name.value,include:form.elements.include.value,
     conversations:[...form.querySelectorAll('[name=conv]:checked')].map(el=>el.value)});
    close();await refreshGroups();activeFolder=saved.id;renderConversationLists();
    toast('Category saved');
   }catch(error){feedback(error);submit.disabled=false}
  };
  if(existing)dialog.querySelector('[data-delete-folder]').onclick=async event=>{
   if(event.currentTarget.dataset.confirm!=='yes'){event.currentTarget.dataset.confirm='yes';event.currentTarget.textContent='Confirm delete';return}
   try{await rpc('messenger.folder-delete',{id:existing.id,expectedRevision:existing.revision});
    activeFolder='';close();await refreshGroups();renderConversationLists();toast('Category deleted');
   }catch(error){feedback(error)}
  };
  dialog.showModal();form.elements.name.focus();
 }
 function forwardEditor(messageId){
  const source=mode==='native'?'agent:'+activeNative:'group:'+active;
  const row=stream.querySelector((mode==='native'?'[data-native-event="':'[data-message="')+CSS.escape(messageId)+'"]');
  const preview=row?.querySelector('.collab-bubble p')?.textContent||'';
  const destinations=[...groups.map(item=>({id:'group:'+item.id,name:item.name,kind:'group'})),
   ...agents.map(item=>({id:'agent:'+item.id,name:item.name,kind:'agent'}))];
  const dialog=document.createElement('dialog');dialog.className='collab-personal-dialog collab-forward-dialog';
  const requestId='forward-'+crypto.randomUUID().replaceAll('-','');
  dialog.innerHTML=`<form><header><h2>Forward message</h2><button type="button" data-close aria-label="Close">×</button></header>
   <p data-no-i18n>${esc(preview.slice(0,1000))}</p>
   <label>Destination<select name="destination">${destinations.map(item=>`<option value="${esc(item.id)}">${item.kind==='group'?'Group · ':'Native Agent · '}${esc(item.name)}</option>`).join('')}</select></label>
   <label>Comment (optional)<textarea name="comment" maxlength="16000" rows="3" placeholder="Context for the recipient"></textarea></label>
   <label class="collab-forward-attachments"><input type="checkbox" name="withAttachments"> Include original Station attachments, when available</label>
   <label class="collab-forward-execution" hidden><input type="checkbox" name="execute"> I authorize a new native Agent model turn; this may incur charges</label>
   <p class="collab-forward-policy"></p><p class="collab-forward-status" aria-live="polite"></p>
   <footer><button type="button" data-check-forward>Check request status</button><button type="button" data-close>Cancel</button><button type="submit" class="primary">Forward</button></footer></form>`;
  root.append(dialog);
  const form=dialog.querySelector('form'),close=()=>{dialog.close();dialog.remove()};
  dialog.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=close);
  dialog.oncancel=e=>{e.preventDefault();close()};
  const label=dialog.querySelector('.collab-forward-execution');
  const status=dialog.querySelector('.collab-forward-status');
  function updateDestination(){
   const agent=form.elements.destination.value.startsWith('agent:');
   label.hidden=!agent;form.elements.execute.required=agent;
   dialog.querySelector('.collab-forward-attachments').hidden=agent;
   if(agent){form.elements.withAttachments.checked=false;
    status.textContent='Native forwarding continues the Agent work session. The existing interactive history is retained.';}
   else status.textContent='Group forwarding creates a note only; it does not mention or run Agents.';
  }
  form.elements.destination.onchange=updateDestination;updateDestination();
  dialog.querySelector('[data-check-forward]').onclick=async()=>{
   try{const statusResult=await rpc('messenger.forward-status',{clientMessageId:requestId});
    status.textContent='Request: '+statusResult.status+(statusResult.error?' · '+statusResult.error:'');
   }catch(error){status.textContent=error.message}
  };
  form.onsubmit=async e=>{
   e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;
   const to=form.elements.destination.value,isAgent=to.startsWith('agent:');
   try{
    if(isAgent&&!form.elements.execute.checked)throw Error('Explicit consent is required before a new Agent model turn');
    const sent=await rpc('messenger.forward',{messages:[{conversation:source,id:messageId}],to,
     comment:form.elements.comment.value,textOnly:!form.elements.withAttachments.checked,
     ...(isAgent?{execute:true}:{}),clientMessageId:requestId});
    close();await refreshGroups();
    if(isAgent){toast('Native Agent accepted the forward · '+sent.turnId);await openNative(to.slice(6))}
    else{toast('Forwarded as a note without starting an Agent');await openGroup(to.slice(6))}
   }catch(error){status.textContent=error.message;button.disabled=false}
  };
  dialog.showModal();form.elements.destination.focus();
 }
 function globalSearch(){
  if(searchDialog?.isConnected){searchDialog.showModal();return}
  const dialog=document.createElement('dialog');dialog.className='collab-personal-dialog collab-global-search';
  dialog.innerHTML=`<section><header><h2>Search conversations</h2><button type="button" data-close aria-label="Close">×</button></header>
   <p>Reads real group messages and existing native Agent histories. Search never runs a model or acknowledges a message.</p>
   <form class="collab-search-toolbar"><input type="search" name="query" maxlength="500" placeholder="Search message text or author" aria-label="Search all messages">
   <select name="filter"><option value="saved">Saved</option><option value="all">All messages</option><option value="pinned">Pinned</option></select>
   <select name="author"><option value="all">Everyone</option><option value="you">You</option><option value="agent">Agents</option></select></form>
   <div class="collab-global-results" aria-live="polite">Searching…</div><footer><button data-close>Close</button></footer></section>`;
  root.append(dialog);searchDialog=dialog;
  const close=()=>{dialog.close();dialog.remove();searchDialog=null};
  dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
  dialog.oncancel=event=>{event.preventDefault();close()};
  const results=dialog.querySelector('.collab-global-results'),form=dialog.querySelector('.collab-search-toolbar');
  form.onsubmit=event=>event.preventDefault();
  let timer=null,epoch=0,offset=0;
  async function load(next=false){
   if(!dialog.isConnected)return;
   if(searchBusy&&next)return;
   const token=++epoch;
   if(!next){offset=0;searchResults=[];results.textContent='Searching…'}
   searchBusy=true;
   try{
    const data=await rpc('messenger.search',{query:form.elements.query.value,filter:form.elements.filter.value,
     author:form.elements.author.value,offset,limit:50});
    if(token!==epoch||!dialog.isConnected)return;
    searchResults.push(...data.messages);
    results.innerHTML=searchResults.map((item,index)=>`<article class="collab-global-result"><header><strong>${esc(item.conversationTitle)}</strong><span>${esc(item.author)} · ${esc(fmt(item.createdAt))}</span></header>
     <p data-no-i18n>${esc(item.text.slice(0,650))}</p><footer><button type="button" data-search-open="${index}">Open conversation</button>${item.preferences?.saved?' <span>★ Saved</span>':''}</footer></article>`).join('')||
     '<p class="collab-empty-thread">No matching messages.</p>';
    if(data.hasMore)results.insertAdjacentHTML('beforeend','<button class="collab-search-more" type="button" data-search-more>Load more results</button>');
    if(data.truncated)results.insertAdjacentHTML('beforeend','<p class="collab-search-capped">Large history was limited to the newest records; narrow your query for precise results.</p>');
   }catch(error){if(token===epoch)results.textContent=error.message}
   finally{if(token===epoch)searchBusy=false}
  }
  form.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>void load(),200)});
  form.addEventListener('change',()=>{clearTimeout(timer);void load()});
  results.addEventListener('click',event=>{
   const more=event.target.closest('[data-search-more]');
   if(more){more.remove();offset=searchResults.length;void load(true);return}
   const clicked=event.target.closest('[data-search-open]');if(!clicked)return;
   const row=searchResults[Number(clicked.dataset.searchOpen)];if(!row)return;
   const destination=row.conversation;close();
   if(destination.startsWith('agent:'))void openNative(destination.slice(6)).catch(feedback);
   else void openGroup(destination.slice(6)).then(()=>{
    const bubble=stream.querySelector('[data-message="'+CSS.escape(row.id)+'"]');
    bubble?.scrollIntoView({block:'center',behavior:'smooth'});
   }).catch(feedback);
  });
  dialog.showModal();form.elements.query.focus();void load();
 }
 const filterBar=q('.collab-messenger-filters');
 filterBar.onclick=event=>{
  const choice=event.target.closest('[data-personal-filter]');
  if(choice){personalFilter=choice.dataset.personalFilter;renderConversationLists();return}
  if(event.target.closest('[data-message-search]')){globalSearch();return}
  if(event.target.closest('[data-folder-create]')){folderEditor(null);return}
  if(event.target.closest('[data-folder-edit]')){const selected=messengerState.folders.find(row=>row.id===activeFolder);if(selected)folderEditor(selected)}
 };
 q('[data-message-folder]').onchange=event=>{activeFolder=event.target.value;renderConversationLists()};
 q('.collab-conversation-quick-search').oninput=event=>{personalSearch=event.target.value.trim();renderConversationLists()};
 sidebar.addEventListener('click',event=>{const button=event.target.closest('[data-group]');if(button)void openGroup(button.dataset.group).catch(feedback);const native=event.target.closest('[data-native-session]');if(native)void openNative(native.dataset.nativeSession).catch(feedback)});
 root.querySelector('.collab-source-tabs').onclick=event=>{const button=event.target.closest('[data-source]');if(!button)return;
  if(button.dataset.source==='channels'){
   if(mode==='groups')saveDraft();else if(mode==='native'&&activeNative)persistNativeDraft(activeNative,composer.value);
   mode='channels';updateSourceTab();return;
  }
  if(button.dataset.source==='native'){const first=activeNative||agents[0]?.id||nativeSummaries[0]?.sessionId;if(first)void openNative(first).catch(feedback);else{saveDraft();mode='native';updateSourceTab();renderHeader(null)}}else{const group=groups.find(item=>item.id===active)||groups[0];if(group){const wasNative=mode==='native';void openGroup(group.id).then(()=>{if(wasNative)restoreDraft(group.id)}).catch(feedback)}else{mode='groups';updateSourceTab();renderHeader(null)}}};
 q('.collab-new-group').onclick=()=>editGroup(null);
 head.addEventListener('click',event=>{
  const pref=event.target.closest('[data-conversation-pref]');
  if(pref){const key=pref.closest('[data-conversation-key]')?.dataset.conversationKey;
   if(key)void setConversationPreference(key,pref.dataset.conversationPref).catch(feedback);return}
  const approve=event.target.closest('[data-approve]');if(approve){const row=approvals.find(item=>(item.id||item.requestId)===approve.dataset.approve&&item.agentId===approve.dataset.agent);if(row){approve.disabled=true;void rpc('hosts.agent-respond',{id:row.targetHostId,session:row.agentId,requestId:approve.dataset.approve,decision:approve.dataset.decision}).then(refreshGroups).catch(feedback).finally(()=>approve.disabled=false)}return}
  if(event.target.closest('[data-clear-search]')){
   clearTimeout(searchTimer);groupQuery='';groupItems=[];olderGroups=undefined;historyEpoch++;stream.dataset.signature='';
   const search=head.querySelector('[data-group-search]');if(search){search.value='';search.focus()}
   const clear=head.querySelector('[data-clear-search]');if(clear)clear.hidden=true;
   void refreshHistory(true).catch(feedback);return;
  }
  if(event.target.closest('.collab-edit-group'))editGroup(groups.find(item=>item.id===active));
  const original=event.target.closest('[data-open-native]');if(original)onOpenAgent?.(original.dataset.openNative);
  if(event.target.closest('.collab-native-refresh'))void refreshNative().catch(feedback);
  if(event.target.closest('.collab-native-interrupt')&&activeNative){const a=agents.find(row=>row.id===activeNative);if(a)void rpc('messages.nativeInterrupt',{id:a.targetHostId,session:a.id}).then(()=>refreshNative()).catch(feedback)}
  if(event.target.closest('.collab-native-older'))void refreshNative({older:true}).catch(feedback);
  const agent=event.target.closest('[data-open-agent]');if(agent)onOpenAgent?.(agent.dataset.openAgent);
 });
 head.addEventListener('input',event=>{
  if(!event.target.matches('[data-group-search]'))return;
  const value=event.target.value.trim();
  const clear=head.querySelector('[data-clear-search]');if(clear)clear.hidden=!value;
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
   if(value===groupQuery)return;
   groupQuery=value;groupItems=[];olderGroups=undefined;historyEpoch++;stream.dataset.signature='';
   void refreshHistory(true).catch(feedback);
  },220);
 });
 stream.addEventListener('click',event=>{
  const saved=event.target.closest('[data-personal-save]'),pinned=event.target.closest('[data-personal-pin]');
  if(saved||pinned){const key=mode==='native'?'agent:'+activeNative:'group:'+active;
   const target=saved||pinned,field=saved?'saved':'pinned',current=messagePrefs(key,target.dataset.personalSave||target.dataset.personalPin)[field];
   void setMessagePreference(key,target.dataset.personalSave||target.dataset.personalPin,field,!current).catch(feedback);return}
  if(event.target.closest('[data-load-older]')){void refreshHistory(false,{older:true}).catch(feedback);return}
  const quoted=event.target.closest('[data-open-reply]');if(quoted){
   const id=active,messageId=quoted.dataset.openReply,target=stream.querySelector(`[data-message="${CSS.escape(messageId)}"]`);
   if(target){target.scrollIntoView({block:'center',behavior:'smooth'});target.classList.add('collab-targeted');setTimeout(()=>target.classList.remove('collab-targeted'),2000);return}
   const dialog=document.createElement('dialog');dialog.className='collab-reference-dialog';
   dialog.innerHTML='<section><header><h3>Original message</h3><button type="button" data-close aria-label="Close">×</button></header><p>Loading published message…</p></section>';
   root.append(dialog);const close=()=>{dialog.close();dialog.remove()};dialog.querySelector('[data-close]').onclick=close;
   dialog.oncancel=event=>{event.preventDefault();close()};dialog.showModal();
   void rpc('messages.entry',{id,messageId}).then(item=>{
    if(!dialog.isConnected||disposed||mode!=='groups'||active!==id){if(dialog.isConnected)close();return}
    dialog.innerHTML=`<section><header><h3>${esc(item.author.name)}</h3><button type="button" data-close aria-label="Close">×</button></header><time>${esc(fmt(item.createdAt))}</time><p data-no-i18n>${esc(item.text)}</p><footer><button type="button" data-reference-reply>Reply to original</button><button type="button" data-close>Close</button></footer></section>`;
    dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    dialog.querySelector('[data-reference-reply]').onclick=()=>{replyTo=item.id;renderReplyLabel();saveDraft();close();composer.focus()};
   }).catch(error=>{close();feedback(error)});return;
  }
  const reply=event.target.closest('[data-reply]');if(reply){replyTo=reply.dataset.reply;renderReplyLabel();saveDraft();composer.focus();}
  const retry=event.target.closest('[data-retry-message]');if(retry){if(!confirm('Retry this one recipient? The previous turn may have completed. Check its history first.'))return;void rpc('messages.retry',{id:active,messageId:retry.dataset.retryMessage,agentId:retry.dataset.recipient}).then(()=>refreshHistory(true)).catch(feedback)}
  const plan=event.target.closest('[data-plan]');if(plan){
   const message=stream.querySelector(`[data-message="${CSS.escape(plan.dataset.plan)}"] p`)?.textContent;
   if(message)onPlanDraft?.({text:message,groupId:active});
  }
 });
 q('.collab-reply-label').onclick=()=>{replyTo=null;q('.collab-reply-label').hidden=true;saveDraft()};
 form.elements.files.onchange=()=>{
  for(const file of form.elements.files.files||[]){if(pendingFiles.length>=8){feedback(Error('Maximum eight files'));break}if(file.size>50*1024*1024){feedback(Error('Files must be at most 50 MiB'));continue}pendingFiles.push(file)}
  form.elements.files.value='';draftId=crypto.randomUUID();renderFiles();saveDraft();
 };
 attachmentPicks.onclick=event=>{const btn=event.target.closest('[data-remove-file]');if(!btn)return;pendingFiles.splice(Number(btn.dataset.removeFile),1);draftId=crypto.randomUUID();renderFiles();saveDraft()};
 chips.addEventListener('click',event=>{const chip=event.target.closest('[data-unmention]');if(chip){mentions.delete(chip.dataset.unmention);renderMentions();saveDraft()}});
 mentionBox.addEventListener('mousedown',event=>event.preventDefault());
 mentionBox.addEventListener('click',event=>{const button=event.target.closest('[data-mention]');if(button)chooseMention(button.dataset.mention)});
 composer.addEventListener('keydown',event=>{if(mentionBox.hidden)return;if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();mentionIndex=(mentionIndex+(event.key==='ArrowDown'?1:-1)+mentionResults.length)%mentionResults.length;drawPicker()}else if(event.key==='Enter'&&mentionResults.length&&!event.shiftKey){event.preventDefault();chooseMention(mentionResults[mentionIndex].id)}else if(event.key==='Escape')mentionBox.hidden=true});
 composer.addEventListener('compositionend',showMentionPicker);
 composer.oninput=()=>{draftId=crypto.randomUUID();if(mode==='native'&&activeNative){
  drafts.set('native:'+activeNative,{text:composer.value,draftId});persistNativeDraft(activeNative,composer.value);
 }else{saveDraft();showMentionPicker()}};
 form.elements.asNote.onchange=saveDraft;
 form.onsubmit=async event=>{
  event.preventDefault();if(!composer.value.trim()&&!(mode==='groups'&&pendingFiles.length))return;
  const button=form.querySelector('[type=submit]'),text=composer.value,groupId=active,key=draftId,source=mode,nativeId=activeNative;
  button.disabled=true;
  try{
   if(source==='native'){
    const agent=agents.find(row=>row.id===nativeId);if(!agent)throw Error('Native session is unavailable');
    if(agent.transport==='native'&&!agent.running)await rpc('hosts.agent-activate',{id:agent.targetHostId,session:agent.id});
    await rpc('messages.nativeSend',{id:agent.targetHostId,session:agent.id,text});
   }else{
    if(!groupId)throw Error('Select a group');
    const files=[];
    for(const file of pendingFiles){
     let id=uploaded.get(file);
     if(!id){const response=await fetch('./station/upload?name='+encodeURIComponent(file.name),{method:'POST',body:file});const data=await response.json();if(!response.ok||data.error)throw Error(data.error||'Attachment upload failed');id=data.id;uploaded.set(file,id)}
     files.push(id);
    }
    await rpc('messages.send',{id:groupId,text,files,replyTo:replyTo||undefined,clientMessageId:key,
     kind:form.elements.asNote.checked?'note':'message',mentions:[...mentions]});
   }
   if(disposed)return;
   if((source==='groups'&&active===groupId||source==='native'&&activeNative===nativeId)&&composer.value===text){composer.value='';replyTo=null;mentions.clear();renderMentions();draftId=crypto.randomUUID();q('.collab-reply-label').hidden=true;if(source==='groups'){drafts.delete(groupId);pendingFiles=[];renderFiles()}else drafts.delete('native:'+nativeId)}
   const cleared=source==='groups'?'group:'+groupId:'agent:'+nativeId;
   queueDraft(cleared,{text:'',expectedClientMessageId:key},true);
   await draftWriters.get(cleared);
   await refreshGroups();if(source==='native')await refreshNative();else await refreshHistory(true);composer.focus();
  }catch(error){feedback(error)}finally{button.disabled=false}
 };
 void refreshGroups().then(()=>{
  // A user may switch to Native sessions while the first group catalog read
  // is still pending. Never reset that selection back to Discussions.
  if(mode==='native')return;
  if(active)return openGroup(active);
  if(groups.length)return openGroup(groups[0].id);
  renderHeader(null);
 }).catch(feedback);
 events=new EventSource('./events');events.onmessage=event=>{
  if(disposed||document.hidden)return;
  let notice;try{notice=JSON.parse(event.data)}catch{return}
  if(notice.kind==='channel-change'){if(mode==='channels')void channelWidget.refresh();return}
  if(!['group-message','group-delivery','agent-event','approval','messenger-change'].includes(notice.kind)||mode==='channels')return;
  if(realtimeTimer)clearTimeout(realtimeTimer);
  realtimeTimer=setTimeout(()=>void refreshGroups().then(()=>mode==='native'?refreshNative():active&&refreshHistory()).catch(feedback),120);
 };
 const onVisible=()=>{if(disposed||document.hidden)return;
  if(mode==='channels'){void channelWidget.refresh();return}
  void refreshGroups().then(()=>mode==='native'?refreshNative():active&&refreshHistory()).catch(feedback)};
 document.addEventListener('visibilitychange',onVisible);
 timer=setInterval(()=>{if(disposed||document.hidden)return;
  if(mode==='channels'){void channelWidget.refresh();return}
  void refreshGroups().then(()=>mode==='native'?refreshNative():active&&refreshHistory()).catch(feedback)},7000);
 return {openGroup,openNative,dispose(){
  if(mode==='native'&&activeNative)persistNativeDraft(activeNative,composer.value);else saveDraft();
  for(const key of draftSnapshots.keys())flushDraft(key);
  disposed=true;clearInterval(timer);clearTimeout(realtimeTimer);clearTimeout(searchTimer);
  for(const timer of draftTimers.values())clearTimeout(timer);
  events?.close();channelWidget.dispose();document.removeEventListener('visibilitychange',onVisible);root.querySelectorAll('dialog').forEach(dialog=>dialog.close())}};
}
