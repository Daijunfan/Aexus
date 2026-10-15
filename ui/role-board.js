// Company, Messages and Plan use one original Aexus client and Core.
// Native Coding Agent sessions belong exclusively to Agent Board.
import {aexusEmbed} from './aexus-embed.js';

export function roleBoardPane(root,rpc,toast,workspace,saveWorkspace,options={}){
 let disposed=false,tab=options.roleId?'messages':workspace.roleBoard?.tab||'company';
 root.classList.add('role-workspace');
 root.innerHTML='<div class="agent-hub"><nav class="agent-hub-nav" role="tablist" aria-label="Role Board"><button data-role-view="company" role="tab" type="button">Company</button><button data-role-view="messages" role="tab" type="button">Messages</button><button data-role-view="plan" role="tab" type="button">Plan</button></nav><div class="aexus-embed-content"></div></div>';
 const report=error=>{if(!disposed)toast(error.message||String(error),'error')};
 const embed=aexusEmbed({root:root.querySelector('.aexus-embed-content'),rpc,message:toast,
  onNavigation:view=>select(view,true)});
 function select(view,fromAexus=false){
  if(disposed||!['company','messages','plan'].includes(view))return;
  tab=view;
  root.querySelectorAll('[data-role-view]').forEach(button=>{
   const active=button.dataset.roleView===view;
   button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));
  });
  if(workspace.roleBoard?.tab!==view){
   workspace.roleBoard={tab:view};
   void saveWorkspace({roleBoardPatch:{tab:view}}).catch(report);
  }
  if(!fromAexus){
   const roleId=options.roleId;options={};
   void embed.navigate(view,roleId?{roleId}:{}).catch(report);
  }
 }
 root.querySelector('nav').onclick=event=>{const button=event.target.closest('[data-role-view]');if(button)select(button.dataset.roleView)};
 embed.setVisible(true);select(tab);
 return {flush:()=>embed.flush(),dispose(){disposed=true;embed.dispose();root.classList.remove('role-workspace')}};
}
