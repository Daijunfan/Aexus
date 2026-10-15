window.runWorkspaceModeChecks=async function(){
 const checks=[],issues=[],untranslated={}
 window.addEventListener('error',e=>issues.push(e.message))
 window.addEventListener('unhandledrejection',e=>issues.push(String(e.reason)))
 const check=(name,pass)=>checks.push({name,passed:!!pass})
 const pause=()=>new Promise(resolve=>setTimeout(resolve,90))
 const wait=async(test,limit=8500)=>{const end=Date.now()+limit;do{if(await test())return true;await pause()}while(Date.now()<end);return false}
 const rpc=async(method,params={})=>{
  const res=await fetch('./rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(r=>r.json())
  if(res.error)throw Error(res.error.message);return res.result
 }
 const el=id=>document.querySelector(id)
 const collectChinese=(scope=document.body)=>{
  const lines=[],walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT)
  let node
  while((node=walker.nextNode())){
   const text=node.nodeValue.trim()
   if(!/[㐀-鿿]/.test(text)||node.parentElement?.closest('select#language-select,script,style,pre,code,.xterm,.agent-role-name,.host-card strong'))continue
   if(text.length>140)continue
   lines.push(text)
  }
  return [...new Set(lines)].slice(0,50)
 }

 await wait(()=>!el('#add').disabled)
 const lang=el('#language-select')
 check('First launch defaults to English independently of the operating system',
  document.documentElement.lang==='en'&&lang.value==='en'&&(await rpc('hosts.workspace')).language==='en')
 untranslated.home=collectChinese()
 check('Navigation, toolbar, search, and primary actions are English on initial load',
  el('h1')?.textContent==='Aexus'&&el('#single-mode').textContent==='Single Host'&&
  el('#hosts-board-mode').textContent==='Hosts Board'&&!el('#board-mode')&&!el('#file-board-mode')&&
  el('#agent-board-mode').textContent==='Agent Board'&&el('#role-board-mode').textContent==='Role Board'&&
  el('#add').textContent.trim().includes('Add Host')&&
  el('#search').placeholder==='Search hosts or systems')
 check('Styled language selector offers English and Chinese with the native select preserved',
  lang.closest('.styled-select')?.querySelector('.styled-select-trigger')&&
  [...lang.options].map(o=>o.value).join(',')==='en,zh')
 const draft=document.createElement('div')
 draft.innerHTML='<article class="host-card"><strong>云主机</strong></article><strong class="agent-role-name">新建主机</strong><textarea>Agent 原始任务</textarea>'
 document.querySelector('#detail').append(draft)
 lang.value='zh';lang.dispatchEvent(new Event('change',{bubbles:true}))
 check('Switching to Chinese changes navigation without recreating the app',await wait(async()=>
  document.documentElement.lang==='zh-CN'&&el('#single-mode').textContent==='单机'&&
  el('#hosts-board-mode').textContent==='主机看板'&&
  (await rpc('hosts.workspace')).language==='zh'))
 check('User-host names and Agent session names are never translated or modified',
  draft.querySelector('.host-card strong').textContent==='云主机'&&
  draft.querySelector('.agent-role-name').textContent==='新建主机'&&draft.querySelector('textarea').value==='Agent 原始任务')
 check('Chinese labels and actions are visible in the host workbench',
  el('h1')?.textContent==='Aexus'&&el('#add')?.textContent?.includes('新建主机')&&el('#search').placeholder==='搜索主机或系统')
 lang.value='en';lang.dispatchEvent(new Event('change',{bubbles:true}))
 check('Switching back to English restores English without duplicating controls',await wait(async()=>
  document.documentElement.lang==='en'&&el('#single-mode').textContent==='Single Host'&&
  (await rpc('hosts.workspace')).language==='en'&&document.querySelectorAll('#language-select').length===1))
 draft.remove()
 el('#hosts-board-mode').click()
 check('Hosts Board mounts two English subviews without extra top-level buttons',await wait(()=>
  !!el('.hosts-board-tabs')&&el('.hosts-board-tabs').querySelectorAll('button').length===2&&
  el('[data-hosts-board-view="board"]')?.textContent==='Terminal Board'&&
  el('[data-hosts-board-view="file-board"]')?.textContent==='File Board'&&
  el('.mode-switch').querySelectorAll('button').length===4))
 const file=el('[data-hosts-board-view="file-board"]');file?.click()
 check('File Board is localized to English after asynchronous rendering',await wait(()=>{
  const heading=el('.file-board-heading')
  return el('#hosts-board-mode').classList.contains('active')&&
   el('[data-hosts-board-view="file-board"][aria-selected="true"]')&&!!heading&&/File Board/i.test(heading.textContent)
 }))
 untranslated.files=collectChinese(el('#detail'))
 el('#agent-board-mode').click()
 check('Agent Board title and per-workgroup host-column controls show English',await wait(()=>{
  const heading=el('.agent-heading')
  const columns=el('#agent-group-columns')
  return !!heading&&heading.querySelector('h2')?.textContent==='Agent Board'&&
   !!columns&&[...columns.options].map(option=>option.textContent.trim()).join('|')==='1 columns|2 columns|3 columns|4 columns|5 columns|6 columns'&&
   !el('#agent-columns')&&!el('.agent-columns')&&!el('#agent-role-columns')&&!el('.agent-role-columns')
 }))
 check('Native language change does not emit Agent messages or open an Agent',
  !issues.length&&document.querySelectorAll('.agent-inspector').length===0)
 untranslated.agent=collectChinese(el('#detail'))
 const add=el('[data-host="local"] [data-add-role]')
 if(add&&!add.disabled){
  add.click()
  check('Agent creation dialog is translated, including source/target and action controls',await wait(()=>{
   const dialog=el('.agent-create-dialog')
   return !!dialog&&/Engine Origin/.test(dialog.textContent)&&/Work Host/.test(dialog.textContent)&&
    /Create & Connect/.test(dialog.textContent)&&/Session Name/.test(dialog.textContent)
  }))
  // Separated from the control check above so an untranslated header cannot hide
  // behind correctly translated labels. Reported as a product defect, not repaired here.
  check('Agent creation dialog header carries no untranslated source copy in English mode',await wait(()=>{
   const dialog=el('.agent-create-dialog')
   const header=dialog?.querySelector('header')
   return !!header&&/Coding Agent/.test(header.textContent)&&!/[㐀-鿿]/.test(header.textContent)
  }))
  untranslated.dialog=collectChinese(el('.agent-create-dialog'))
  const input=el('#agent-name');if(input)input.value='研发中文会话'
  const session=el('.agent-create-dialog')
  lang.value='zh';lang.dispatchEvent(new Event('change',{bubbles:true}))
  await wait(()=>document.documentElement.lang==='zh-CN')
  check('Switching language with an Agent dialog open preserves its identity and draft',
   el('.agent-create-dialog')===session&&input?.value==='研发中文会话')
  check('Native engine options keep canonical identifiers after translation',
   el('#agent-engine')?.options?.[0]?.value==='codex')
  lang.value='en';lang.dispatchEvent(new Event('change',{bubbles:true}))
  await wait(()=>document.documentElement.lang==='en')
  el('.agent-create-dialog [data-close]')?.click()
 }
 check('Final language persisted in isolated CloudHosts backend',await wait(async()=> (await rpc('hosts.workspace')).language==='en'))
 check('No JavaScript errors or rejected requests',issues.length===0)
 return {passed:checks.every(c=>c.passed),checks,issues,untranslated}
}
