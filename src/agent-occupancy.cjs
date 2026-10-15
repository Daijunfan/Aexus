// Shared in-Core reservation across Messages, Company delegation and Plan.
// The lease survives native submission and is released by its exact terminal event.
const byAgent=new Map(),byWorkspace=new Map(),byOwner=new Map();
const workspace=(host,directory)=>host&&directory?JSON.stringify([host,directory]):null;
function acquire({agentId,hostId,directory,owner}){
 if(typeof owner!=='string'||!owner||byOwner.has(owner))throw Error('Invalid or duplicate run reservation');
 const key=workspace(hostId,directory);
 if(agentId&&byAgent.has(agentId))throw Error('Agent already has a scheduled or delegated run in progress');
 if(key&&byWorkspace.has(key))throw Error('Workspace is busy with another Agent run');
 const token={agentId,workspace:key,owner};
 if(agentId)byAgent.set(agentId,token);
 if(key)byWorkspace.set(key,token);
 byOwner.set(owner,token);
 return token;
}
function release(owner){
 const token=byOwner.get(owner);if(!token)return false;
 if(token.agentId&&byAgent.get(token.agentId)===token)byAgent.delete(token.agentId);
 if(token.workspace&&byWorkspace.get(token.workspace)===token)byWorkspace.delete(token.workspace);
 byOwner.delete(owner);return true;
}
function occupied({agentId,hostId,directory}){
 const key=workspace(hostId,directory);
 return (agentId&&byAgent.has(agentId))||(key&&byWorkspace.has(key))||false;
}
module.exports={acquire,release,occupied};
