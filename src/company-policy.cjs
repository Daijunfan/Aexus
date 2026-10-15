// Action + scope authority adapted from Aexus src/shared/roles.ts and
// src/main/authorization.ts. This module has no independent data store.
// Company membership, role assignments and native identity remain authoritative.
const VERSION='company-policy/1';
const members=Object.freeze({
 worker: Object.freeze({scope:'self',read:[],delegate:[],schedule:[],configure:[],teamMembership:[]}),
 manager: Object.freeze({scope:'team',read:['worker','manager'],delegate:['worker'],schedule:['worker'],configure:['worker'],teamMembership:['worker']}),
 coordinator: Object.freeze({scope:'global',read:['worker','manager','coordinator'],delegate:['worker','manager'],schedule:['worker','manager'],configure:['worker','manager'],teamMembership:['worker','manager']}),
 administrator: Object.freeze({scope:'global',read:['worker','manager','coordinator','administrator'],delegate:['worker','manager','coordinator'],schedule:['worker','manager','coordinator'],configure:['worker','manager','coordinator'],teamMembership:['worker','manager','coordinator']}),
});
const ACTIONS=Object.freeze(['read','delegate','schedule','configure','teamMembership']);
const SELF_ACTIONS=new Set(['read','delegate','schedule']);
function policy(role){
 if(!Object.hasOwn(members,role))throw Error('Unknown Company role policy');
 return members[role];
}
/** Aexus-style action distinctions. Geometry and visual bindings never grant access. */
function can({requester,targetId,action='delegate',roster,teams}={}){
 if(!ACTIONS.includes(action))throw Error('Unknown Company management action');
 if(requester?.kind==='operator')return true;
 if(requester?.kind!=='agent'||typeof targetId!=='string')return false;
 const source=roster.find(row=>row.id===requester.agentId);
 const target=roster.find(row=>row.id===targetId);
 if(!source||!target)return false;
 if(source.id===target.id)return SELF_ACTIONS.has(action);
 const rules=policy(source.companyRole||'worker');
 if(!rules[action].includes(target.companyRole||'worker'))return false;
 if(rules.scope==='global')return true;
 if(rules.scope!=='team')return false;
 return teams.some(team=>team.memberIds.includes(source.id)&&team.memberIds.includes(target.id));
}
function allowedTargets(requester,action,roster,teams){
 return roster.filter(row=>can({requester,targetId:row.id,action,roster,teams})).map(row=>row.id);
}
module.exports={VERSION,policy,ACTIONS,can,allowedTargets};
