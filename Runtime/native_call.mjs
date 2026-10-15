// Local transport client for native hook runtimes; credentials stay in the environment.
const shell=process.argv[2]==='--shell';
let input='';if(shell)input=JSON.stringify({operation:'call',args:{tool:{tool:'Bash',command:process.argv[3]}}});
else for await(const chunk of process.stdin)input+=chunk;
try{
 const response=await fetch(process.env.CLOUD_HOSTS_ROUTE_URL,{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUD_HOSTS_ROUTE_TOKEN,'content-type':'application/json'},body:input});
 const result=await response.json();if(result.error)throw Error(result.error);
 if(shell){
  const reply=result.result.reply;
  if(reply.deny||reply.isError){const message=reply.deny||reply.text||String(reply.result);process.stderr.write(message+'\n');process.exitCode=Number(message.match(/^Exit code (\d+)/m)?.[1])||1}
  else {process.stdout.write(reply.result.backgroundTaskId?reply.text||'':reply.result.stdout||'');process.stderr.write(reply.result.stderr||'');if(reply.result.interrupted)process.exitCode=130}
 }else process.stdout.write(JSON.stringify(result.result));
}catch(error){process.stderr.write(error.message);process.exitCode=1}
