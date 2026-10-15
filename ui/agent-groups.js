// Workgroups contain hosts. Native sessions are independent of group membership.
import {esc} from './agent-model.js'
export function agentGroupsPane(root,hosts,rpc,toast,selected,initialState,saveWorkspace,loadBoard){
 let state=initialState,disposed=false,current=null,generation=0;
 root.classList.add('agent-groups');
 const report=error=>{if(!disposed)toast(error.message||String(error),'error')};
 async function change(patch){
  try{state=await saveWorkspace(patch);if(!disposed)void show()}catch(error){report(error)}
 }
 async function show(){
  const version=++generation;
  current?.dispose();current=null;
  const groups=state.agentBoard.groups,group=groups.find(item=>item.id===state.agentBoard.activeGroup);
  root.innerHTML=`<div class="board-groups"><nav class="board-group-tabs" aria-label="工作组">${groups.map(item=>`<button data-group="${esc(item.id)}" role="tab" aria-selected="${item.id===group.id}" data-no-i18n>${esc(item.name)}</button>`).join('')}</nav><button id="agent-group-new">＋ 新建工作组</button><button id="agent-group-settings" aria-expanded="false">工作组设置</button></div>
   <form class="board-new-form" hidden><label>工作组名称<input name="name" required maxlength="80" value="工作组 ${groups.length+1}" data-no-i18n></label><button class="primary" type="submit">创建工作组</button><button type="button" data-cancel>取消</button></form>
   <form class="board-settings" hidden><label>工作组名称<input name="name" required maxlength="80" value="${esc(group.name)}" data-no-i18n></label><label>每行主机列数<select id="agent-group-columns" name="columns" aria-label="每行主机列数">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===group.columns?'selected':''}>${n} 列</option>`).join('')}</select></label><button class="primary" type="submit">保存设置</button><button id="agent-group-delete" class="danger" type="button" ${groups.length===1?'disabled':''}>移除工作组</button></form>
   <div class="agent-group-content"></div>`;
  const q=selector=>root.querySelector(selector),content=q('.agent-group-content');
  root.querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>void change({activeAgentGroup:button.dataset.group}));
  q('#agent-group-new').onclick=()=>{q('.board-new-form').hidden=false;q('.board-new-form input').focus();q('.board-new-form input').select()};
  q('[data-cancel]').onclick=()=>{q('.board-new-form').hidden=true};
  q('.board-new-form').onsubmit=async event=>{
   event.preventDefault();const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;
   await change({createAgentGroup:{name:q('.board-new-form input').value}});button.disabled=false;
  };
  q('#agent-group-settings').onclick=()=>{const form=q('.board-settings');form.hidden=!form.hidden;q('#agent-group-settings').setAttribute('aria-expanded',String(!form.hidden))};
  q('.board-settings').onsubmit=async event=>{
   event.preventDefault();await change({agentGroupId:group.id,agentGroupPatch:{name:q('.board-settings input').value,columns:Number(q('#agent-group-columns').value)}});
  };
  q('#agent-group-delete').onclick=event=>{
   const button=event.currentTarget;
   if(!button.dataset.confirm){button.dataset.confirm='1';button.textContent='确认移除此工作组';return}
   void change({removeAgentGroup:group.id});
  };
  try{
   const board=await loadBoard('agent-board');
   if(disposed||version!==generation)return;
   current=board(content,hosts,rpc,toast,selected,state,async patch=>{
    const next=await saveWorkspace({...patch,agentGroupId:group.id});
    if(!disposed)state=next;
    return next;
   });
  }catch(error){if(version===generation)report(error)}
 }
 void show();
 return {focus(id){current?.focus?.(id)},dispose(){disposed=true;generation++;current?.dispose();current=null;root.classList.remove('agent-groups')}};
}
