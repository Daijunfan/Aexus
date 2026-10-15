window.runAgentBoardChecks=async()=>{
 const checks=[],probes=[],created=[],messageList=[]
 const record=(name,passed)=>checks.push({name,passed:!!passed})
 const pause=ms=>new Promise(r=>setTimeout(r,ms))
 const wait=async test=>{for(let i=0;i<70;i++){if(test())return true;await pause(40)}return test()}
 const hosts=[
  {id:'local',name:'本地主机',os:'macos',host:'local-mac',defaultDirectory:'/Users/mac',local:true},
  {id:'gpu',name:'GPU-server',os:'linux',host:'gpu.invalid',defaultDirectory:'/srv/project'},
  {id:'win',name:'DJF-Windows',os:'windows',host:'windows.invalid',defaultDirectory:'C:\\work'},
  {id:'other',name:'Other Cloud',os:'linux',host:'other.invalid',defaultDirectory:'/home/other'}
 ]
 const caps={engines:{codex:true,claude:true,cline:true,pi:true},transparentRouting:{codex:true,claude:false,cline:false,pi:false},routingVerified:true,routingNote:'native protocol ready'}
 let records=[],sequence=0
 const rpc=async(method,args={})=>{
  if(method==='hosts.agent-hosts')return structuredClone(hosts)
  if(method==='hosts.agent-list')return structuredClone(records)
  if(method==='hosts.workspace')return {agentBoard:{roleOrder:{}}}
  if(method==='hosts.agent-capabilities'){
   probes.push({...args})
   return {...structuredClone(caps),transparentRouting:{...caps.transparentRouting,codex:args.id==='local'&&args.targetHostId!=='local'},routingVerified:args.id==='local'&&args.targetHostId!=='local',hostId:args.id}
  }
  if(method==='hosts.agent-open'){
   created.push({...args});const target=hosts.find(h=>h.id===args.targetHostId),source=hosts.find(h=>h.id===args.engineHostId)
   const role={id:'new-'+(++sequence),name:args.name,engine:args.engine,targetHost:target,engineHost:source,engineHostId:source.id,targetHostId:target.id,cwd:args.directory,transport:args.engine==='codex'?'native':'pty',threadId:'thread-'+sequence,running:false,status:'stopped'}
   records.push(role);return role
  }
  if(method==='hosts.agent-activate')return {removed:true,reason:'Fixture does not launch an Agent'}
  throw Error('Unsupported fixture RPC '+method)
 }
 const root=document.querySelector('#root');root.classList.add('board-workbench')
 const pane=window.cloudClients['agent-board']
 const board=pane(root,hosts,rpc,text=>messageList.push(text),'local',{agentBoard:{hosts:['local','gpu','win'],columns:2,initialized:true}},async()=>{})
 const q=s=>root.querySelector(s)
 await wait(()=>!!q('[data-host="local"] [data-add-role]'))
 q('[data-host="local"] [data-add-role]').click()
 record('On a local Mac work host, Engine Origin exposes exactly one enabled choice',
  [...q('#agent-source').options].map(x=>x.value).join(',')==='local'&&[...q('#agent-source').options].every(x=>!x.disabled))
 record('Local Mac source is explicitly labeled Mac, not a cloud or anonymous ID',q('#agent-source').options[0]?.textContent.includes('Mac'))
 await wait(()=>!q('#agent-start').disabled)
 record('Installed local Cline is selectable instead of Uninstalled and gray',
  q('#agent-engine option[value=cline]')&&!q('#agent-engine option[value=cline]').disabled)
 record('All four installed local engines can be selected with native `<select>`',
  [...q('#agent-engine').options].map(x=>x.value).join('|')==='codex|claude|cline|pi'&&
  [...q('#agent-engine').options].every(x=>!x.disabled))
 q('#agent-target').value='gpu';q('#agent-target').dispatchEvent(new Event('change',{bubbles:true}))
 await wait(()=>probes.some(x=>x.id==='gpu'))
 record('GPU-server work host offers exactly the remote engine host and Mac',
  [...q('#agent-source').options].map(x=>x.value).join('|')==='local|gpu'&&[...q('#agent-source').options].every(x=>!x.disabled))
 record('No other cloud is exposed as a forbidden gray Engine Origin',!q('#agent-source option[value=other]')&&!q('#agent-source option[value=win]'))
 record('Same-host GPU Cline is clickable when its native CLI is installed',q('#agent-source').value==='gpu'&&
  [...q('#agent-engine').options].some(x=>x.value==='cline'&&!x.disabled))
 q('#agent-source').value='local';q('#agent-source').dispatchEvent(new Event('change',{bubbles:true}))
 await wait(()=>!q('#agent-start').disabled)
 record('Clicking Mac Engine Origin makes verified Mac Codex → GPU creation possible',
  q('#agent-source').value==='local'&&!q('#agent-start').disabled&&q('#agent-engine').value==='codex')
 record('Mac remote engines list contains only Codex, without disabled Claude/Cline/Pi items',
  [...q('#agent-engine').options].map(x=>x.value).join('|')==='codex')
 const original=q('#agent-directory').value
 q('#agent-name').value='Mac Codex to GPU';q('#agent-directory').value='/srv/project'
 q('.agent-create').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 record('Mac Codex role is submitted to GPU with distinct source and work host IDs',await wait(()=>created.length===1)&&
  created[0].engineHostId==='local'&&created[0].targetHostId==='gpu'&&created[0].engine==='codex'&&created[0].directory==='/srv/project')
 await wait(()=>!!q('[data-host="local"] [data-add-role]')&&!q('.agent-create-dialog'))
 q('[data-host="local"] [data-add-role]').click()
 q('#agent-target').value='win';q('#agent-target').dispatchEvent(new Event('change',{bubbles:true}))
 q('#agent-source').value='local';q('#agent-source').dispatchEvent(new Event('change',{bubbles:true}))
 record('Mac origin remains clickable when switching work target to Windows',await wait(()=>!q('#agent-start').disabled)&&
  [...q('#agent-source').options].map(x=>x.value).join('|')==='local|win')
 record('Changing work target updates its directory but does not rewrite user files',q('#agent-directory').value==='C:\\work')
 board.dispose()
 return {checks,passed:checks.every(x=>x.passed),probes,created,messageList}
}
