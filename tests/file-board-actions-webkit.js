window.runFileBoardChecks=async()=>{
 const root=document.querySelector('#root'),checks=[]
 root.classList.add('board-workbench')
 const record=(name,passed)=>checks.push({name,passed:!!passed})
 const pause=ms=>new Promise(done=>setTimeout(done,ms))
 const wait=async(predicate,time=3200)=>{const deadline=Date.now()+time;while(Date.now()<deadline){if(predicate())return true;await pause(35)}return predicate()}
 const mac={id:'local',name:'Mac',host:'localhost',os:'macos',defaultDirectory:'/workspace'}
 const win={id:'win',name:'Windows',host:'windows.invalid',os:'windows',defaultDirectory:'C:\\Users\\test'}
 const board={hosts:['local','win'],tabs:{},active:{},sizes:{},columns:2,cardHeight:380,initialized:true}
 const state={fileBoard:board}
 const entries=new Map(),calls=[],trash=[]
 const key=(host,path)=>host+'|'+path
 const put=(host,path,data)=>entries.set(key(host,path),{...data,path,name:path.split('/').at(-1)})
 put('local','src',{directory:true})
 put('local','notes.md',{directory:false,content:'Initial\n',hash:'h1'})
 put('local','unsafe.bin',{directory:false,binary:true,bytes:5,hash:'binary'})
 put('local','数据.txt',{directory:false,content:'中文内容',hash:'h2'})
 put('win','Documents',{directory:true})
 put('win','Documents\\example.txt',{directory:false,content:'Windows body',hash:'hw'})
 let saveCount=0,delayNextRead=false,finishPendingRead=null
 const rpc=async(method,params)=>{
  if(method!=='hosts.files')throw Error('Unexpected RPC: '+method)
  const host=params.id,root=params.directory,op=params.arguments.operation,args=params.arguments.args||{}
  calls.push({host,root,op,args:structuredClone(args)})
  const direct=name=>entries.get(key(host,name))
  if(op==='list'){
   const folder=args.path==='.'?'':args.path
   const prefix=folder?folder+'/':''
   const rows=[...entries.values()].filter(row=>entries.get(key(host,row.path))===row&&row.path.startsWith(prefix)&&row.path!==folder)
   const immediate=rows.filter(row=>!row.path.slice(prefix.length).includes('/'))
   return {root,path:args.path,entries:immediate.filter(row=>args.hidden||!row.name.startsWith('.')).map(row=>({name:row.name,path:row.path,directory:row.directory,symlink:false,bytes:row.content?.length||row.bytes||0})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name))}
  }
  if(op==='mkdir'){
   if(direct(args.path))throw Error('File already exists')
   put(host,args.path,{directory:true});return {created:true,path:args.path}
  }
  if(op==='read'){
   const row=direct(args.path);if(!row||row.directory)throw Error('Missing file')
   const reply={path:args.path,binary:!!row.binary,bytes:row.content?.length||row.bytes||0,content:row.content,hash:row.hash}
   if(delayNextRead){delayNextRead=false;return new Promise(resolve=>finishPendingRead=()=>resolve(reply))}
   return reply
  }
  if(op==='write'){
   const row=direct(args.path)
   if(args.create&&row)throw Error('File already exists')
   if(args.hash&&(!row||row.hash!==args.hash))throw Error('File changed in another window; reload before saving')
   saveCount++
   put(host,args.path,{directory:false,content:args.content,hash:'hash-'+saveCount})
   return {saved:true,path:args.path}
  }
  if(op==='move'){
   const source=direct(args.path);if(!source)throw Error('Source does not exist')
   if(direct(args.to))throw Error('Target already exists')
   const rows=[...entries.values()].filter(row=>entries.get(key(host,row.path))===row&&(row.path===args.path||row.path.startsWith(args.path+'/')))
   for(const row of rows)entries.delete(key(host,row.path))
   for(const row of rows)put(host,args.to+row.path.slice(args.path.length),row)
   return {path:args.to}
  }
  if(op==='trash'){
   const current=direct(args.path);if(!current)throw Error('Missing entry')
   trash.push({host,path:args.path})
   for(const row of [...entries.values()])if(entries.get(key(host,row.path))===row&&(row.path===args.path||row.path.startsWith(args.path+'/')))entries.delete(key(host,row.path))
   return {id:'trash-1',path:args.path}
  }
  throw Error('Unexpected file operation '+op)
 }
 const notices=[]
 const control=window.__fileBoardPane(root,[mac,win],state,rpc,(message,type)=>notices.push({message,type}),async()=>state,()=>{})
 await wait(()=>root.querySelectorAll('.file-board-card').length===2&&root.querySelectorAll('.file-tree-row').length>=3)
 const macCard=root.querySelector('[data-id="local"]'),winCard=root.querySelector('[data-id="win"]')
 const row=(card,path)=>[...card.querySelectorAll('[data-tree-path]')].find(el=>el.dataset.treePath===path)
 const modal=()=>root.querySelector('.file-board-dialog')
 const submit=()=>modal().querySelector('form').requestSubmit()
 const close=()=>modal().querySelector('.file-board-dialog-cancel').click()
 const name=value=>{const el=modal().querySelector('[name=name]');el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}
 record('File Board renders new-file/new-folder buttons and row action menus for both hosts',
  !!macCard.querySelector('.file-board-create-file')&&!!macCard.querySelector('.file-board-create-folder')&&!!winCard.querySelector('.file-board-create-file')&&!!row(macCard,'src')?.querySelector('.file-tree-actions'))
 const contextRow=row(macCard,'notes.md')
 const rightClick=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,buttons:2})
 const contextHandled=!contextRow.dispatchEvent(rightClick)
 const menu=document.querySelector('.compact-popover')
 record('Right-clicking a file selects it and opens an actual edit/rename/delete context menu',
  contextHandled&&!!menu&&['edit','rename','trash'].every(action=>!!menu.querySelector('[data-action="'+action+'"]'))&&
  contextRow.dataset.treePath==='notes.md')
 menu.querySelector('[data-action="edit"]').click()
 record('Right-click Edit opens the original text editor',await wait(()=>modal().open&&modal().querySelector('.file-board-editor')?.value==='Initial\n'))
 close();await wait(()=>!modal().open)
 record('Actions affordance is visible without first hovering a file row',
  getComputedStyle(row(macCard,'notes.md').querySelector('.file-tree-actions')).visibility==='visible')
 // Folder creation at selected root; creation is non-destructive.
 macCard.querySelector('.file-board-create-folder').click()
 record('New folder dialog opens for its own Mac work directory',modal().open&&modal().textContent.includes('新建文件夹')&&modal().textContent.includes('/workspace'))
 name('Project');submit()
 record('Creating a folder changes the actual Mac file tree',await wait(()=>!modal().open&&!!row(macCard,'Project'))&&!!entries.get(key('local','Project')))
 row(macCard,'Project').click()
 macCard.querySelector('.file-board-create-file').click()
 record('New file defaults inside the selected folder',modal().open&&modal().querySelector('.file-board-dialog-path').textContent==='Project/')
 name('hello.md');modal().querySelector('[name=content]').value='Text from File Board';submit()
 record('Create text file inside selected folder saves content and expands it',await wait(()=>!modal().open&&!!row(macCard,'Project/hello.md'))&&entries.get(key('local','Project/hello.md')).content==='Text from File Board')
 // User clicks the filename once and edits it.
 row(macCard,'Project/hello.md').querySelector('.file-tree-name').click()
 record('Clicking a text filename opens the original UTF-8 editor',await wait(()=>modal().open&&modal().querySelector('.file-board-editor'))&&modal().querySelector('.file-board-editor').value==='Text from File Board')
 modal().querySelector('.file-board-editor').value='Edited via File Board\n'
 submit()
 record('Saving sends expected hash and updates remote text',await wait(()=>!modal().open)&&entries.get(key('local','Project/hello.md')).content==='Edited via File Board\n'&&calls.some(call=>call.op==='write'&&call.args.hash&&call.args.content==='Edited via File Board\n'))
 // An independent writer changes the version; File Board must retain draft.
 row(macCard,'Project/hello.md').querySelector('.file-tree-name').click()
 await wait(()=>modal().open&&modal().querySelector('.file-board-editor'))
 const pending=modal().querySelector('.file-board-editor');pending.value='Keep my unsaved draft'
 put('local','Project/hello.md',{directory:false,content:'Other writer changed this file',hash:'other-writer'})
 submit();await wait(()=>!modal().querySelector('.file-board-action-error').hidden)
 record('Conflicting edit remains open with all unsaved content and an explanation',modal().open&&pending.value==='Keep my unsaved draft'&&modal().querySelector('.file-board-action-error').textContent.includes('changed'))
 const leaving={checks:[]}
 window.dispatchEvent(new CustomEvent('workspace-before-leave',{detail:leaving}))
 await wait(()=>!!document.querySelector('.unsaved-dialog[open]'))
 document.querySelector('.unsaved-dialog [data-stay]').click()
 const allow=await Promise.all(leaving.checks)
 record('Changing workspace while text is unsaved requires confirmation and preserves the editor when declined',
  allow.length>0&&allow.every(value=>value===false)&&modal().open&&pending.value==='Keep my unsaved draft')
 await pause(45)
 close()
 record('Closing a dirty editor opens discard confirmation',await wait(()=>!!document.querySelector('.unsaved-dialog[open]')))
 document.querySelector('.unsaved-dialog [data-stay]').click();await pause(45)
 record('Declining discard retains the unsaved editing draft',modal().open&&pending.value==='Keep my unsaved draft')
 close();await wait(()=>!!document.querySelector('.unsaved-dialog[open]'))
 document.querySelector('.unsaved-dialog form')?.requestSubmit()
 record('Explicit discard closes the editor without overwriting the other writer',await wait(()=>!modal().open)&&entries.get(key('local','Project/hello.md')).content==='Other writer changed this file')
 // Rename using F2, then safe deletion via trash.
 const child=row(macCard,'Project/hello.md');child.focus();child.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true}))
 record('F2 opens rename dialog for the selected text file',await wait(()=>modal().open&&modal().querySelector('[name=name]')))
 name('renamed.md');submit()
 record('Rename preserves relative directory and updates tree',await wait(()=>!modal().open&&!!row(macCard,'Project/renamed.md'))&&!row(macCard,'Project/hello.md'))
 row(macCard,'Project/renamed.md').focus();row(macCard,'Project/renamed.md').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))
 record('Delete requires a distinct confirmation; no removal yet',modal().open&&!!entries.get(key('local','Project/renamed.md')))
 submit()
 record('Confirmed delete moves file to trash rather than deleting other files',await wait(()=>!modal().open&&!row(macCard,'Project/renamed.md'))&&trash.some(t=>t.host==='local'&&t.path==='Project/renamed.md')&&!!entries.get(key('local','notes.md')))
 // Folder row menu supports nested folders and rename.
 row(macCard,'Project').querySelector('.file-tree-actions').click()
 const folderMenu=document.querySelector('.compact-popover')
 record('Folder context menu contains rename, new file, new folder and safe delete',!!folderMenu&&['rename','new-file','new-folder','trash'].every(a=>!!folderMenu.querySelector('[data-action="'+a+'"]')))
 folderMenu.querySelector('[data-action="new-folder"]').click()
 name('Nested');submit()
 record('Folder context menu creates child folder',await wait(()=>!modal().open&&!!row(macCard,'Project/Nested')))
 row(macCard,'Project').querySelector('.file-tree-actions').click()
 document.querySelector('.compact-popover [data-action=rename]').click()
 name('RenamedProject');submit()
 record('Renaming a directory keeps its nested children accessible',await wait(()=>!modal().open&&!!row(macCard,'RenamedProject/Nested'))&&!!entries.get(key('local','RenamedProject/Nested')))
 // Binary content and invalid encoding are never silently rewritten.
 row(macCard,'unsafe.bin').querySelector('.file-tree-name').click()
 record('Binary file opens a read-only explanation without a Save button',await wait(()=>modal().open)&&!modal().querySelector('.file-board-dialog-submit')&&modal().textContent.includes('not valid UTF-8'))
 close();await wait(()=>!modal().open)
 // Scope check: Windows drive root must remain Windows despite active Mac tabs.
 winCard.querySelector('.file-board-create-file').click()
 record('Windows action is bound to Windows host and drive directory',modal().open&&modal().textContent.includes('C:\\Users\\test'))
 name('example.txt');submit()
 record('Windows create is sent only to the Windows host and preserves its drive root',await wait(()=>!modal().open&&!!row(winCard,'example.txt'))&&calls.some(call=>call.host==='win'&&call.root==='C:\\Users\\test'&&call.op==='write'&&call.args.path==='example.txt'&&call.args.create))
 record('All file edits use the existing native workspace RPC',calls.filter(c=>c.op!=='list').every(c=>['read','write','move','mkdir','trash'].includes(c.op)))
 // The full filename affordance includes its icon, like a native file browser.
 row(macCard,'notes.md').querySelector('.file-tree-icon').click()
 record('Clicking a file icon opens the same text editor as clicking its filename',
  await wait(()=>modal().open&&!!modal().querySelector('.file-board-editor')))
 close();await wait(()=>!modal().open)
 // A slow remote file read must not resurrect a dialog after switching away
 // from File Board. The workspace container remains mounted in the DOM.
 delayNextRead=true
 const noticesBefore=notices.length
 row(macCard,'notes.md').querySelector('.file-tree-name').click()
 record('A delayed editor read remains pending while the original board is visible',await wait(()=>typeof finishPendingRead==='function'))
 control.dispose()
 finishPendingRead?.();await pause(70)
 record('Leaving File Board during an in-flight read does not open a stale editor or report a detached-modal error',
  !root.querySelector('.file-board-dialog')&&notices.length===noticesBefore)

 return {checks,passed:checks.every(c=>c.passed),errors:notices}
}
