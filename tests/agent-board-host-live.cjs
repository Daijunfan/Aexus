// Opt-in installed-app acceptance. Real original TUIs and real configured APIs.
// Only touches four named QA sessions and files in its recorded private workspace.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium}=require('../AgentBoard/Aexus/node_modules/playwright');
const installed='/Applications/Aexus.app/Contents/Resources/backend',registry=require(installed+'/src/registry.cjs'),ssh=require(installed+'/src/ssh.cjs');
const name=process.argv[2],mode=process.argv[3]||'native',engines=process.argv[4]?.split(',')||['codex','claude','cline','pi'],run=process.argv[5]||'';
if(!name||!['native','mac'].includes(mode)||engines.some(engine=>!['codex','claude','cline','pi'].includes(engine))||run&&!/^[a-zA-Z0-9_-]+$/.test(run))throw Error('Usage: node tests/agent-board-host-live.cjs HOST native|mac [engines] [run-id]');
const host=name==='local'?{id:'local',name:'Mac',os:'macos',defaultDirectory:os.homedir()}:registry.get(name),state=JSON.parse(fs.readFileSync(path.join(registry.home,'server.json')));
const out=path.resolve(__dirname,'../artifacts/agent-board-acceptance',run),ledgerFile=path.join(out,host.id+'-'+mode+'.json');fs.mkdirSync(out,{recursive:true});
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile)):{hostId:host.id,host:host.name,mode,runId:randomUUID(),cases:[]};
ledger.work ||= (host.os==='windows'?path.win32:path.posix).join(host.defaultDirectory,'.cloudhosts-agent-qa',ledger.runId);
const save=()=>fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2),{mode:0o600});
const rpc=async(method,params={})=>{const x=await fetch(state.url+'rpc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method,params})}).then(x=>x.json());if(x.error)throw Error(x.error.message);return x.result};
const delay=ms=>new Promise(r=>setTimeout(r,ms));let browser,browserServer,page;
const screen=async()=>page.locator('.agent-inspector .xterm-rows').innerText();
const replied=(text,marker,engine)=>new RegExp('^\\s*'+({codex:'•',claude:'[●⏺]',cline:'\\*',pi:''}[engine])+'\\s*'+marker+'[\\s\\u2580-\\u259f]*$','m').test(text)&&!/esc to (interrupt|cancel)|──[^\n]*Working/i.test(text);
async function completed(text,marker,record,allHistory=false){
 if(!['cline','pi'].includes(record.engine))return replied(text,marker,record.engine);
 if(!allHistory&&!text.includes(marker))return false;
 if(record.engine==='pi'){
  const local=mode==='mac'||host.id==='local';
  if(!record.nativeTranscript){
   if(local){const folder=path.join(os.homedir(),'.pi/agent/sessions'),match=fs.readdirSync(folder,{recursive:true}).find(f=>f.endsWith('_'+record.identity+'.jsonl'));if(match)record.nativeTranscript=path.join(folder,match)}
   else {const py="from pathlib import Path;print(next((str(p) for p in (Path.home()/'.pi/agent/sessions').rglob('*_"+record.identity+".jsonl')),''))",r=await ssh.execute(host.id,(host.os==='windows'?'python -c '+ssh.psquote(py):'python3 -c '+ssh.quote(py)),host.defaultDirectory,30);record.nativeTranscript=r.stdout.trim()}
  }
  if(!record.nativeTranscript)return false;
  const raw=local?fs.readFileSync(record.nativeTranscript,'utf8'):Buffer.from((await ssh.files(host.id,'native_io',{operation:'read',args:{path:record.nativeTranscript}},host.defaultDirectory)).data,'base64').toString('utf8');
  const messages=raw.trim().split('\n').map(JSON.parse).flatMap(e=>e.message?[e.message]:[]),last=allHistory?-1:messages.findLastIndex(m=>m.role==='user');
  return messages.slice(last+1).some(m=>m.role==='assistant'&&m.stopReason==='stop'&&m.content.some(c=>c.type==='text'&&c.text.includes(marker)));
 }
 const relative='.cline/data/sessions/'+record.identity+'/'+record.identity+'.messages.json';
 let raw;try{raw=mode==='mac'||host.id==='local'?fs.readFileSync(path.join(os.homedir(),relative),'utf8'):Buffer.from((await ssh.files(host.id,'native_io',{operation:'read',args:{path:'~/'+relative}},host.defaultDirectory)).data,'base64').toString('utf8')}catch(e){if(e.code==='ENOENT'||/No such file or directory|cannot find the file/i.test(e.message))return false;throw e}
 const messages=JSON.parse(raw).messages,lastInput=allHistory?-1:messages.findLastIndex(m=>m.role==='user'&&m.content.some(c=>c.type==='text'&&c.text?.includes('<user_input')));
 return messages.slice(lastInput+1).some(m=>m.role==='assistant'&&!m.content.some(c=>c.type==='tool_use')&&m.content.some(c=>c.type==='text'&&c.text.includes(marker)));
}
async function waitForTerminal(){await page.waitForFunction(()=>document.querySelector('.agent-inspector .xterm-screen, .agent-inspector .agent-connect-panel'),null,{timeout:60000});const panel=page.locator('.agent-inspector .agent-connect-panel');if(await panel.count())throw Error(await panel.locator('pre').textContent())}
async function input(text,record){
 const editor=page.locator('.agent-inspector .xterm-helper-textarea');await editor.focus();
 if(record.engine==='claude')await page.keyboard.type(text,{delay:10});
 else await editor.evaluate((element,value)=>{const data=new DataTransfer();data.setData('text/plain',value);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))},text);
 await delay(host.os==='windows'&&record.engine==='codex'?1500:350);await editor.focus();await page.keyboard.press('Enter');
 if(record.engine==='pi')for(let n=0;n<45;n++){
  await delay(700);const view=await screen();if(!view.includes('Startup is still in progress'))break;
  const parts=view.split(/\n\s*─{8,}[^\n]*\n/),draft=parts.length>=3?parts.at(-2).replace(/\s+/g,' ').trim().replace(/^❯\s*/,''):'';
  if(draft!==text.replace(/\s+/g,' ').trim())break;
  await page.keyboard.press('Enter');
 }
}
async function choose(selector,value){const select=page.locator(selector);if(await select.inputValue()===value)return;const index=await select.evaluate((el,v)=>[...el.options].findIndex(o=>o.value===v),value);assert.ok(index>=0,'Missing option '+value);await select.locator('..').locator('.styled-select-trigger').click();await page.locator('.styled-select-menu .styled-select-option').nth(index).click()}
let lastApproval='',lastApprovalAt=0;
async function handleNativePrompts(text,record){
 let action;
 if(/Choose the text style|Choose.*theme|Select.*theme|Let.s get started/.test(text)&&/Dark mode/.test(text))action='Enter';
 else if(/Yes, I trust|Do you trust the files|Trust this folder/.test(text)&&/cloudhosts-agent-qa/.test(text))action=/[❯›>❱]\s*No, exit/.test(text)?['ArrowDown','Enter']:['Enter'];
 else if(/running in Bypass Permissions mode/.test(text)&&/Yes, I accept/.test(text))action=/[❯›>]\s*No, exit/.test(text)?['ArrowDown','Enter']:['Enter'];
 else if(/Press Enter to continue/.test(text)&&!/sign in|login|terms of service/i.test(text))action='Enter';
 else if(/Yes/.test(text)&&/No/.test(text)&&/Do you want|Would you like to (run|make)|Allow|approve|permission/i.test(text)&&text.includes(record.file))action='Enter';
 if(action){if(text===lastApproval&&Date.now()-lastApprovalAt<1700)return true;lastApproval=text;lastApprovalAt=Date.now();await page.locator('.agent-inspector .xterm-helper-textarea').focus();for(const key of Array.isArray(action)?action:[action]){await page.keyboard.press(key);await delay(150)}return true}return false;
}
async function waitForScreen(predicate,record,timeout=90000){const until=Date.now()+timeout;let text='';while(Date.now()<until){const panel=page.locator('.agent-connect-panel');if(await panel.count())throw Error(await panel.innerText());if(await page.locator('.agent-inspector .xterm-rows').count()){if(/已退出|exited/i.test(await page.locator('.agent-inspector .agent-card-state').innerText()))throw Error('Native CLI exited: '+record.engine);text=await screen();if(await handleNativePrompts(text,record)){await delay(250);continue}if(await predicate(text))return text}await delay(200)}fs.writeFileSync(path.join(out,host.id+'-'+record.engine+'-last-screen.txt'),text,{mode:0o600});throw Error('Native UI timed out: '+record.engine+' '+text.slice(-600))}
async function open(record){await page.locator('#agent-refresh').click();await page.locator('[data-session="'+record.id+'"]').first().click();await waitForTerminal();await waitForScreen(t=>({codex:/OpenAI Codex|Ask Codex/,claude:/Claude Code|(?:^|\n)\s*❯/,cline:/Ask anything|What can I do for you/,pi:/deepseek|Pi |pi v/}[record.engine]).test(t),record,45000);const list=await rpc('hosts.agent-list',{id:host.id});return list.find(x=>x.id===record.id)}
async function closeView(){const dialog=page.locator('.agent-inspector');if(await dialog.count())await dialog.locator('header [data-close]').click()}
async function readProof(file){if(host.id==='local'){try{return fs.readFileSync(path.join(ledger.work,file),'utf8').trim()}catch{return null}}try{return Buffer.from((await ssh.files(host.id,'native_io',{operation:'read',args:{path:file}},ledger.work)).data,'base64').toString('utf8').trim()}catch{return null}}
(async()=>{try{
 if(host.id==='local')fs.mkdirSync(ledger.work,{recursive:true});else await ssh.files(host.id,'native_io',{operation:'mkdir',args:{path:ledger.work}},host.defaultDirectory);save();
 browserServer=await chromium.launchServer({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});browser=await chromium.connect(browserServer.wsEndpoint());page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(state.url);await page.locator('#add:not([disabled])').waitFor();await page.locator('#agent-board-mode').click();await page.locator('[data-add-role]').first().waitFor();
 for(const engine of engines){
  let record=ledger.cases.find(x=>x.engine===engine);if(record?.passed)continue;
  if(!record){record={engine,file:engine+'-proof.txt',marker:'CH_'+engine.toUpperCase()+'_'+randomUUID().slice(0,8)};ledger.cases.push(record);save()}
  if(!record.id){const existing=(await rpc('hosts.agent-list',{id:host.id})).find(x=>x.engine===engine&&x.cwd===ledger.work&&x.engineHostId===(mode==='mac'?'local':host.id));if(existing){record.id=existing.id;save()}}
  if(!record.id){
   await page.locator('[data-add-role]').first().click();await page.locator('#agent-name').fill('验收 '+(mode==='mac'?'Mac→':'本机 ')+engine);await choose('#agent-target',host.id);if(mode==='mac'&&host.id!=='local')await choose('#agent-source','local');await page.waitForFunction(()=>!document.querySelector('#agent-start').disabled,null,{timeout:60000});await choose('#agent-engine',engine);await page.locator('#agent-directory').fill(ledger.work);if(mode==='mac'&&host.id!=='local')await choose('#agent-permission','full');
   const response=page.waitForResponse(r=>{try{return r.url().endsWith('/rpc')&&r.request().postDataJSON().method==='hosts.agent-open'}catch{return false}},{timeout:90000});await page.locator('#agent-start').click();const result=(await (await response).json());if(result.error)throw Error(result.error.message);record.id=result.result.id;save();await waitForTerminal();
  }else await open(record);
  await waitForScreen(t=>({codex:/OpenAI Codex|Ask Codex/,claude:/Claude Code|(?:^|\n)\s*❯/,cline:/Ask anything|What can I do for you/,pi:/deepseek|Pi |pi v/}[engine]).test(t),record,60000);await delay(500);
  const before=(await rpc('hosts.agent-list',{id:host.id})).find(x=>x.id===record.id),identity=before.threadId||before.nativeSessionId;if(record.identity&&record.firstTask)assert.equal(identity,record.identity);record.identity=identity;save();
  if(!record.firstTask){
   await input('Create the UTF-8 file '+record.file+' in this working directory containing exactly the single line '+record.marker+'. Read it back, then reply exactly '+record.marker+'. Do not change other files.',record);
   await waitForScreen(async t=>await completed(t,record.marker,record)&&await readProof(record.file)===record.marker,record,180000);await delay(800);record.firstTask=true;if(['pi','cline'].includes(engine))record.nativeFirstReplyVerified=true;save();
   await page.locator('.agent-inspector').screenshot({path:path.join(out,host.id+'-'+mode+'-'+engine+'-task.png')});
  }
  let native=(await rpc('hosts.agent-list',{id:host.id})).find(x=>x.id===record.id);record.identity=native.threadId||native.nativeSessionId;assert.ok(record.identity);const oldTerminal=native.terminalId;
  await closeView();native=await open(record);assert.equal(native.terminalId,oldTerminal,'Closing a view must retain the original terminal');await closeView();
  await rpc('hosts.terminal-close',{id:host.id,terminal:oldTerminal});native=await open(record);assert.equal(native.threadId||native.nativeSessionId,record.identity,'Reconnect must preserve the exact native history');await waitForScreen(t=>['pi','cline'].includes(engine)?completed(t,record.marker,record,true):t.includes(record.marker),record,60000);
  await input(record.secondSubmitted?'Finish the previous file task. Ensure the suffix _RESUMED appears exactly once, read it back, and reply RECONNECT_OK. Do not change other files.':'Append _RESUMED to the proof marker in the file from your previous task. Read it back and reply RECONNECT_OK. Do not change other files.',record);record.secondSubmitted=true;save();
  await waitForScreen(async t=>await completed(t,'RECONNECT_OK',record)&&await readProof(record.file)===record.marker+'_RESUMED',record,180000);await delay(600);
  await page.locator('.agent-inspector').screenshot({path:path.join(out,host.id+'-'+mode+'-'+engine+'-reconnect.png')});record.reconnected=true;record.passed=true;if(['pi','cline'].includes(engine))record.nativeFinalReplyVerified=true;record.error=undefined;save();console.log(JSON.stringify({host:host.name,engine,mode,passed:true,identityPreserved:true,fileVerified:true,originalUI:true}));await closeView();
 }
 assert.equal(errors.length,0,errors.join('\n'));ledger.passed=engines.every(engine=>ledger.cases.some(x=>x.engine===engine&&x.passed));if(ledger.passed)delete ledger.error;save();
 }catch(e){ledger.passed=false;ledger.error=String(e.message).replaceAll(state.url,'[local-app]/');save();console.error(ledger.error);if(page)await page.screenshot({path:path.join(out,host.id+'-'+mode+'-failure.png')}).catch(()=>{});process.exitCode=1}
 finally{await closeView().catch(()=>{});for(const r of ledger.cases)if(r.id){console.log('QA stopping '+r.engine);await rpc('hosts.agent-close',{id:host.id,session:r.id}).catch(()=>{})}console.log('QA closing browser');await Promise.race([browser?.close(),delay(5000)]);await Promise.race([browserServer?.kill(),delay(5000)]);console.log('QA cleanup complete')}
})().then(()=>process.exit(process.exitCode||0));
