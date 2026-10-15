/** A sandboxed plugin has no Core cookie/CSRF token. Its parent brokers declared RPC through Core. */
export function pluginBridge(token:string){return `(()=>{
const token=${JSON.stringify(token)},original=window.fetch.bind(window);
window.fetch=async(input,options)=>{
 const request=new Request(input,options),url=new URL(request.url);
 if(request.method!=='POST'||url.origin!==location.origin||url.pathname!=='/'+token+'/rpc')return original(input,options);
 if(request.signal.aborted)throw new DOMException('Aborted','AbortError');
 const rpc=await request.json();
 return new Promise((resolve,reject)=>{
  const channel=new MessageChannel();
  const finish=()=>{clearTimeout(timer);channel.port1.close();request.signal.removeEventListener('abort',abort)};
  const abort=()=>{finish();reject(new DOMException('Aborted','AbortError'))};
  const timer=setTimeout(()=>{finish();reject(new Error('Plugin request timed out'))},120000);
  channel.port1.onmessage=event=>{finish();resolve(new Response(JSON.stringify(event.data),{status:200,headers:{'content-type':'application/json'}}))};
  request.signal.addEventListener('abort',abort,{once:true});
  window.parent.postMessage({type:'agents-plugin:rpc',token,request:rpc},'*',[channel.port2]);
 });
};
})();`}
