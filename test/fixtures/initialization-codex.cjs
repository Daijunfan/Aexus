#!/usr/bin/env node
// Native protocol fixture only. Never sends a network/model request.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),rl=require('node:readline').createInterface({input:process.stdin})
const control=process.env.AC_INIT_FIXTURE;if(!control)throw Error('AC_INIT_FIXTURE is required')
const employee=process.env.AGENTS_COMPANY_EMPLOYEE||'catalog',send=value=>process.stdout.write(JSON.stringify(value)+'\n')
const event=(method,params)=>send({method,params})
let thread='',cwd=process.cwd(),turn='',timer
const note=(suffix,value)=>fs.writeFileSync(path.join(control,employee+'-'+suffix+'.json'),JSON.stringify(value))
rl.on('line',line=>{
  const request=JSON.parse(line),p=request.params||{},result=value=>send({id:request.id,result:value})
  if(request.id===undefined)return
  switch(request.method){
    case 'initialize':return result({userAgent:'initialization-fixture'})
    case 'model/list':return result({data:[{id:'gpt-6-luna',model:'gpt-6-luna',displayName:'Fixture',isDefault:true,supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'},{id:'fixture-alt',model:'fixture-alt',displayName:'Fixture alternate'}],nextCursor:null})
    case 'thread/start':case 'thread/resume':thread=p.threadId||crypto.randomUUID();cwd=p.cwd||cwd;return result({thread:{id:thread,turns:[]}})
    case 'thread/read':return send({id:request.id,error:{code:-32000,message:'thread not found'}})
    case 'turn/start':{
      turn=crypto.randomUUID();const text=(p.input||[]).map(x=>x.text||'').join(''),hidden=text.includes('[Agents Company private initialization]')
      note(hidden?'initializing':'user',{thread,turn,text,cwd,model:p.model})
      result({turn:{id:turn,status:'inProgress'}});event('turn/started',{threadId:thread,turn:{id:turn}})
      const complete=()=>{
        if(hidden&&!fs.existsSync(path.join(control,employee+'.release'))&&!fs.existsSync(path.join(control,'release-all')))return
        if(!hidden&&fs.existsSync(path.join(control,employee+'.hold-user')))return
        clearInterval(timer)
        const failure=hidden&&fs.existsSync(path.join(control,employee+'.fail'))
        if(failure){event('turn/completed',{threadId:thread,turn:{id:turn,status:'failed',error:{message:'fixture initialization failure'}}});return}
        if(hidden){
          event('item/completed',{threadId:thread,turnId:turn,item:{id:'reading-commentary',type:'agentMessage',text:'PRIVATE_INIT_READING_COMMENTARY'}})
          const files=[...text.matchAll(/^- (.+\.md)$/gm)].map(match=>path.resolve(cwd,match[1]))
          const contents=files.map(file=>fs.readFileSync(file,'utf8'));note('read',{files,bytes:contents.map(text=>text.length)})
          event('item/completed',{threadId:thread,turnId:turn,item:{id:'read-guides',type:'commandExecution',command:'read hidden handbooks',aggregatedOutput:'PRIVATE_INIT_TOOL_OUTPUT',exitCode:0}})
        }
        event('item/completed',{threadId:thread,turnId:turn,item:{id:'answer',type:'agentMessage',text:hidden?(fs.existsSync(path.join(control,employee+'.bad-ok'))?'NOT_READY':'OK'):(fs.existsSync(path.join(control,employee+'.reply.txt'))?fs.readFileSync(path.join(control,employee+'.reply.txt'),'utf8'):'VISIBLE_REPLY')}})
        event('turn/completed',{threadId:thread,turn:{id:turn,status:'completed'}})
      }
      timer=setInterval(complete,50);return
    }
    case 'turn/interrupt':clearInterval(timer);result({});return event('turn/completed',{threadId:thread,turn:{id:turn,status:'interrupted'}})
    default:return result({})
  }
})
process.on('SIGTERM',()=>{clearInterval(timer);process.exit(0)});rl.on('close',()=>process.exit(0))
