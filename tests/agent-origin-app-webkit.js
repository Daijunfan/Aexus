window.runWorkspaceModeChecks=async()=>{
 const checks=[],errors=[],assert=(name,result)=>checks.push({name,passed:!!result});
 window.addEventListener('error',e=>errors.push(e.message))
 window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)))
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const wait=async(predicate,maxMs=17000)=>{const deadline=Date.now()+maxMs;while(Date.now()<deadline){if(predicate())return true;await pause(65)}return predicate()}
 const q=s=>document.querySelector(s)
 await wait(()=>!q('#add')?.disabled)
 q('#agent-board-mode').click()
 await wait(()=>!!q('[data-host="local"] [data-add-role]'))
 q('[data-host="local"] [data-add-role]').click()
 assert('Real application Agent create dialog opens inside the fully initialized workspace',await wait(()=>!!q('.agent-create-dialog')&&!!q('#agent-source')))
 const target=q('#agent-target'),source=q('#agent-source'),engine=q('#agent-engine'),start=q('#agent-start')
 assert('Custom styled Engine Origin selector is wired into the real application',await wait(()=>!!source.closest('.styled-select')?.querySelector('.styled-select-trigger')))
 const options=()=>[...source.options].map(o=>({value:o.value,disabled:o.disabled,name:o.textContent}))
 assert('The local Mac has only the Mac origin, enabled in the actual application',options().length===1&&options()[0].value==='local'&&!options()[0].disabled)
 const localCaps=await wait(()=>[...engine.options].some(o=>o.value==='cline')&&!start.disabled)
 assert('Installed Mac Cline CLI appears in real UI as a clickable engine, never Uninstalled',localCaps&&[...engine.options].some(o=>o.value==='cline'&&!o.disabled))
 const choose=(select,value)=>{
  const trigger=select.closest('.styled-select')?.querySelector('.styled-select-trigger')
  if(!trigger)return false
  trigger.click()
  const entries=[...document.querySelectorAll('.styled-select-menu .styled-select-option')]
  const index=[...select.options].findIndex(o=>o.value===value)
  const option=entries[index]
  if(!option||option.disabled)return false
  option.click();return true
 }
 assert('GPU target can be clicked through native styled dropdown',choose(target,[...target.options].find(o=>o.textContent.includes('GPU Probe'))?.value))
 assert('Remote target exposes exactly Mac and the selected GPU origin as live options',await wait(()=>options().length===2&&options()[0].value==='local'&&options()[1].value===target.value&&options().every(o=>!o.disabled)))
 assert('User can click Mac Engine Origin through the real dropdown',choose(source,'local'))
 assert('Verified Mac Codex → GPU target enables Create & Connect without route-warning gray state',await wait(()=>source.value==='local'&&engine.value==='codex'&&!start.disabled,23000))
 assert('All four verified Mac engines are available for the GPU work host without disabled choices',
  [...engine.options].map(o=>o.value).join('|')==='codex|claude|cline|pi'&&[...engine.options].every(o=>!o.disabled))
 assert('Pi can be selected through its native styled dropdown',choose(engine,'pi'))
 assert('Route preview names the selected Pi engine',q('.agent-route-preview')?.textContent.includes('Pi')&&!q('.agent-route-preview')?.textContent.includes('Codex'))
 choose(engine,'codex')
 assert('Selected target supplies its own real absolute directory',q('#agent-directory').value==='/tmp')
 window.originDebug={target:target.value,source:source.value,engine:engine.value,disabled:start.disabled,origins:options(),route:q('#agent-engine-status')?.textContent,routePreview:q('.agent-route-preview')?.textContent,probe:q('[data-probe]')?.disabled,engineOptions:[...engine.options].map(o=>[o.value,o.disabled])}
 const originDialog=q('.agent-create-dialog')
 originDialog.querySelector('[data-close]').click()
 await pause(150)
 assert('Closing the create dialog did not start an Agent or affect user sessions',!q('.agent-create-dialog')&&!q('.agent-inspector'))
 return {passed:checks.every(x=>x.passed)&&!errors.length,checks,errors,diagnostic:window.originDebug}
}
