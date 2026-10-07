'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const names=process.argv.slice(2);
const suites=names.length?names:['ui-smoke','local-navigation-ui','workbench-ui','advanced-ui','layout-ui','library-ui','selection-ui','study-ui','pdf-modes-ui','host-smoke','employee-host','team-ui'];
if(suites.some(n=>!/^[-a-z]+$/.test(n)||!fs.existsSync(path.join(root,'tests',n+'.cjs'))))throw Error('Choose existing named test suites.');
const marker=path.join(root,'artifacts/current-completion-path.txt');
const out=fs.existsSync(marker)?fs.readFileSync(marker,'utf8').trim():path.join(root,'artifacts/strict-test');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const results=[];
 for(const suite of suites){
  const started=Date.now(),file=path.join(out,suite+'-latest.log'),log=fs.createWriteStream(file);
  const code=await new Promise(resolve=>{
   const child=spawn(process.execPath,[path.join(root,'tests',suite+'.cjs')],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],timeout:240000});
   child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('error',e=>log.write(e.stack+'\n'));child.on('close',(status,signal)=>{log.end();resolve(signal?124:status??1);});
  });
  const record={suite,exitCode:code,seconds:Math.round((Date.now()-started)/10)/100};results.push(record);
  fs.writeFileSync(path.join(out,'suite-results.json'),JSON.stringify({startedAt:new Date(started).toISOString(),results,passed:results.filter(r=>r.exitCode===0).length,failed:results.filter(r=>r.exitCode!==0).length},null,2));
  console.log(`${code===0?'PASS':'FAIL'} ${suite} (${record.seconds}s): ${file}`);
  if(code!==0)console.log(fs.readFileSync(file,'utf8').split('\n').slice(-28).join('\n'));
 }
 process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
