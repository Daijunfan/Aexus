// Local-loopback publisher capability. A collector token never enters the
// operator RPC, Agent tools, general request logs or a browser origin.
'use strict';
const channels=require('./channels.cjs');
async function handle(req,res){
 const json=(code,body)=>res.writeHead(code,{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff'}).end(JSON.stringify(body));
 if(req.method!=='POST'){json(405,{error:'Collector ingestion requires POST'});return}
 if(req.headers.origin){json(403,{error:'Browser-origin collector requests are disabled'});return}
 if(!/^application\/json(?:;|$)/i.test(String(req.headers['content-type']||''))){json(415,{error:'Collector requires JSON'});return}
 const match=String(req.headers.authorization||'').match(/^Bearer (news_[a-f0-9]{64})$/);
 if(!match){json(401,{error:'Collector authentication required'});return}
 let payload,length=0;
 try{
  const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>2*1024*1024){json(413,{error:'Collector request too large'});return}
   chunks.push(chunk)}
  payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(key=>!['method','args'].includes(key)))
   throw Error('Invalid collector payload');
  const result=channels.ingest(match[1],payload);
  json(200,{ok:true,result});
 }catch(error){
  const message=String(error?.message||'');
  const status=/Collector token/.test(message)?401:/Collector|unauthorized|disabled|scope/.test(message)?403:400;
  json(status,{error:message});
 }
}
module.exports={handle};
