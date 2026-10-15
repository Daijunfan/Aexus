const drafts=new Map(),history=new Map()
export function agentConversation(root,item,rpc,message,onChange){
 let disposed=false,timer,cursor=0,sending=false,latest={busy:item.busy,running:item.running,approvals:[]},approvalKey=''
 const blocks=new Map(),args={id:item.targetHostId,session:item.id}
 root.innerHTML='<div class="agent-conversation-log" role="log" aria-label="Agent 会话记录" tabindex="0"></div><button class="agent-jump" hidden>查看最新输出 ↓</button><div class="agent-approvals"></div><form class="agent-compose"><textarea aria-label="发送给 Agent 的消息" placeholder="输入任务；⌘ / Ctrl + Enter 发送" rows="3"></textarea><div><span class="agent-send-state" role="status">原生执行通道 · 消息原文发送</span><button type="button" class="agent-interrupt">中止任务</button><button type="submit" class="primary">发送</button></div></form>'
 const log=root.querySelector('.agent-conversation-log'),form=root.querySelector('form'),input=form.querySelector('textarea'),send=form.querySelector('[type=submit]'),interrupt=form.querySelector('.agent-interrupt'),jump=root.querySelector('.agent-jump'),approval=root.querySelector('.agent-approvals'),state=root.querySelector('.agent-send-state')
 const cached=history.get(item.id)
 if(cached){cursor=cached.cursor;for(const event of cached.events)append(event)}
 let events=cached?.events.slice()||[],eventBytes=events.reduce((n,event)=>n+JSON.stringify(event).length,0)
 input.value=drafts.get(item.id)||''
 input.oninput=()=>{drafts.set(item.id,input.value);while(drafts.size>32)drafts.delete(drafts.keys().next().value)}
 function append(event){
  if(['approval','approval-resolved'].includes(event.kind))return
  const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<70
  let node=event.itemId?blocks.get(event.itemId):null
  if(!node){
   node=document.createElement('article');node.className='agent-event '+(event.kind==='user'?'is-user':event.kind.startsWith('tool')?'is-tool':event.kind==='error'?'is-error':'')
   const label=document.createElement('small');label.textContent=event.kind==='user'?'你':event.kind.startsWith('tool')?'原生工具':event.kind==='error'?'执行状态':'Codex'
   const content=document.createElement('pre');node.append(label,content);log.append(node);if(event.itemId)blocks.set(event.itemId,node)
  }
  const content=node.querySelector('pre')
  if(event.kind==='delta'||event.kind==='tool-delta')content.textContent=(content.textContent+event.text).slice(-128000)
  else if(event.kind==='tool-result'){content.textContent=(node.dataset.command?node.dataset.command+'\n\n':'')+(event.text||'');node.querySelector('small').textContent='原生工具 · '+(event.exitCode===undefined?'已返回':'退出码 '+event.exitCode)}
  else {content.textContent=(event.text||'').slice(-128000);if(event.kind==='tool')node.dataset.command=event.text||''}
  while(log.children.length>300){const first=log.firstElementChild;for(const [id,value]of blocks)if(value===first)blocks.delete(id);first.remove()}
  if(bottom)log.scrollTop=log.scrollHeight;else jump.hidden=false
 }
 function buttons(){send.disabled=sending||latest.busy||!latest.running;interrupt.disabled=!latest.busy||!latest.running}
 function drawApprovals(){
  const key=JSON.stringify(latest.approvals)
  if(key===approvalKey)return
  approvalKey=key;approval.replaceChildren()
  for(const request of latest.approvals||[]){
   const box=document.createElement('form');box.className='agent-approval';box.dataset.request=request.id
   const questions=request.params.questions,questionRequest=Array.isArray(questions)
   box.innerHTML='<strong>需要你的确认</strong><pre></pre><div class="agent-approval-fields"></div><div class="agent-approval-buttons"></div>'
   box.querySelector('pre').textContent=questionRequest?'请回答引擎的问题':request.params.command||request.params.reason||JSON.stringify(request.params.fileChanges||request.params, null,2).slice(0,8000)
   if(questionRequest){
    for(const question of questions){const label=document.createElement('label');label.textContent=question.question||question.header||question.id;const field=document.createElement('input');field.name=question.id;field.required=true;field.type=question.isSecret?'password':'text';field.placeholder=(question.options||[]).map(option=>option.label).join(' / ');label.append(field);box.querySelector('.agent-approval-fields').append(label)}
    box.querySelector('.agent-approval-buttons').innerHTML='<button type="submit">提交回答</button>'
   }else{
    const available=request.params.availableDecisions
    box.querySelector('.agent-approval-buttons').innerHTML=[['accept','允许本次'],['decline','拒绝'],['cancel','取消任务']].filter(([value])=>!Array.isArray(available)||available.includes(value)).map(([value,label])=>`<button type="submit" value="${value}">${label}</button>`).join('')
   }
   box.onsubmit=async event=>{
    event.preventDefault();if(!box.reportValidity())return
    box.querySelectorAll('button').forEach(button=>button.disabled=true)
    const result=questionRequest?{answers:Object.fromEntries(questions.map(q=>[q.id,{answers:[box.elements.namedItem(q.id).value]}]))}:{decision:event.submitter?.value}
    try{await rpc('hosts.agent-respond',{...args,requestId:request.id,...result});if(disposed)return;box.remove();approvalKey='';await poll()}catch(error){if(!disposed){message(error.message,'error');box.querySelectorAll('button').forEach(button=>button.disabled=false)}}
   }
   approval.append(box)
  }
 }
 let reading=false
 async function poll(){
  if(disposed||reading)return
  reading=true;clearTimeout(timer)
  try{
   const value=await rpc('hosts.agent-read',{...args,cursor});if(disposed)return
   if(value.reset){log.replaceChildren();blocks.clear();events=[];eventBytes=0;cursor=0}
   for(const event of value.events){if(event.seq<=cursor)continue;append(event);events.push(event);eventBytes+=JSON.stringify(event).length;while(events.length>1&&eventBytes>512000)eventBytes-=JSON.stringify(events.shift()).length}
   cursor=value.cursor;latest=value;drawApprovals();buttons()
   state.textContent=value.status==='approval'?'等待确认':value.busy?'执行中 · 可中止当前任务':value.running?'就绪 · 消息原文发送':'会话已停止'
   onChange(value)
  }catch(error){if(!disposed){state.textContent=error.message;latest.running=false;buttons()}}
  finally{reading=false;if(!disposed&&latest.running)timer=setTimeout(()=>void poll(),document.hidden?2000:650)}
 }
 form.onsubmit=async event=>{
  event.preventDefault();if(sending||latest.busy||!input.value.trim())return
  sending=true;buttons();const text=input.value
  try{await rpc('hosts.agent-send',{...args,text});if(disposed)return;if(input.value===text){input.value='';drafts.delete(item.id)}latest.busy=true;await poll()}
  catch(error){if(!disposed){state.textContent=error.message;message('提交状态未确认，消息未自动重发。请查看会话状态后再操作。','error');await poll()}}
  finally{sending=false;if(!disposed)buttons()}
 }
 input.onkeydown=event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'&&!event.isComposing){event.preventDefault();form.requestSubmit()}}
 interrupt.onclick=async()=>{interrupt.disabled=true;try{await rpc('hosts.agent-interrupt',args);await poll()}catch(error){if(!disposed)message(error.message,'error')}finally{if(!disposed)buttons()}}
 jump.onclick=()=>{log.scrollTop=log.scrollHeight;jump.hidden=true}
 log.onscroll=()=>{if(log.scrollHeight-log.scrollTop-log.clientHeight<70)jump.hidden=true}
 buttons();void poll()
 return ()=>{
  disposed=true;clearTimeout(timer);drafts.set(item.id,input.value)
  const saved=[];let size=0
  for(let i=events.length-1;i>=0;i--){const event=events[i];size+=JSON.stringify(event).length;if(size>512000)break;saved.unshift(event)}
  history.delete(item.id);history.set(item.id,{cursor,events:saved});while(history.size>8)history.delete(history.keys().next().value)
 }
}
