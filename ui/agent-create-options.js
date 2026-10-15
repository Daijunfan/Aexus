// Creation choices describe actual *permitted* execution paths, not arbitrary
// cloud-to-cloud routing. The local controller is the only cross-host source.
export const codingEngines=['codex','claude','cline','pi']
export function sourceChoices(hosts,targetId){
 const target=hosts.find(host=>host.id===targetId)
 if(!target)throw Error('Select a registered work host')
 const local=hosts.find(host=>host.id==='local')
 return target.id==='local'?[target]:local?[local,target]:[target]
}
export function sourceLabel(host){
 if(host.id!=='local')return host.name
 return host.os==='macos'?'Mac 本地':host.os==='windows'?'Windows 本机':'本机'
}
export function permittedEngines(originId,targetId,capability){
 const candidates=codingEngines
 return capability?candidates.filter(engine=>capability.engines?.[engine]&&(originId===targetId||capability.transparentRouting?.[engine])):candidates
}
export function canCreateAgent(originId,targetId,engine,capability){
 if(!capability?.engines?.[engine])return false
 if(originId===targetId)return codingEngines.includes(engine)
 return originId==='local'&&targetId!=='local'&&codingEngines.includes(engine)&&
   capability.routingVerified===true&&capability.transparentRouting?.[engine]===true
}
