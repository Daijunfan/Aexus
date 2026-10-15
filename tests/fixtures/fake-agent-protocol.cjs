#!/usr/bin/env node
// Deterministic native protocol fixture, no actual AI request.
const engine=process.env.FAKE_ENGINE,argv=process.argv.slice(2);
let buffer='',turn=0,approval=null,session=argv[argv.indexOf('--session-id')+1];
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
if(engine==='claude'){
 const id=argv.includes('--resume')?argv[argv.indexOf('--resume')+1]:session;
 send({type:'system',subtype:'init',session_id:id});
 send({type:'assistant',message:{content:[{type:'text',text:'Claude structured result'}]}});
 send({type:'result',session_id:id,subtype:'success',is_error:false,result:'Claude structured result'});
 process.exit(0);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data',data=>{
 buffer+=data;
 for(let end;(end=buffer.indexOf('\n'))>=0;){
  const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
  if(!line)continue;
  let msg;try{msg=JSON.parse(line)}catch{continue}
  if(engine==='pi'){
   if(msg.type==='get_state'){send({type:'response',id:msg.id,success:true,data:{sessionId:session}});continue}
   if(msg.type==='prompt'){
    turn++;send({type:'response',id:msg.id,success:true,data:{queued:true}});
    approval=String(turn)+'-pi';
    send({type:'extension_ui_request',method:'confirm',title:'CloudHosts approval',id:approval,
     message:JSON.stringify({toolName:'bash',toolCallId:'t-'+turn,input:{command:'echo test'}})});
    continue;
   }
   if(msg.type==='extension_ui_response'&&msg.id===approval){
    send({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:'Pi result '+turn}});
    send({type:'agent_settled'});
   }
   if(msg.type==='abort')send({type:'agent_settled',error:{message:'aborted'}});
  }else if(engine==='cline'){
   if(msg.method==='initialize'){send({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:1}});continue}
   if(msg.method==='session/new'||msg.method==='session/load'){
    send({jsonrpc:'2.0',id:msg.id,result:{sessionId:msg.params.sessionId||'mock-cline-session'}});
    continue;
   }
   if(msg.method==='session/prompt'){
    approval=msg.id;turn++;
    send({jsonrpc:'2.0',id:499,method:'session/request_permission',params:{sessionId:'mock-cline-session',
     toolCall:{toolCallId:'cline-'+turn,title:'Edit source',kind:'edit',rawInput:{path:'test.ts'}},
     options:[{optionId:'approve',kind:'allow_once'},{optionId:'reject',kind:'reject_once'}]}});
    continue;
   }
   if(msg.id===499&&msg.result){
    send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'mock-cline-session',
     update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Cline result '+turn}}}});
    send({jsonrpc:'2.0',id:approval,result:{stopReason:'end_turn'}});
   }
  }
 }
});
