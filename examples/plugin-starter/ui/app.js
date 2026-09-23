const base=new URL('.',location.href),token=location.pathname.split('/')[1];
document.querySelector('#save').onclick=async()=>{
  const reply=await fetch(new URL('rpc',base),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'notes.write',params:{name:document.querySelector('#name').value,content:document.querySelector('#content').value}})}).then(r=>r.json());
  document.querySelector('#status').textContent=JSON.stringify(reply,null,2);
};
// A real editor should await pending writes here and return error on save failure.
window.addEventListener('message',event=>{
  if(event.source===parent&&event.data?.token===token&&event.data.type==='agents-plugin:flush')parent.postMessage({type:'agents-plugin:flushed',token,id:event.data.id},'*');
});
parent.postMessage({type:'agents-plugin:ready',token},'*');
