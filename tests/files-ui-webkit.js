window.runFileBoardChecks=async()=>{
 const checks=[],record=(name,pass)=>checks.push({name,passed:!!pass});
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
 const root=document.querySelector('#root'),list=document.createElement('div');list.id='hosts';document.body.append(list)
 const host={id:'mac-1',name:'Mac Storage',os:'macos',host:'mac.invalid',defaultDirectory:'/home/demo'}
 const win={id:'win-1',name:'Windows Storage',os:'windows',host:'win.invalid',defaultDirectory:'C:\\Users\\demo'}
 const folder=(name,directory=true)=>({name,path:name,directory,symlink:false,bytes:0})
 const listings={
  '/home/demo':[folder('docs'),folder('.config'),folder('public'),folder('note.md',false)],
  '/home/demo/docs':[folder('notes'),folder('.private')],
  'C:\\Users\\demo':[folder('Documents'),folder('HiddenDir')],
  'C:\\Users\\demo\\Documents':[folder('Projects')]
 }
 localStorage.setItem('cloud.station.view','tree')
 const stationItems=[
  {id:'folder',name:'文件',parent:null,type:'folder',logicalPath:'文件',children:1,bytes:0,source:{name:'local'}},
  {id:'inside',name:'inside.txt',parent:'folder',type:'file',logicalPath:'文件/inside.txt',bytes:9,source:{name:'local'}},
  {id:'outside',name:'outside.txt',parent:null,type:'file',logicalPath:'outside.txt',bytes:12,source:{name:'local'}}
 ]
 let progress=0
 const calls=[]
 const rpc=async(method,args={})=>{
  calls.push({method,args:structuredClone(args)})
  if(method==='station.list')return {items:structuredClone(stationItems),jobs:[{id:'job',kind:'fetch',name:'test',hostName:'local',bytes:++progress,total:100,state:'running'}]}
  if(method==='hosts.files'){
   const base=args.directory.replace(/[\\\\/]+$/,'')
   if(!(base in listings))throw Error('Unknown directory: '+base)
   const show=args.arguments.args.hidden
   return {root:args.directory,path:'.',entries:listings[base].filter(x=>show||!x.name.startsWith('.'))}
  }
  if(method==='station.read')return {item:{id:args.item},text:'original contents',sha256:'initial-hash'}
  if(method==='station.write')throw Error('File modified by another editor')
  if(method==='hosts.get')return host
  throw Error('Unexpected '+method)
 }
 const dispose=window.__filesPane(root,host,rpc,()=>{})
 await pause(140)
 const tree=root.querySelector('#station-list'),row=id=>tree.querySelector(`[data-item="${id}"]`)
 record('Station tree exposes keyboard navigable rows',tree.getAttribute('role')==='tree'&&row('folder')?.getAttribute('tabindex')==='0')
 row('folder').focus()
 row('folder').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))
 record('Right arrow expands selected folder and preserves its focus',!!row('inside')&&document.activeElement===row('folder')&&row('folder').getAttribute('aria-expanded')==='true')
 row('folder').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))
 record('Down arrow focuses next visible child, not a hidden tree item',document.activeElement===row('inside'))
 row('inside').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}))
 record('Up arrow returns to visible parent',document.activeElement===row('folder'))
 const disclosure=row('folder').querySelector('.tree-disclosure')
 disclosure.click()
 record('Collapsing a folder hides its subtree without clearing the parent selection',!row('inside')&&row('folder')?.getAttribute('aria-expanded')==='false')
 const checkbox=row('folder').querySelector('.station-select');checkbox.focus();checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}))
 await pause(1150)
 record('Transfer-progress polling updates only jobs and preserves selected checkbox focus',document.activeElement===checkbox&&row('folder')?.contains(checkbox)&&checkbox.checked)
 record('User folder named exactly like a UI label stays unchanged',row('folder')?.querySelector('[data-no-i18n]')?.textContent==='文件')
 const input=root.querySelector('#remote-directory'),toggle=root.querySelector('#remote-hidden')
 record('Single Host Files renders the eye and path input',!!input&&!!toggle)
 record('Single Host Files hides dotfiles by default',toggle.getAttribute('aria-pressed')==='false'&&!root.querySelector('#remote-list').textContent.includes('.config'))
 toggle.click();await pause(120)
 record('Single Host eye reveals hidden entries',toggle.getAttribute('aria-pressed')==='true'&&root.querySelector('#remote-list').textContent.includes('.config')&&calls.some(c=>c.method==='hosts.files'&&c.args.arguments.args.hidden===true))
 toggle.click();await pause(120)
 record('Single Host eye persists hidden-off and omits hidden files again',toggle.getAttribute('aria-pressed')==='false'&&!root.querySelector('#remote-list').textContent.includes('.config')&&localStorage.getItem('cloud.remote.showHidden.mac-1')==='0')
 input.focus();input.setSelectionRange(0,0);input.dispatchEvent(new MouseEvent('click',{bubbles:true}));await pause(30)
 record('Clicking path input places cursor at the final character',input.selectionStart===input.value.length)
 input.value='/home/demo/';input.dispatchEvent(new Event('input',{bubbles:true}));await pause(260)
 const menu=root.querySelector('.file-path-options')
 record('Typing / opens real remote-folder suggestions',!menu.hidden&&menu.textContent.includes('docs')&&!menu.textContent.includes('.config'))
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))
 input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await pause(40)
 record('Keyboard completion inserts full path without navigating yet',input.value==='/home/demo/docs/'&&!root.querySelector('#remote-list').textContent.includes('notes'))
 root.querySelector('#remote-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await pause(100)
 record('Submitting completed path opens selected remote folder',root.querySelector('#remote-list').textContent.includes('notes'))
 const validPath=input.value;input.value='/no-such-folder';input.dispatchEvent(new Event('input',{bubbles:true}));
 root.querySelector('#remote-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await pause(80)
 record('Failed path navigation restores last valid visible directory',input.value===validPath)
 const sendsBefore=calls.filter(x=>x.method==='station.send').length
 root.querySelector('.station-send')?.click()
 await pause(25)
 record('Invalid directory cannot send items to the previous path',calls.filter(x=>x.method==='station.send').length===sendsBefore&&root.querySelector('.station-send')?.disabled)
 // File editing preserves unsaved content on cancel and save/hash conflicts.
 const outside=row('outside')
 outside.querySelector('.station-item-info').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,cancelable:true}))
 await pause(70)
 const editorDialog=root.querySelector('#station-dialog'),editor=editorDialog.querySelector('.file-editor')
 record('Text editor opens without altering original content',editor?.value==='original contents')
 editor.value='local unsaved edits';editorDialog.querySelector('#dialog-cancel').click();await pause(60)
 const unsaved=root.querySelector('.unsaved-dialog')
 record('Closing a dirty editor requires explicit discard approval',!!unsaved?.open&&editorDialog.open&&editor.value==='local unsaved edits')
 unsaved.querySelector('[data-stay]').click();await pause(25)
 record('Choosing continue editing retains the entire draft',editorDialog.open&&editor.value==='local unsaved edits')
 editorDialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await pause(75)
 record('A version conflict keeps the editor open and draft intact',editorDialog.open&&editor.value==='local unsaved edits')
 editorDialog.querySelector('#dialog-cancel').click();await pause(55)
 root.querySelector('.unsaved-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await pause(30)
 record('Explicit discard closes only the editor',!editorDialog.open)

 dispose()
 root.innerHTML='';localStorage.removeItem('cloud.remote.showHidden.win-1')
 const disposeWin=window.__filesPane(root,win,rpc,()=>{})
 await pause(130)
 const wInput=root.querySelector('#remote-directory');wInput.focus();wInput.setSelectionRange(0,0);wInput.click();await pause(20)
 record('Single Host Windows path focus also selects end',wInput.selectionStart===wInput.value.length)
 wInput.value='C:\\Users\\demo\\';wInput.dispatchEvent(new Event('input',{bubbles:true}));await pause(260)
 record('Single Host Windows backslash autocompletes remote directories',!root.querySelector('.file-path-options').hidden&&root.querySelector('.file-path-options').textContent.includes('Documents'))
 disposeWin();return {checks,passed:checks.every(c=>c.passed)}
}
