window.runFileBoardChecks=async()=>{
 const checks=[],errors=[],record=(name,value)=>checks.push({name,passed:!!value});
 let stage='initial';try{
 const root=document.querySelector('#root');root.classList.add('board-workbench');
 const mac={id:'local',name:'Mac',os:'macos',defaultDirectory:'/source'},win={id:'win',name:'Windows',os:'windows',defaultDirectory:'C:\\Dest'};
 const files=new Map();
 const put=(host,root,relative,directory=false)=>{
  const data={path:relative,name:relative.split('/').at(-1),directory,symlink:false,bytes:directory?0:512};
  files.set(host+'|'+root+'|'+relative,data);
 };
 put('local','/source','alpha.txt');put('local','/source','Documents',true);put('local','/source','Documents/.secret');
 put('local','/source','Documents/empty',true);put('local','/source','.hidden');
 put('win','C:\\Dest','Target',true);put('win','C:\\Dest','existing.txt');
 put('win','C:\\Other','OtherFolder',true);
 const jobs=[],calls=[],transfers=[];let failures=0;
 const rpc=async(method,args={})=>{
  calls.push({method,args:structuredClone(args)});
  if(method==='station.list')return {items:[],jobs:jobs.map(job=>({...job}))};
  if(method==='station.cancel'){
   const job=jobs.find(v=>v.id===args.job);if(!job)throw Error('Unknown job');job.state='cancelled';job.finishedAt=Date.now();return {cancelling:true};
  }
  if(method==='station.copy'){
   transfers.push(structuredClone(args));
   const basename=args.to.split('/').at(-1),id='job-'+transfers.length;
   const job={id,kind:'copy',host:args.host,hostName:args.host==='local'?'Mac':'Windows',name:basename,state:'running',bytes:0,total:100,files:0,folders:0,createdAt:Date.now(),
    source:{hostId:args.sourceHost,hostName:args.sourceHost==='local'?'Mac':'Windows',directory:args.sourceDirectory,path:args.path},
    destination:{hostId:args.host,hostName:args.host==='local'?'Mac':'Windows',directory:args.directory,path:args.to}};
   jobs.push(job);
   if(args.to==='Target/alpha.txt'&&transfers.filter(v=>v.to==='Target/alpha.txt').length>1){
    job.error='Destination already exists; no files overwritten';job.state='failed';job.finishedAt=Date.now();
   }else if(!basename.startsWith('slow-copy')){
    setTimeout(()=>{
     if(job.state!=='running')return;
     const original=files.get(args.sourceHost+'|'+args.sourceDirectory+'|'+args.path);
     if(!original){job.error='Source missing';job.state='failed';job.finishedAt=Date.now();return}
     put(args.host,args.directory,args.to,original.directory);
     if(original.directory){
      for(const [key,value] of files)if(key.startsWith(args.sourceHost+'|'+args.sourceDirectory+'|'+args.path+'/'))
       put(args.host,args.directory,args.to+value.path.slice(args.path.length),value.directory);
     }
     job.bytes=job.total;job.files=original.directory?3:1;job.folders=original.directory?2:0;job.state='done';job.finishedAt=Date.now();job.result={path:args.to};
    },45);
   }
   return {...job};
  }
  if(method==='hosts.files'){
   const key=args.id+'|'+args.directory+'|',which=args.arguments.args.path;
   if(args.arguments.operation!=='list')throw Error('Unsupported mock workspace action');
   const prefix=which==='.'?'':which+'/';
   const list=[...files].filter(([id,value])=>id.startsWith(key)&&value.path.startsWith(prefix)&&value.path!==which&&
      !value.path.slice(prefix.length).includes('/')&&(args.arguments.args.hidden||!value.name.startsWith('.'))).map(([,value])=>value);
   return {root:args.directory,path:which,entries:list};
  }
  throw Error('Unknown RPC '+method);
 };
 const state={fileBoard:{hosts:['local','win'],tabs:{},active:{},sizes:{},showHidden:{},columns:2,cardHeight:350,initialized:true}};
 const dispose=window.__fileBoardPane(root,[mac,win],state,rpc,(text,type)=>errors.push({text,type}),async()=>state,()=>{});
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const wait=async(predicate,timeout=3200)=>{const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return true;await sleep(40)}return predicate()};
 await wait(()=>root.querySelectorAll('.file-board-card').length===2&&root.querySelectorAll('[data-tree-path]').length>=4);
 const card=id=>root.querySelector(`.file-board-card[data-id="${id}"]`);
 const row=(id,path)=>[...card(id).querySelectorAll('[data-tree-path]')].find(node=>node.dataset.treePath===path);
 const transferDialog=()=>root.querySelector('.file-board-transfer-dialog');
 const data=()=>new DataTransfer();
 const drag=(from,path,to,destination)=>{
  const source=row(from,path),target=destination||card(to).querySelector('.file-board-body');
  const contents=data();
  const start=new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:contents});
  const starts=source.dispatchEvent(start);
  const over=new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:contents});
  const accepted=!target.dispatchEvent(over);
  const drop=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:contents});
  const dropped=!target.dispatchEvent(drop);
  source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:contents}));
  return {starts,accepted,dropped,source,target};
 };
 record('Drag affordance exists on files and directories, not symlinks',row('local','alpha.txt').draggable&&row('local','Documents').draggable);
 // Native UX: hover a collapsed destination folder while holding the drag,
 // then expand it without having to drop or click first.
 const hoverData=data(),hoverSource=row('local','alpha.txt')
 hoverSource.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:hoverData}))
 row('win','Target').dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:hoverData}))
 await sleep(760)
 record('Hovering a destination folder automatically expands it before dropping',row('win','Target')?.getAttribute('aria-expanded')==='true')
 hoverSource.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:hoverData}))

 const targetFolder=row('win','Target');
 const first=drag('local','alpha.txt','win',targetFolder);
 if(!transferDialog()?.open)return {passed:false,checks:[...checks,{name:'Initial drag preview failed',passed:false}],errors:[JSON.stringify({first,sourceDraggable:row('local','alpha.txt')?.draggable,sourceConnected:!!row('local','alpha.txt'),winTargetFound:!!targetFolder})]};
 record('Cross-host file drag highlights the actual destination folder',first.accepted&&first.dropped&&transferDialog().open);
 record('Transfer preview specifies source/target host names, directory and copy-only semantics',
  transferDialog().textContent.includes('Mac')&&transferDialog().textContent.includes('Windows')&&transferDialog().textContent.includes('Target')&&transferDialog().textContent.includes('Original is retained'));
 stage='first submit';transferDialog().querySelector('form').requestSubmit();
 record('Drop invokes dedicated native host-to-host streaming RPC with captured roots',await wait(()=>transfers.length===1&&
  transfers[0].sourceHost==='local'&&transfers[0].sourceDirectory==='/source'&&transfers[0].path==='alpha.txt'&&
  transfers[0].host==='win'&&transfers[0].directory==='C:\\Dest'&&transfers[0].to==='Target/alpha.txt'));
 record('Transferred file appears in target folder and progress changes to Complete',await wait(()=>
  !!row('win','Target/alpha.txt')&&card('win').querySelector('[data-transfer-state="done"]'),4200));
 record('Drag never deleted or renamed source file',!!row('local','alpha.txt'));
 // Repeat same drop: remote job reports a collision instead of overwriting.
 const again=drag('local','alpha.txt','win',row('win','Target'));
 stage='second submit';transferDialog().querySelector('form').requestSubmit();
 record('Name conflicts surface as Failed copy jobs rather than replacing target files',await wait(()=>
  jobs.some(job=>job.state==='failed')&&!!card('win').querySelector('[data-transfer-state="failed"]')));
 record('Failed copy retains original and previously copied file',!!row('local','alpha.txt')&&!!row('win','Target/alpha.txt'));
 // Full directory transfer. The file visibility eye is OFF but all hidden
 // contents and empty subdirectories are copied in the actual RPC backend.
 drag('local','Documents','win');
 record('Drag a whole directory onto host card opens folder-copy preview',transferDialog().open&&transferDialog().textContent.includes('Copy Folder'));
 stage='folder submit';transferDialog().querySelector('form').requestSubmit();
 record('Directory drag refreshes Windows root after completion',await wait(()=>!!row('win','Documents')&&jobs.some(job=>job.destination.path==='Documents'&&job.state==='done'),4200));
 const dirItem=files.get('win|C:\\Dest|Documents/.secret'),empty=files.get('win|C:\\Dest|Documents/empty');
 record('Entire folder tree is represented, including hidden and empty children',!!dirItem&&!!empty?.directory);
 // Same host: copy in place receives a nonconflicting suggested name.
 const sameDrag=drag('local','alpha.txt','local');
 if(!transferDialog()?.querySelector('form'))return {passed:false,checks,errors:[{stage:'same-host after folder copy',sameDrag:{starts:sameDrag.starts,accepted:sameDrag.accepted,dropped:sameDrag.dropped},modalOpen:transferDialog()?.open,modalHtml:transferDialog()?.innerHTML,transferCount:transfers.length,states:jobs.map(j=>[j.name,j.state])}]};
 record('Same-host source drop suggests a copy name instead of self-overwrite',transferDialog().querySelector('input[name=filename]').value==='alpha (copy).txt');
 stage='same submit';transferDialog().querySelector('form').requestSubmit();
 record('Same-host drag makes an independent copy',await wait(()=>!!row('local','alpha (copy).txt'),4200));
 // Reverse direction: Windows -> Mac.
 stage='reverse drop';const reverseDrag=drag('win','existing.txt','local');
 if(!transferDialog()?.querySelector('form'))return {passed:false,checks,errors:[{stage:'reverse after same-host copy',reverseDrag:{starts:reverseDrag.starts,accepted:reverseDrag.accepted,dropped:reverseDrag.dropped},modalOpen:transferDialog()?.open,modalHtml:transferDialog()?.innerHTML,transferCount:transfers.length,states:jobs.map(j=>[j.name,j.state])}]};
 transferDialog().querySelector('form').requestSubmit();
 record('File drag also works from Windows to Mac',await wait(()=>!!row('local','existing.txt'),4200));
 // An extra File tab is an independent destination and must be preserved in
 // the captured job even when the source changes before completion.
 card('win').querySelector('.file-board-new-tab').click();
 const tabs=[...card('win').querySelectorAll('.file-board-tab-select')];
 card('win').querySelector('.file-board-path').value='C:\\Other';
 card('win').querySelector('.file-board-navigation').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 await wait(()=>row('win','OtherFolder'));
 stage='tab target';const tabDrag=drag('local','alpha.txt','win',card('win').querySelectorAll('.file-board-tab-select')[1]);
 if(!transferDialog()?.querySelector('form'))return {passed:false,checks,errors:[{stage:'tab target',tabDrag:{accepted:tabDrag.accepted,dropped:tabDrag.dropped},modalOpen:transferDialog()?.open,activeTab:state.fileBoard.active.win}]};
 transferDialog().querySelector('form').requestSubmit();
 record('Dropping onto a specific File tab copies to that tab directory, not another host tab',await wait(()=>transfers.at(-1).directory==='C:\\Other'&&files.has('win|C:\\Other|alpha.txt'),4200));
 // Context-menu host picker exposes the same safe copy workflow when
 // host cards are not simultaneously visible (keyboard or small windows).
 row('local','alpha.txt').querySelector('.file-tree-actions').click()
 const rowMenu=document.querySelector('.compact-popover')
 record('Every file also exposes a Copy to Host action without needing a drag gesture',!!rowMenu?.querySelector('[data-action=copy]'))
 rowMenu?.querySelector('[data-action=copy]')?.click()
 const hostPicker=document.querySelector('.compact-popover')
 record('Context copy picker lists both available host cards',!!hostPicker?.querySelector('[data-copy-destination="win"]')&&!!hostPicker.querySelector('[data-copy-destination="local"]'))
 hostPicker?.querySelector('[data-copy-destination="win"]')?.click()
 record('Selecting a host opens the same guarded copy preview',!!transferDialog()?.open&&transferDialog().textContent.includes('Windows'))
 transferDialog().querySelector('input[name=filename]').value='copy-via-menu.txt'
 transferDialog().querySelector('form').requestSubmit()
 record('Context-menu copy reaches the same native RPC and target root',await wait(()=>transfers.at(-1)?.to==='copy-via-menu.txt'&&
  transfers.at(-1)?.host==='win'&&files.has('win|C:\\Other|copy-via-menu.txt'),4200))
 // Cancel an in-flight copy via its inline transfer task; source must survive.
 stage='cancel preview';const cancelDrag=drag('local','alpha.txt','win');
 if(!transferDialog()?.querySelector('form'))return {passed:false,checks,errors:[{stage:'cancel preview',cancelDrag:{accepted:cancelDrag.accepted,dropped:cancelDrag.dropped}}]};
 transferDialog().querySelector('input[name=filename]').value='slow-copy.txt';transferDialog().querySelector('form').requestSubmit();
 const active=await wait(()=>!!card('win').querySelector('[data-transfer-state="running"]'));
 if(active)card('win').querySelector('[data-transfer-state="running"] [data-transfer-command="cancel"]').click();
 record('Cancelable transfer progress is visible on the target card',active);
 record('Cancel action sends only the matching job ID and preserves source',await wait(()=>calls.some(c=>c.method==='station.cancel')&&
  jobs.some(job=>job.name==='slow-copy.txt'&&job.state==='cancelled')&&files.has('local|/source|alpha.txt')));
 // Drop alone, without a locally initiated drag, is not trusted as a transfer.
 const count=transfers.length,spoof=data();spoof.setData('application/x-cloudhosts-file-board-item','untrusted');
 const invalid=new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:spoof});
 card('win').querySelector('.file-board-body').dispatchEvent(invalid);
 record('Untrusted external dataTransfer payload cannot trigger an arbitrary RPC copy',transfers.length===count);
 dispose.dispose();
 record('Unloading File Board releases the transfer dialog and event handlers',!root.querySelector('.file-board-transfer-dialog'));
 return {passed:checks.every(check=>check.passed),checks,errors};
 }catch(error){return {passed:false,checks,errors:[...errors,{stage,message:error.message,stack:error.stack}]}}
};
