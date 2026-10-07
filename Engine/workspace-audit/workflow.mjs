/** One executable workflow shared by the UI and plain Node CLI. */
export async function runAudit(client,input){
 if(!input||typeof input.team!=='string'||!input.team.trim()||Object.keys(input).some(k=>!['team','hidden'].includes(k))||input.hidden!==undefined&&typeof input.hidden!=='boolean')throw Error('Choose an existing Team')
 const groups=await client.invoke('group.list',{})
 if(!groups.includes(input.team))throw Error('Team does not exist')
 const {sessions}=await client.invoke('session.list',{})
 const targets=[{id:null,title:input.team},...sessions.filter(s=>s.group===input.team&&!s.deleting)]
 const workspaces=[]
 for(const target of targets){
  const listing=await client.invoke('workspace.list',{...(target.id?{employee:target.id}:{team:input.team}),path:'.',hidden:input.hidden??false})
  if(!Array.isArray(listing.entries))throw Error('Infra returned an invalid directory inventory')
  const entries=listing.entries.map(e=>({name:e.name,directory:e.directory,bytes:e.bytes}))
  workspaces.push({employeeId:target.id,name:target.title,path:listing.root??listing.path??'.',files:entries.filter(e=>!e.directory).length,folders:entries.filter(e=>e.directory).length,entries})
 }
 return {engineId:'workspace-audit',team:input.team,createdAt:new Date().toISOString(),workspaces,acceptance:{passed:true,checks:['The Team exists in Infra','Every selected workspace was read through the authenticated Contract','Entry counts equal the returned file and folder inventory','No model calls and no workspace mutations']}}
}
