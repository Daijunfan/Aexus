'use strict';
// Run local, isolated regression suites and keep failures/skips visible.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const selected=process.argv.slice(2),all=['core','mindmap-keyboard-ui','mindmap-gradient-motion-ui','mindmap-branch-motion-ui','mindmap-filter-links-ui','mindmap-designs-ui','mindmap-manipulation-ui','mindmap-equation-ui','mindmap-large-drag-ui','mindmap-pitch-ui','xmind-drag-ui','xmind-structures-ui','xmind-native-ui','topic-default-ui','sidebar-navigation-ui','sidebar-flow-ui','mindmap-studio-ui','mindmap-tools-ui','mindmap-image-ui','mindmap-motion-ui','mindmap-performance','mindmap-native-ui','book-turn-ui','study-library-ui','card-source-click-ui','appearance-portable-ui','interaction-workbench-ui','document-textbox-ui','backup-jobs-ui','backup-job-crash','visual-refinement-ui','keyword-boards-ui','backup-stream-ui','dictionary-document-ui','dictionary-selection-ui','navigation-races-ui','ui-smoke','local-navigation-ui','fragment-navigation-ui','large-map-ui','annotation-window-ui','responsive-workbench-ui','resize-handwriting-ui','workbench-ui','advanced-ui','layout-ui','library-ui','library-stability-ui','selection-ui','study-ui','pdf-modes-ui','boards-ui','map-tools-ui','reading-appearance-ui','learning-ui','capture-devices-ui','av-ui','presentation-pointers-ui','review-faces-ui','generated-review-ui','mapping-repair-ui','ruler-ui','ink-toolbar-ui','ink-preferences-ui','scribble-ui','stroke-geometry-ui','eraser-workflow-ui','image-ink-ui','image-marks-ui','host-smoke','employee-host','team-ui','interaction-native-ui','book-library-native-ui','av-native-ui','review-faces-native-ui'];
const suites=selected.length?selected:all;
if(suites.some(name=>!all.includes(name)))throw Error('Unknown isolated audit suite.');
const marker=path.join(root,'artifacts/deep-audit-current.txt');
const base=process.env.MR_AUDIT_OUTPUT||(fs.existsSync(marker)?fs.readFileSync(marker,'utf8').trim():path.join(root,'artifacts/deep-audit'));
if(!path.resolve(base).startsWith(path.join(root,'artifacts')+path.sep))throw Error('Audit output must remain in plugin artifacts.');
const out=path.join(base,'run-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,modelCalls:0,results:[],untested:['Windows','Linux','physical stylus/palm rejection','physical external-drive disconnection','native MarginNote package migration','external-application URI launch and two-way Obsidian synchronization']};
(async()=>{
 for(const suite of suites){
  const args=suite==='core'?['--test',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join(root,'tests',n))]:[path.join(root,'tests',suite+'.cjs')];
  const start=Date.now(),logFile=path.join(out,suite+'.log'),log=fs.createWriteStream(logFile);let timedOut=false;
  const status=await new Promise(resolve=>{
   const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
   const signal=value=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,value);}catch{}};
   let escalation;const deadline=setTimeout(()=>{timedOut=true;log.write('\nAUDIT_TIMEOUT\n');signal('SIGTERM');escalation=setTimeout(()=>signal('SIGKILL'),5000);},300000);
   child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.once('error',e=>log.write(e.stack+'\n'));child.once('close',(code,signalName)=>{clearTimeout(deadline);clearTimeout(escalation);log.end(()=>resolve({exitCode:code??1,signal:signalName,timedOut}));});
  });
  const text=fs.readFileSync(logFile,'utf8'),skipLines=text.split('\n').filter(line=>/^\s*SKIP\b|#\s*SKIP\b|"skipped":\["|^ℹ skipped [1-9]/i.test(line));
  const record={suite,...status,seconds:+((Date.now()-start)/1000).toFixed(2),log:logFile,skipLines};report.results.push(record);
  report.passed=report.results.filter(r=>r.exitCode===0&&!r.timedOut).length;report.failed=report.results.length-report.passed;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log(`${status.exitCode===0&&!timedOut?'PASS':'FAIL'} ${suite}: ${record.seconds}s${skipLines.length?' (see skip details)':''}`);
  if(status.exitCode!==0||timedOut)console.log(text.split('\n').slice(-30).join('\n'));
 }
 console.log('REPORT '+path.join(out,'results.json'));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
