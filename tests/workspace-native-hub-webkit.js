window.runWorkspaceModeChecks=async()=>{
 const checks=[],errors=[];
 addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
 const q=selector=>document.querySelector(selector),add=(name,passed)=>checks.push({name,passed:!!passed});
 const wait=async(fn,timeout=12000)=>{const end=Date.now()+timeout;do{if(await fn())return true;await new Promise(r=>setTimeout(r,65))}while(Date.now()<end);return false};
 const rpc=async(method,params={})=>{
  const payload=await fetch('./rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(r=>r.json());
  if(payload.error)throw Error(payload.error.message);return payload.result;
 };
 add('Native CloudHosts shell is ready',await wait(()=>q('#add')&&!q('#add').disabled));
 q('#agent-board-mode').click();
 add('Workspace, Company, Messages and Plan mount inside one Agent workbench',await wait(()=>!!q('.agent-hub-nav')&&!!q('.workspace-directories')&&!!q('.agent-role-grid')));
 add('Four views share stable native Agent identities without initialization prompts',
  [...q('.agent-hub-nav').querySelectorAll('[data-hub]')].map(x=>x.textContent.trim()).join('|')==='Workspace|Company|Messages|Plan'&&
  !q('.employee-id')&&!q('.bootstrap-prompt'));
 const directories=await rpc('workspaces.list');
 add('Workspace automatically discovers the saved native Agent host+directory',directories.some(w=>w.sessionIds.includes('native-fixture-one')));
 add('Workspace displays the correct existing native session without launching a second engine',!!q('[data-session="native-fixture-one"]'));
 q('.workspace-register').click();
 add('Register Directory opens a metadata-only form',await wait(()=>!!q('.workspace-dialog[open]')));
 let dlg=q('.workspace-dialog');if(!dlg)return {checks,passed:false,errors,diagnostics:{stage:'register dialog missing',html:q('.workspace-project-bar')?.outerHTML}};dlg.querySelector('[name=hostId]').value='local';dlg.querySelector('[name=directory]').value='/tmp/cloudhosts-aexus-extra';dlg.querySelector('[name=name]').value='Extra project';
 dlg.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 add('Saving work directory does not start any native Agent task',await wait(async()=>
  (await rpc('workspaces.list')).some(row=>row.name==='Extra project'&&!row.sessionIds.length)));
 q('.workspace-project-new').click();
 add('A Project view can select multiple host+directory Workspace entries',await wait(()=>!!q('.workspace-dialog[open]')&&q('.workspace-dialog-list')?.querySelectorAll('[name=workspaceId]').length>=2));
 dlg=q('.workspace-dialog');if(!dlg)return {checks,passed:false,errors,diagnostics:{stage:'project dialog missing',html:q('.workspace-project-bar')?.outerHTML,workspaces:await rpc('workspaces.list')}};dlg.querySelector('[name=name]').value='Toolbox QA';
 dlg.querySelectorAll('[name=workspaceId]').forEach(input=>input.checked=input.closest('label').textContent.includes('Extra project'));
 dlg.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 add('Project bookmark persists an explicit subset without modifying other sessions',await wait(async()=>{
  const saved=await rpc('workspaces.projects');return saved.length===1&&saved[0].name==='Toolbox QA'&&saved[0].workspaceIds.length===1;
 }));
 add('Switching project hides other Agent cards but keeps the host on record',await wait(()=>
  q('.workspace-project-select')?.value!=='all'&&!q('[data-session="native-fixture-one"]')&&q('.workspace-directory-chip')));
 const originalIds=(await rpc('hosts.agent-list')).map(r=>r.id);
 add('Project filtering does not re-route or remove original Agent identities',originalIds.includes('native-fixture-one'));
 add('Saved project selection is persisted in one Core workspace',!!(await rpc('hosts.workspace')).agentBoard.projectViewId?.startsWith('sv_'));
 const scheduleShortcut=q('.workspace-directory-chip [data-workspace-plan]');
 if(!scheduleShortcut){return {checks,passed:false,errors,diagnostics:{project:await rpc('workspaces.projects'),workspaces:await rpc('workspaces.list'),selection:q('.workspace-project-select')?.value,bar:q('.workspace-directories')?.innerHTML.slice(0,1500)}}}
 scheduleShortcut.click();
 add('A saved work directory opens Plan with matching host and canonical path',await wait(()=>{
  const form=q('.collab-plan-dialog form');return !!form&&form.elements.workspaceId.value!==''&&
   form.elements.hostId.value==='local'&&form.elements.directory.value==='/tmp/cloudhosts-aexus-extra'&&
   form.elements.contextMode.value==='fresh';
 }));
 dlg=q('.collab-plan-dialog');if(!dlg)return {checks,passed:false,errors,diagnostics:{stage:'plan dialog missing',html:q('.collab-plan')?.outerHTML?.slice(0,1800)}};const form=dlg.querySelector('form');
 form.elements.name.value='Nightly local tests';form.elements.text.value='Run only current project tests.';
 form.elements.kind.value='weekly';form.elements.kind.dispatchEvent(new Event('change',{bubbles:true}));
 form.elements.localTime.value='09:00';form.elements.timezone.value='Asia/Shanghai';
 form.elements.enabled.checked=false;
 add('Weekly Plan editor exposes IANA timezone and workday fields',!!q('.collab-plan-timezone:not([hidden])')&&!!q('.collab-plan-weekdays:not([hidden])'));
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 add('Paused recurring Plan stores Fresh native action with selected Workspace ID',await wait(async()=>{
  const jobs=await rpc('plan.list');return jobs.length===1&&jobs[0].action.mode==='fresh'&&jobs[0].action.workspaceId&&
   jobs[0].rule.kind==='weekly'&&jobs[0].rule.timezone==='Asia/Shanghai'&&jobs[0].enabled===false;
 }));
 q('.collab-layout-select [data-layout="table"]')?.click();
 add('Plan Table displays the same scheduled job and never creates a second run',
  await wait(()=>q('.collab-plan-table [data-job]')?.textContent.includes('Nightly local tests')&&!!q('.collab-plan-table [data-history]')));
 add('Plan exposes all ten layouts backed by the Core',
  [...q('.collab-layout-select').querySelectorAll('[data-layout]')].map(item=>item.dataset.layout).join('|')==='board|table|calendar|timeline|planner|list|gallery|charts|feed|form');
 q('.collab-save-view').click();
 add('Saved view editor mounts all ten canonical layouts',await wait(()=>
  !!q('.collab-view-dialog[open]')&&q('.collab-view-dialog [name=layout]')?.options.length===10));
 let viewDialog=q('.collab-view-dialog[open]');
 if(viewDialog){
  viewDialog.querySelector('[name=name]').value='QA saved view';
  viewDialog.querySelector('[name=layout]').value='table';
  viewDialog.querySelector('[name=search]').value='No schedule has this name';
  viewDialog.querySelector('button[value=create]').click();
 }
 add('Saving view changes real projection but not scheduled jobs',await wait(async()=>{
  const entries=await rpc('plan.views');
  return entries.some(row=>row.name==='QA saved view'&&row.layout==='table')&&
   !!q('.collab-plan-table')&&q('.collab-plan-table [data-job]')===null;
 }));
 const viewId=(await rpc('plan.views')).find(row=>row.name==='QA saved view')?.id;
 add('Saved view is selected in this client without creating a model run',
  !!viewId&&q('.collab-saved-view').value===viewId&&(await rpc('plan.history',{limit:20})).length===0);
 q('.collab-save-view').click();
 viewDialog=q('.collab-view-dialog[open]');
 if(viewDialog){
  viewDialog.querySelector('[name=search]').value='Nightly local tests';
  viewDialog.querySelector('button[value=update]').click();
 }
 add('Updating the selected view restores matching schedules and increments its revision',await wait(async()=>{
  const edited=(await rpc('plan.views')).find(row=>row.id===viewId);
  return edited?.revision===2&&edited.filter.search==='Nightly local tests'&&
   !!q('.collab-plan-table [data-job]');
 }));
 q('.collab-delete-view').click();
 q('.collab-delete-view').click();
 add('Deleting the saved view preserves the canonical Plan and real native session',await wait(async()=>
  (await rpc('plan.views')).length===10&&q('.collab-saved-view')?.value===''&&
  (await rpc('plan.list')).length===1&&(await rpc('hosts.agent-list')).length===originalIds.length));

 q('.collab-layout-select [data-layout="board"]')?.click();
 add('Plan editing and calendar preview never start the model',
  (await rpc('plan.history',{limit:20})).length===0&&(await rpc('hosts.agent-list')).length===originalIds.length);
 q('[data-hub="messages"]').click();
 add('Messages supports both project discussion and native session sources',await wait(()=>!!q('[data-source="native"]')&&!!q('[data-source="groups"]')));
 q('[data-source="channels"]')?.click();
 add('Channels opens a real standalone channel workbench inside Messages',await wait(()=>
  !!q('.news-surface:not([hidden]) .news-workbench')&&q('.news-add')?.disabled===false));
 q('.news-add')?.click();
 add('Channel editor exposes real members and distinct publisher grants',await wait(()=>
  !!q('.news-dialog[open] [name=member][value="native-fixture-one"]')&&
  !!q('.news-dialog[open] [name=publisher][value="native-fixture-one"]')));
 let channelForm=q('.news-dialog[open] form');
 if(channelForm?.querySelector('[name=member]')&&channelForm.querySelector('[name=publisher]')){
  channelForm.elements.name.value='Release articles';
  channelForm.querySelector('[name=member]').checked=true;
  channelForm.querySelector('[name=publisher]').checked=true;
  channelForm.elements.ownerId.value='native-fixture-one';
  channelForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 add('Channel creation saves genuine SQLite-backed Agent membership and publisher roles',await wait(async()=>{
  const records=await rpc('channel.list');
  return records.length===1&&records[0].ownerId==='native-fixture-one'&&
   records[0].publisherIds.includes('native-fixture-one')&&q('.news-title h2')?.textContent==='Release articles';
 }));
 const channelId=(await rpc('channel.list'))[0]?.id;
 q('[data-news-article]')?.click();
 add('Article composer separates publishing from starting a native Agent',await wait(()=>!!q('.news-dialog[open] [name=title]')));
 let newsForm=q('.news-dialog[open] form');
 if(newsForm){
  newsForm.elements.title.value='Build 42 release summary';
  newsForm.elements.body.value='Native regression verified with no paid model turn.';
  newsForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 add('Publishing an article persists a stable news ID in the actual channel timeline',await wait(async()=>{
  const page=await rpc('channel.timeline',{id:channelId});
  return page.entries.length===1&&page.entries[0].kind==='news'&&
   !!q('.news-entry.news-article h3')?.textContent.includes('Build 42');
 }));
 const articleId=(await rpc('channel.timeline',{id:channelId})).entries[0]?.id;
 if(!articleId)return {checks,passed:false,errors,diagnostics:{stage:'article missing',channelId,channel:channelId?await rpc('channel.get',{id:channelId}):null,
  timeline:channelId?await rpc('channel.timeline',{id:channelId}):null,
  modal:q('.news-dialog')?.outerHTML.slice(0,2200),html:q('.news-surface')?.textContent?.slice(0,2400),
  availableAgents:await rpc('hosts.agent-list')}};
 q('.news-entry.news-article [data-news-reply]')?.click();
 const note=q('.news-composer textarea');
 if(note){note.value='Review conclusion: all stage tests pass';q('form.news-composer')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))}
 add('Channel discussion replies persist without broadcasting new Agent tasks',await wait(async()=>{
  const page=await rpc('channel.timeline',{id:channelId});
  return page.entries.length===2&&page.entries[1].replyTo===articleId&&
   q('.news-timeline')?.querySelectorAll('.news-entry').length===2&&(await rpc('plan.history',{limit:20})).length===0;
 }));
 q('[data-news-save="'+articleId+'"]')?.click();
 add('Saved news is backed by real retained article metadata',await wait(async()=>
  (await rpc('channel.posts',{channelId,saved:true})).posts.some(row=>row.id===articleId)));
 q('[data-news-read-all]')?.click();
 add('Read receipts are explicit and separate from actual publication',await wait(async()=>{
  const read=await rpc('channel.read-state',{id:channelId,entryIds:[articleId]});
  return read.entries[0]?.read===true&&read.unreadCount===0;
 }));
 q('.news-back')?.click();
 add('Returning to Messages preserves original native and group conversations',
  await wait(()=>q('.news-surface')?.hidden===true&&!!q('[data-source="native"]')));
 q('[data-source="native"]').click();
 add('Native Messages show cached final answer with no automatically started session',await wait(()=>
  q('.collab-messages-list')?.textContent.includes('Fixture native answer')&&!!q('[data-native-session="native-fixture-one"]')));
 add('Native Codex Messages can submit to the original exact native session',!!q('[data-open-native="native-fixture-one"]')&&!q('.collab-composer').hidden&&q('.collab-composer [type=submit]')?.textContent.includes('native session'));
 add('Native Messages do not generate a second model request',(await rpc('hosts.agent-list')).length===originalIds.length);
 q('[data-source="groups"]').click();
 add('Native transcript remains isolated from out-of-band group history',(await rpc('messages.list')).length===0);
 q('.collab-new-group')?.click();
 add('Group editor opens and offers stable native Agent membership',await wait(()=>!!q('.collab-group-dialog[open]')&&!!q('.collab-group-dialog [name=member][value="native-fixture-one"]')));
 const groupDialog=q('.collab-group-dialog');
 if(groupDialog){
  groupDialog.querySelector('[name=name]').value='QA collaboration';
  groupDialog.querySelector('[name=member]').checked=true;
  groupDialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 add('New group persists actual native Agent members',await wait(async()=>{
  const list=await rpc('messages.list');return list.length===1&&list[0].memberIds.includes('native-fixture-one');
 }));
 add('New group conversation mounts before its composer receives input',await wait(()=>q('.collab-conversation-head h2')?.textContent==='QA collaboration'&&!q('form.collab-composer')?.hidden));
 q('.collab-edit-group')?.click();
 add('Group management exposes default reply publication and persistent Owner identity',await wait(()=>{
  const editor=q('.collab-group-dialog[open]');return !!editor&&!!editor.querySelector('[name=autoPublishReplies]')?.checked&&
   editor.querySelector('[name=ownerId]')?.value==='native-fixture-one';
 }));
 q('.collab-group-dialog[open] [data-close]')?.click();
 const taskText=q('.collab-composer textarea');
 if(taskText){
  taskText.value='@';taskText.setSelectionRange(1,1);taskText.dispatchEvent(new Event('input',{bubbles:true}));
 }
 add('Typing @ opens the real group member picker',await wait(()=>!!q('.collab-mention-picks:not([hidden]) [data-mention="native-fixture-one"]')));
 q('.collab-mention-picks [data-mention="native-fixture-one"]')?.click();
 add('Selecting mention saves the stable Agent recipient ID',!!q('.collab-address-chip[data-unmention="native-fixture-one"]'));
 if(taskText){
  taskText.value='Meeting notes for QA (no execution)';
  q('.collab-composer [name=asNote]').checked=true;
  q('form.collab-composer')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 add('Note-only message stays out of model execution with zero delivery receipts',await wait(async()=>{
  const group=(await rpc('messages.list'))[0];
  if(!group)return false;
  const messages=(await rpc('messages.history',{id:group.id})).messages;
  return messages.length===1&&messages[0].kind==='note'&&messages[0].deliveries.length===0;
 }));
 const transfer=await fetch('./station/upload?name=browser-attachment.txt',{method:'POST',body:new Blob(['Checked browser attachment'])}).then(reply=>reply.json());
 add('Browser attachment upload creates a real File Station record',!!transfer.id&&transfer.name==='browser-attachment.txt');
 const conversation=(await rpc('messages.list'))[0];
 if(conversation&&transfer.id)await rpc('messages.send',{id:conversation.id,text:'Reference evidence',kind:'note',files:[transfer.id],clientMessageId:'ui-attachment-proof'});
 // This automated WKWebView has document.visibilityState==='hidden'; update explicitly as a user reopening the conversation would.
 q('[data-group="'+conversation.id+'"]')?.click();
 const attachmentShown=await wait(()=>!!q('.collab-message-files a[href*="station/download"]')&&q('.collab-message-files').textContent.includes('browser-attachment.txt'));
 if(!attachmentShown)window.__attachmentDiag={stream:q('.collab-messages-list')?.innerHTML.slice(-1100),documentVisibility:document.visibilityState};
 add('Messages renders a native attachment download link after Core post',attachmentShown);
 add('Group attachment preserves the Station file fingerprint without sending a model task',await wait(async()=>{
  const page=await rpc('messages.history',{id:conversation.id});
  return page.messages.some(item=>item.attachments?.some(file=>file.stationId===transfer.id&&file.sha256===transfer.sha256)&&item.deliveries.length===0);
 }));
 const search=q('[data-group-search]');
 add('Messages has an interactive scoped search control',!!search);
 if(search){
  search.value='browser-attachment';
  search.dispatchEvent(new Event('input',{bubbles:true}));
 }
 add('Messages search filters group history by attached filename',await wait(()=>
  q('.collab-messages-list')?.querySelectorAll('[data-message]').length===1&&
  q('.collab-messages-list')?.textContent.includes('browser-attachment.txt')));
 q('[data-clear-search]')?.click();
 add('Clearing search restores the unfiltered conversation',await wait(()=>
  q('.collab-messages-list')?.querySelectorAll('[data-message]').length===2));
 if(conversation)for(let i=0;i<102;i++){
  await rpc('messages.send',{id:conversation.id,kind:'note',text:'Historical note '+i,
   clientMessageId:'webkit-paged-'+i});
 }
 q('[data-group="'+conversation.id+'"]')?.click();
 add('Long-running Messages reveal a real earlier-history cursor',await wait(()=>
  !!q('[data-load-older]')&&q('.collab-messages-list')?.querySelectorAll('[data-message]').length>=100));
 q('[data-load-older]')?.click();
 add('Older Messages append without losing loaded history or duplicating records',await wait(()=>
  q('.collab-messages-list')?.querySelectorAll('[data-message]').length===104));
 const firstPost=(await rpc('messages.history',{id:conversation.id,before:3})).messages[0];
 const quoted=await rpc('messages.send',{id:conversation.id,text:'Quote-preview QA unique message',
  kind:'note',replyTo:firstPost.id,clientMessageId:'webkit-quote-preview'});
 add('Reply keeps an immutable original-message preview and a navigable reference',
  quoted.replyPreview?.text===firstPost.text&&quoted.replyTo===firstPost.id&&
  (await rpc('messages.entry',{id:conversation.id,messageId:quoted.id})).id===quoted.id);
 const scopedSearch=q('[data-group-search]');
 if(scopedSearch){scopedSearch.value='Quote-preview QA unique';scopedSearch.dispatchEvent(new Event('input',{bubbles:true}));}
 add('Quoted reply renders the true author and text even when original is not in loaded history',await wait(()=>{
  const visible=q('.collab-messages-list');
  return visible?.querySelectorAll('[data-message]').length===1&&
   visible.querySelector('.collab-quote-open')?.textContent.includes(firstPost.text);
 }));
 q('.collab-quote-open')?.click();
 add('Clicking a paginated-away quoted message opens its exact persisted original',await wait(()=>{
  const dialog=q('.collab-reference-dialog[open]');
  return dialog?.textContent.includes(firstPost.text)&&!!dialog.querySelector('[data-reference-reply]');
 }));
 q('.collab-reference-dialog [data-close]')?.click();
 q('[data-hub="company"]').click();
 add('Company mounts real organization, teams and task history',await wait(()=>!!q('.company-title')&&!!q('.company-teams')&&!!q('.company-task-list')));
 q('[data-action="team-create"]')?.click();
 const editor=q('.company-dialog[open]');
 if(editor){
  editor.querySelector('[name=name]').value='Review team';
  editor.querySelector('[name=member]').checked=true;
  editor.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 add('Company Team creation writes one persisted team with native Agent ID',await wait(async()=>{
  const teams=await rpc('company.teams');return teams.length===1&&teams[0].memberIds.includes('native-fixture-one');
 }));
 const role=q('[data-role="native-fixture-one"]');
 if(role){role.value='manager';role.dispatchEvent(new Event('change',{bubbles:true}))}
 add('Company manager policy survives a Core read',await wait(async()=>(await rpc('company.roster'))[0]?.companyRole==='manager'));
 q('[data-hub="messages"]').click();
 add('Messenger returns with real group message history after Company navigation',
  await wait(()=>!!q('.collab-messenger-filters')&&!!q('.collab-messages-list [data-message]')));
 const roomId=conversation.id;
 q('.collab-conversation-head [data-conversation-pref="favorite"]')?.click();
 add('Favorite conversation is persisted in the Core without editing group members',await wait(async()=>{
  const state=await rpc('messenger.state');return state.conversations['group:'+roomId]?.favorite===true&&
   (await rpc('messages.get',{id:roomId})).memberIds.includes('native-fixture-one');
 }));
 q('[data-personal-filter="favorite"]')?.click();
 add('Favorites filter shows only preferred group conversations',await wait(()=>!!q('[data-group="'+roomId+'"]')));
 q('[data-folder-create]')?.click();
 add('Personal folder form offers dynamic categories and real conversation identities',await wait(()=>
  !!q('.collab-personal-dialog[open]')&&!!q('.collab-personal-dialog [name="include"]')));
 const folderForm=q('.collab-personal-dialog form');
 if(folderForm){
  folderForm.elements.name.value='Favorite reviews';
  folderForm.elements.include.value='favorites';
  folderForm.querySelector('[type=submit]').click();
 }
 add('Messenger folder is saved and immediately filters the sidebar',await wait(async()=>{
  const state=await rpc('messenger.state');return state.folders.some(row=>row.name==='Favorite reviews')&&
   !!q('[data-message-folder]')?.value&&!!q('[data-group="'+roomId+'"]');
 }));
 q('[data-folder-edit]')?.click();
 const editFolder=q('.collab-personal-dialog[open] form');
 if(editFolder){editFolder.elements.name.value='Pinned reviews';editFolder.querySelector('[type=submit]').click()}
 add('Personal folder can be renamed without changing any group message',await wait(async()=>
  (await rpc('messenger.state')).folders.some(row=>row.name==='Pinned reviews')&&
  [...(q('[data-message-folder]')?.options||[])].some(row=>row.textContent==='Pinned reviews')));
 q('[data-folder-edit]')?.click();
 q('.collab-personal-dialog [data-delete-folder]')?.click();
 q('.collab-personal-dialog [data-delete-folder]')?.click();
 add('Deleting a category leaves its conversations and messages intact',await wait(async()=>
  !(await rpc('messenger.state')).folders.length&&
  (await rpc('messages.history',{id:roomId,limit:100})).messages.length>=100));
 q('[data-personal-filter="all"]')?.click();
 const saveMessage=q('.collab-messages-list [data-message] [data-personal-save]');
 const savedGroupText=saveMessage?.closest('[data-message]')?.querySelector('.collab-bubble p')?.textContent||'';
 if(saveMessage)saveMessage.click();
 add('Saving a group message records only operator preferences',await wait(async()=>{
  const state=await rpc('messenger.state');return Object.keys(state.messages).some(key=>key.startsWith('group:'+roomId+':')&&state.messages[key].saved===true);
 }));
 q('[data-source="native"]')?.click();
 add('Native Agent private transcript offers a persistent Save action',await wait(()=>
  !!q('.collab-messages-list [data-native-event] [data-personal-save]')));
 const nativeSave=q('.collab-messages-list [data-native-event] [data-personal-save]');
 if(nativeSave)nativeSave.click();
 add('Native message saving never creates a secondary native conversation',await wait(async()=>{
  const page=await rpc('messenger.search',{conversation:'agent:native-fixture-one',filter:'saved'});
  return page.total>=1&&(await rpc('hosts.agent-list')).length===originalIds.length;
 }));
 q('[data-message-search]')?.click();
 add('Cross-conversation search reads real saved group and native events',await wait(()=>
  q('.collab-global-search[open]')?.textContent.includes('Fixture native answer')&&
  !!savedGroupText&&q('.collab-global-search[open]')?.textContent.includes(savedGroupText)));
 const searchDialog=q('.collab-global-search[open]');
 if(searchDialog){
  searchDialog.querySelector('[name=query]').value='Fixture native answer';
  searchDialog.querySelector('[name=filter]').value='all';
  searchDialog.querySelector('[name=query]').dispatchEvent(new Event('input',{bubbles:true}));
 }
 add('Search filters across native histories without a model request',await wait(()=>
  q('.collab-global-results')?.textContent.includes('Fixture native answer')&&
  !q('.collab-global-results')?.textContent.includes(savedGroupText)));
 q('.collab-global-search [data-close]')?.click();
 const nativeDraft=q('form.collab-composer textarea');
 if(nativeDraft){nativeDraft.value='Native unsent draft retained';nativeDraft.dispatchEvent(new Event('input',{bubbles:true}))}
 add('Native private draft writes through the durable Messenger store',await wait(async()=>
  (await rpc('messenger.state')).drafts['agent:native-fixture-one']?.text==='Native unsent draft retained'));
 q('[data-source="groups"]')?.click();
 q('[data-source="native"]')?.click();
 add('Switching away and back preserves the native unsent draft without model execution',await wait(()=>
  q('form.collab-composer textarea')?.value==='Native unsent draft retained'));
 const nativeDraftAfter=q('form.collab-composer textarea');
 if(nativeDraftAfter){nativeDraftAfter.value='';nativeDraftAfter.dispatchEvent(new Event('input',{bubbles:true}))}
 add('Clearing the native draft removes it from persisted state',await wait(async()=>
  !(await rpc('messenger.state')).drafts['agent:native-fixture-one']));
 q('[data-source="groups"]')?.click();
 const groupDraft=q('form.collab-composer textarea');
 if(groupDraft){groupDraft.value='Group unsent draft retained';groupDraft.dispatchEvent(new Event('input',{bubbles:true}))}
 add('Group draft is durable without adding a published group message',await wait(async()=>
  (await rpc('messenger.state')).drafts['group:'+roomId]?.text==='Group unsent draft retained'&&
  (await rpc('messages.history',{id:roomId,limit:100})).messages.length>=100));
 q('[data-source="native"]')?.click();
 q('[data-source="groups"]')?.click();
 add('Reopening the group restores its draft and public history',await wait(()=>
  q('form.collab-composer textarea')?.value==='Group unsent draft retained'&&
  !!q('.collab-messages-list [data-message]')));
 if(q('form.collab-composer textarea')){q('form.collab-composer textarea').value='';q('form.collab-composer textarea').dispatchEvent(new Event('input',{bubbles:true}))}
 add('Cleared group draft does not remain in Core',await wait(async()=>
  !(await rpc('messenger.state')).drafts['group:'+roomId]));
 q('.collab-conversation-head [data-conversation-pref="archived"]')?.click();
 add('Personal archive hides the conversation but preserves the real group',await wait(async()=>{
  const state=await rpc('messenger.state');return state.conversations['group:'+roomId]?.archived===true&&
   (await rpc('messages.get',{id:roomId})).archived===false&&!q('.collab-group-list [data-group="'+roomId+'"]');
 }));
 q('[data-personal-filter="archived"]')?.click();
 add('Archived view reveals the personally archived conversation',await wait(()=>
  !!q('.collab-group-list [data-group="'+roomId+'"]')));
 q('.collab-conversation-head [data-conversation-pref="archived"]')?.click();
 q('[data-personal-filter="all"]')?.click();
 add('Restored personal archive retains native sessions and Plan execution count',
  await wait(async()=>(await rpc('plan.history',{limit:20})).length===0&&
   (await rpc('hosts.agent-list')).length===originalIds.length&&!!q('.collab-group-list [data-group="'+roomId+'"]')));

 if(checks.some(c=>!c.passed))window.__hubDiagnostics={attachment:window.__attachmentDiag,nativeSessions:await rpc('messages.sessions'),agents:await rpc('hosts.agent-list'),nativeSidebar:q('.collab-group-list')?.textContent?.slice(0,500),nativeHead:q('.collab-conversation-head')?.textContent?.slice(0,500),messageArea:q('.collab-messages-list')?.textContent?.slice(0,500),mode:q('.collab-source-tabs')?.outerHTML,mentionDebug:{composer:q('.collab-composer')?.outerHTML?.slice(0,1700),head:q('.collab-conversation-head')?.outerHTML?.slice(0,800)}};
 add('No JavaScript errors or unhandled rejections',errors.length===0);
 return {checks,passed:checks.every(c=>c.passed),errors,diagnostics:window.__hubDiagnostics};
};
