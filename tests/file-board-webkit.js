window.runFileBoardChecks=async function(){
 const checks=[],root=document.querySelector('#root'),record=(name,passed)=>checks.push({name,passed:!!passed})
 root.classList.add('board-workbench')
 const mac={id:'mac-1',name:'Mac',host:'mac.local',os:'macos',defaultDirectory:'/workspace'}
 const win={id:'win-1',name:'Windows',host:'win.local',os:'windows',defaultDirectory:'C:\\Users\\demo'}
 const hosts=[mac,win]
 const board={hosts:hosts.map(h=>h.id),tabs:{},active:{},sizes:{},columns:2,cardHeight:350,initialized:true}
 const state={mode:'file-board',fileBoard:board},calls=[],saved=[]
 const entry=(name,path,directory,bytes=0)=>({name,path,directory,symlink:false,bytes})
 const listings={
  '/workspace': [entry('src','src',true),entry('docs','docs',true),entry('.secret','.secret',true),entry('README.md','README.md',false,18)],
  '/workspace:src': [entry('main.js','src/main.js',false,120),entry('components','src/components',true)],
  '/workspace:src/components': [entry('Button.tsx','src/components/Button.tsx',false,40)],
  '/workspace/docs': [entry('notes.txt','notes.txt',false,11)],
  'C:\\Users\\demo': [entry('Documents','Documents',true),entry('settings.ini','settings.ini',false,99)],
  'C:\\Users\\demo:Documents': [entry('hello.txt','Documents/hello.txt',false,11)],
  'D:\\projects': [entry('service','service',true)]
 }
 const rpc=async(method,args)=>{
  calls.push({method,...structuredClone(args)})
  if(method!=='hosts.files')throw Error('Unexpected RPC: '+method)
  const relative=args.arguments.args.path
  const base=args.directory.replace(/[\\/]+$/,'')||'/'
  const key=base+(relative==='.'?'':':'+relative)
  if(!(key in listings))throw Error('Directory does not exist: '+key)
  return {root:args.directory,path:relative,entries:listings[key].filter(item=>args.arguments.args.hidden||!item.name.startsWith('.'))}
 }
 const controller=window.__fileBoardPane(root,hosts,state,rpc,()=>{},async patch=>{saved.push(structuredClone(patch));return state},()=>{})
 const sleep=()=>new Promise(resolve=>setTimeout(resolve,30))
 await sleep()
 const cards=[...root.querySelectorAll('.file-board-card')],macCard=cards[0],winCard=cards[1]
 const row=(card,path)=>[...card.querySelectorAll('[data-tree-path]')].find(el=>el.dataset.treePath===path)
 record('Both host cards and first file tabs appear',cards.length===2&&board.tabs[mac.id].length===1&&board.tabs[win.id].length===1)
 record('Mac and Windows initial roots are loaded',!!row(macCard,'src')&&!!row(winCard,'Documents'))
 const firstPath=macCard.querySelector('.file-board-path')
 const hidden=macCard.querySelector('.file-hidden-toggle')
 record('Hidden files are initially suppressed and eye is clearly off',hidden?.getAttribute('aria-pressed')==='false'&&!row(macCard,'.secret'))
 hidden.click();await sleep()
 record('Eye reveals hidden files and saves per-host preference',hidden.getAttribute('aria-pressed')==='true'&&!!row(macCard,'.secret')&&board.showHidden[mac.id]===true&&saved.some(p=>p.fileBoardPatch?.showHidden?.[mac.id]===true))
 hidden.click();await sleep()
 record('Eye hides hidden files again',hidden.getAttribute('aria-pressed')==='false'&&!row(macCard,'.secret'))
 firstPath.focus();firstPath.setSelectionRange(0,0);firstPath.dispatchEvent(new MouseEvent('click',{bubbles:true}));await sleep()
 record('Click in absolute path field puts caret at the end',firstPath.selectionStart===firstPath.value.length&&firstPath.selectionEnd===firstPath.value.length)
 firstPath.value='/workspace/';firstPath.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,240))
 const macMenu=macCard.querySelector('.file-path-options')
 record('Typing slash opens real remote subdirectory suggestions',!macMenu.hidden&&[...macMenu.querySelectorAll('.file-path-label')].some(el=>el.textContent==='src'))
 firstPath.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))
 firstPath.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await sleep()
 record('Keyboard accepts path candidate without triggering navigation',firstPath.value==='/workspace/src/'&&board.tabs[mac.id][0].path==='/workspace')
 firstPath.value='/workspace'

 row(macCard,'src').click()
 await sleep()
 record('Folder click expands in place',!!row(macCard,'src/main.js')&&firstPath.value==='/workspace')
 record('Expanded folder uses its original absolute root',calls.some(call=>call.id===mac.id&&call.directory==='/workspace'&&call.arguments.args.path==='src'))
 row(macCard,'src').click()
 record('Second folder click collapses in place',!row(macCard,'src/main.js')&&firstPath.value==='/workspace')
 const prev=calls.length
 row(macCard,'src').click()
 await sleep()
 record('Cached folder reopens without another SSH request',!!row(macCard,'src/main.js')&&calls.length===prev)
 const folder=row(macCard,'src/components')
 folder.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))
 await sleep()
 record('ArrowRight expands nested folders',!!row(macCard,'src/components/Button.tsx'))
 macCard.querySelector('.file-board-new-tab').click()
 await sleep()
 record('New file tab has an independent view',board.tabs[mac.id].length===2&&macCard.querySelectorAll('.file-board-tab-select').length===2)
 firstPath.value='/workspace/docs'
 macCard.querySelector('.file-board-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await sleep()
 record('Absolute path input opens another folder view',board.tabs[mac.id][1].path==='/workspace/docs'&&!!row(macCard,'notes.txt'))
 macCard.querySelectorAll('.file-board-tab-select')[0].click()
 await sleep()
 record('First tab retains its path and expanded tree',firstPath.value==='/workspace'&&!!row(macCard,'src/components/Button.tsx'))
 const beforeRefreshFile=row(macCard,'src/components/Button.tsx');
 beforeRefreshFile.click();beforeRefreshFile.focus();
 const beforeFileScroll=macCard.querySelector('.file-board-body').scrollTop;
 macCard.querySelector('.file-board-refresh').click();await new Promise(resolve=>setTimeout(resolve,170));
 record('19: refreshing an expanded file tree retains nested visible folders',
  !!row(macCard,'src')?.getAttribute('aria-expanded')?.includes('true')&&
  !!row(macCard,'src/components/Button.tsx'))
 record('19: refresh keeps selected tree file',row(macCard,'src/components/Button.tsx')?.classList.contains('selected'))
 record('19: refresh restores tree keyboard focus',document.activeElement===row(macCard,'src/components/Button.tsx'))
 record('19: refresh preserves tree scroll offset',macCard.querySelector('.file-board-body').scrollTop===beforeFileScroll)
 const srcRow=row(macCard,'src');srcRow.focus();
 srcRow.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
 record('19: file board down arrow navigates to the next visible child',document.activeElement?.dataset.treePath==='src/main.js')
 document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
 record('19: file board up arrow navigates to the previous visible parent',document.activeElement?.dataset.treePath==='src')

 macCard.querySelectorAll('.file-board-tab-select')[1].click()
 record('Second tab retains separate path after switching',firstPath.value==='/workspace/docs'&&!!row(macCard,'notes.txt'))
 row(macCard,'notes.txt').click()
 record('File click selects without entering another directory',firstPath.value==='/workspace/docs'&&macCard.querySelector('.file-tree-row.selected')?.dataset.treePath==='notes.txt')
 const winPath=winCard.querySelector('.file-board-path')
 winPath.focus();winPath.setSelectionRange(0,0);winPath.dispatchEvent(new MouseEvent('click',{bubbles:true}));await sleep()
 record('Windows absolute path also places caret at end',winPath.selectionStart===winPath.value.length)
 winPath.value='C:\\Users\\demo\\';winPath.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,240))
 record('Windows backslash activates matching directory suggestions',!winCard.querySelector('.file-path-options').hidden&&winCard.querySelector('.file-path-options').textContent.includes('Documents'))
 winPath.value='C:\\Users\\demo'

 row(winCard,'Documents').click()
 await sleep()
 record('Windows nested tree keeps drive root',winPath.value==='C:\\Users\\demo'&&!!row(winCard,'Documents/hello.txt'))
 winPath.value='D:\\projects'
 winCard.querySelector('.file-board-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await sleep()
 record('Windows drive paths open without conversion',board.tabs[win.id][0].path==='D:\\projects'&&!!row(winCard,'service'))
 const beforeInvalid=calls.length
 winPath.value='/tmp/invalid'
 winCard.querySelector('.file-board-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 record('Invalid Windows POSIX paths do not perform RPC',calls.length===beforeInvalid&&board.tabs[win.id][0].path==='D:\\projects')
 const edge=macCard.querySelector('.file-board-resize')
 edge.setPointerCapture=()=>{}
 const pointer=y=>({pointerId:9,button:0,isPrimary:true,clientY:y,preventDefault(){}})
 edge.onpointerdown(pointer(300));edge.onpointermove(pointer(418));edge.onpointerup(pointer(418))
 await sleep()
 record('Row resize is vertical and shared',board.sizes[mac.id]===470&&board.sizes[win.id]===470)
 const columns=root.querySelector('#file-board-columns')
 columns.value='1';columns.dispatchEvent(new Event('change',{bubbles:true}))
 await sleep()
 record('File board columns are independently adjustable',board.columns===1&&root.querySelector('.file-board-grid').style.gridTemplateColumns.includes('repeat(1,'))
 macCard.querySelectorAll('.file-board-tab-close')[1].click()
 record('Closing a tab retains the other path',board.tabs[mac.id].length===1&&board.tabs[mac.id][0].path==='/workspace')
 record('Board state saved independently',saved.some(p=>p.fileBoardPatch?.tabs?.[mac.id]?.length===2)&&saved.every(p=>!p.boardPatch))
 controller.dispose()
 return {checks,passed:checks.every(c=>c.passed)}
}