'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const all=['core','mindmap-usability-ui','excerpt-drag-ui','mindmap-explorer-ui','mindmap-zones-ui','mindmap-local-tools-ui','document-covers-ui','topic-ownership-ui','topic-drop-boundary-ui','topic-overview-drag-ui','split-read-map-ui','read-map-surface-ui','read-map-camera-ui','read-map-source-ui','read-map-large-drag-ui','mindmap-performance','read-map-native-ui','xmind-structures-ui','xmind-drag-ui','mindmap-designs-ui','mindmap-manipulation-ui','mindmap-equation-ui','mindmap-pitch-ui','mindmap-tools-ui','mindmap-image-ui','mindmap-gradient-motion-ui','mindmap-branch-motion-ui','mindmap-filter-links-ui','mindmap-keyboard-ui','library-stability-ui','sidebar-flow-ui','book-turn-ui','visual-refinement-ui','appearance-portable-ui','host-smoke','employee-host','team-ui'];
const selected=process.argv.slice(2),suites=selected.length?selected:all;if(suites.some(s=>!all.includes(s)))throw Error('Unknown current-product suite.');
const base=process.env.MR_AUDIT_OUTPUT||fs.readFileSync(path.join(root,'artifacts/read-map-current.txt'),'utf8').trim();if(!path.resolve(base).startsWith(path.join(root,'artifacts')+path.sep))throw Error('Reports must stay inside plugin artifacts.');
const output=path.join(base,'run-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(output,{recursive:true});
const report={startedAt:new Date().toISOString(),product:'documents-and-mindmap',platform:process.platform,node:process.version,modelCalls:0,results:[],retiredUI:['card-box view','learning outline view','FSRS review and learning dashboards','smart-board/dashboard navigation','notebook/comparison management panels','legacy split reader/card layout'],untested:['physical trackpad hardware signals beyond native wheel/pinch-style events','Windows','Linux','physical stylus/palm rejection','long-duration heavy-image pressure']};
(async()=>{
 for(const suite of suites){
  const args=suite==='core'?['--test',...fs.readdirSync(path.join(root,'tests')).filter(n=>n.endsWith('.test.cjs')).map(n=>path.join(root,'tests',n))]:[path.join(root,'tests',suite+'.cjs')];
  const log=path.join(output,suite+'.log'),fd=fs.openSync(log,'w'),start=Date.now();let timedOut=false;
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore',fd,fd],detached:true});const stop=signal=>{try{process.kill(-child.pid,signal);}catch{}};
  let escalation;const timeout=setTimeout(()=>{timedOut=true;stop('SIGTERM');escalation=setTimeout(()=>stop('SIGKILL'),5000);},300000);
  const exit=await new Promise(resolve=>{child.once('error',e=>fs.writeSync(fd,e.stack));child.once('close',(exitCode,signal)=>resolve({exitCode:exitCode??1,signal}));});clearTimeout(timeout);clearTimeout(escalation);fs.closeSync(fd);
  const text=fs.readFileSync(log,'utf8'),skipLines=text.split('\n').filter(l=>/^\s*SKIP\b|#\s*SKIP\b|^ℹ skipped [1-9]/i.test(l));
  const row={suite,...exit,seconds:+((Date.now()-start)/1000).toFixed(2),timedOut,log,skipLines};report.results.push(row);report.passed=report.results.filter(r=>r.exitCode===0&&!r.timedOut&&!r.skipLines.length).length;report.failed=report.results.length-report.passed;report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
  console.log(`${exit.exitCode===0&&!timedOut?'PASS':'FAIL'} ${suite}: ${row.seconds}s`);if(exit.exitCode!==0)console.log(text.split('\n').slice(-32).join('\n'));
 }
 console.log('REPORT '+path.join(output,'results.json'));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
