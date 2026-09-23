// Adapt existing exec fixtures to the real app-server contract, without inference.
import fs from 'node:fs'
export function nativeFixture(binary){
  const wrapper=binary+'-native'
  fs.writeFileSync(wrapper,`#!/usr/bin/env node
const {spawn}=require('child_process'),readline=require('readline'),crypto=require('crypto');
const original=${JSON.stringify(binary)},argv=process.argv.slice(2),emit=v=>process.stdout.write(JSON.stringify(v)+'\\n');let thread,options={},child,turn;
if(!argv.includes('app-server')){const p=spawn(original,argv,{stdio:'inherit'});p.on('exit',code=>process.exit(code??1));process.on('SIGTERM',()=>p.kill('SIGTERM'));}else{
process.on('SIGTERM',()=>{child?.kill('SIGTERM');process.exit(0)});
readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line),p=r.params??{};if(r.id===undefined)return;
if(r.method==='thread/start'||r.method==='thread/resume'){thread=p.threadId||crypto.randomUUID();options=p;emit({id:r.id,result:{thread:{id:thread}}});return}
if(r.method==='turn/interrupt'){child?.kill('SIGTERM');emit({id:r.id,result:{}});return}
if(r.method!=='turn/start'){emit({id:r.id,result:{}});return}
turn=crypto.randomUUID();emit({id:r.id,result:{turn:{id:turn}}});emit({method:'turn/started',params:{turn:{id:turn}}});
const config=[];for(let i=0;i<argv.length-1;i++)if(argv[i]==='-c')config.push('-c',argv[++i]);
const model=p.model||options.model||'gpt-5.6-luna',effort=p.effort||'low',args=['exec',...config,'--json','--skip-git-repo-check','-m',model,'-c','model_reasoning_effort='+JSON.stringify(effort),'-c','service_tier='+JSON.stringify(p.serviceTier||'default'),'-'];
child=spawn(original,args,{cwd:p.cwd||options.cwd,stdio:['pipe','pipe','pipe']});child.stderr.pipe(process.stderr);
readline.createInterface({input:child.stdout}).on('line',line=>{let ev;try{ev=JSON.parse(line)}catch{return}const item=ev.item;if(ev.type==='item.completed'&&item?.type==='agent_message')emit({method:'item/completed',params:{item:{type:'agentMessage',id:item.id,text:item.text}}});if(ev.type==='item.completed'&&item?.type==='command_execution')emit({method:'item/completed',params:{item:{type:'commandExecution',id:item.id,command:item.command,aggregatedOutput:item.aggregated_output,exitCode:item.exit_code}}});if(ev.type==='error'||ev.type==='turn.failed')emit({method:'error',params:{willRetry:false,error:{message:ev.message||ev.error?.message||'fixture failure'}}})});
child.on('close',code=>{emit({method:'turn/completed',params:{turn:{id:turn,status:code===0?'completed':'interrupted'}}});child=undefined});child.stdin.end((p.input||[]).filter(v=>v.type==='text').map(v=>v.text).join('\\n'));
});}
`,{mode:0o755})
  return wrapper
}
