'use strict';
// Reproducible synthetic workload; never opens or modifies a personal library.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto'),{performance}=require('node:perf_hooks');
const assert=require('node:assert/strict');
const {chromium}=require('../../../node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
async function main(){
  const label=process.argv[2]||'current',size=Number(process.env.PROFILE_CARDS||10000);
  assert(/^[a-z-]+$/.test(label)&&Number.isInteger(size)&&size>=100&&size<=10000);
  const output=process.env.MR_AUDIT_OUTPUT||(await fs.readFile(path.join(root,'artifacts/deep-audit-current.txt'),'utf8').then(s=>s.trim(),()=>path.join(root,'artifacts/performance')));
  assert(path.resolve(output).startsWith(path.join(root,'artifacts')+path.sep));await fs.mkdir(output,{recursive:true});
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'mr-performance-')),workspace=path.join(parent,'library');await fs.mkdir(workspace);
  const server=await require('../lib/server.cjs').startServer({workspace});let browser;
  const rpc=async(method,params={})=>{const r=await server.runtime.request({jsonrpc:'2.0',id:randomUUID(),method,params});assert(!r.error,JSON.stringify(r.error));return r.result;};
  const report={label,size,environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus()[0]?.model},metrics:{},browserErrors:[]};
  const timed=async(name,fn,n=5)=>{const times=[];for(let i=0;i<n;i++){const t=performance.now();await fn();times.push(+(performance.now()-t).toFixed(2));}const sort=[...times].sort((a,b)=>a-b);report.metrics[name]={samplesMs:times,medianMs:sort[Math.floor(n/2)],maxMs:sort.at(-1)};};
  try{
    const set=await rpc('study.create',{mapMode:'cards',title:'Synthetic performance library'}),file=path.join(workspace,'.margin-reader/state.json'),state=JSON.parse(await fs.readFile(file,'utf8')),s=state.studySets[set.id],ids=Array.from({length:size},()=>randomUUID()),now=new Date().toISOString();
    s.cards=ids.map((id,i)=>({id,title:`Knowledge ${String(i).padStart(5,'0')}`,text:'A bounded paragraph for synthetic rendering. 中文内容用于验证大文库的实际操作。',note:'',tags:['topic-'+i%30],color:'yellow',source:null,image:null,parentId:i%50?ids[i-i%50]:null,collapsed:false,createdAt:now,updatedAt:now}));
    state.settings.activeStudySet=s.id;await fs.writeFile(file,JSON.stringify(state,null,2));
    await timed('settingsGet',()=>rpc('settings.get'));
    await timed('studyGet',()=>rpc('study.get',{setId:s.id}),3);
    await timed('catalogSearch',()=>rpc('study.catalog',{query:'Knowledge 099',limit:20}),3);
    await timed('noOpPositionMetadata',()=>rpc('settings.set',{theme:'light'}),3);
    const dictionaryText=s.cards.slice(-100).map(card=>card.title).join(' · ');
    await timed('dictionaryMatch',async()=>{const result=await rpc('study.dictionary.match',{setId:s.id,text:dictionaryText});assert.equal(result.total,100);},3);
    await timed('dictionaryLookup',async()=>{const result=await rpc('study.dictionary.lookup',{setId:s.id,term:s.cards.at(-1).title});assert.equal(result.total,1);},3);
    report.stateBytes=(await fs.stat(file)).size;
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||'/Users/djf/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell'});
    const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();page.setDefaultTimeout(120000);
    page.on('pageerror',e=>report.browserErrors.push(e.message));
    await page.addInitScript(()=>{window.profileTasks=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())window.profileTasks.push(entry.duration);}).observe({type:'longtask',buffered:true});});
    const start=performance.now();await page.goto(server.url);await page.waitForSelector('body[data-ready=true]');
    report.metrics.uiReadyMs=+(performance.now()-start).toFixed(2);
    const snapshot=()=>page.evaluate(()=>({nodes:document.querySelectorAll('*').length,cards:document.querySelectorAll('.study-card').length,listCards:document.querySelectorAll('.study-list-card').length,maxLongTaskMs:Math.max(0,...window.profileTasks),overflow:document.documentElement.scrollWidth>innerWidth,viewport:{width:document.getElementById('study-map-viewport').clientWidth,height:document.getElementById('study-map-viewport').clientHeight}}));
    report.before=snapshot?await snapshot():null;
    const t=performance.now();await page.locator('[data-study-view=cards]').click();await page.waitForSelector('#study-cards-panel:not([hidden]) .study-list-card');report.metrics.cardBoxMs=+(performance.now()-t).toFixed(2);report.cardBox=await snapshot();
    await page.screenshot({path:path.join(output,`performance-${label}-${size}.png`)});
    const client=await context.newCDPSession(page);await client.send('Performance.enable');report.chromium=(await client.send('Performance.getMetrics')).metrics.filter(v=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','LayoutCount','RecalcStyleCount','TaskDuration'].includes(v.name));
    assert.deepEqual(report.browserErrors,[]);
    console.log(JSON.stringify(report,null,2));
  }catch(error){report.error=error.stack;throw error;}finally{await fs.writeFile(path.join(output,`performance-${label}-${size}.json`),JSON.stringify(report,null,2));await browser?.close();await server.close();await fs.rm(parent,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
