const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
// A scan is untrusted until the user verifies it out-of-band. Neither background
// polling nor a failed scan writes known_hosts or relaxes strict SSH checking.
export function verifyHostKey(host,rpc){
 return new Promise(resolve=>{
  const el=document.createElement('dialog'),previous=document.activeElement
  el.className='ssh-trust-dialog';el.innerHTML=`<form><h3>核对 SSH 主机指纹</h3><p data-no-i18n>${esc(host.name)} · ${esc(host.host)}:${host.port||22}</p><p>请通过服务器控制台或管理员核对指纹。若指纹发生变化，请先确认原因。</p><p class="trust-status" role="status">正在读取主机公钥…</p><select class="trust-keys" aria-label="SSH 主机指纹" data-no-i18n disabled></select><label><input type="checkbox" required>我已通过可信渠道核对所选指纹</label><div class="dialog-actions"><button type="button" data-cancel>取消</button><button type="submit" class="primary" disabled>信任并重试</button></div></form>`
  document.body.append(el);el.showModal()
  let alive=true,saving=false
  const status=el.querySelector('.trust-status'),keys=el.querySelector('.trust-keys'),submit=el.querySelector('[type=submit]')
  const finish=value=>{if(!alive)return;alive=false;el.close();el.remove();if(previous?.isConnected)previous.focus({preventScroll:true});resolve(value)}
  el.oncancel=event=>{event.preventDefault();if(!saving)finish(false)};el.querySelector('[data-cancel]').onclick=()=>{if(!saving)finish(false)}
  el.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(saving||!keys.value||!event.target.reportValidity())return
   saving=true;submit.disabled=true;keys.disabled=true
   try{await rpc('hosts.trust',{id:host.id,fingerprint:keys.value});finish(true)}
   catch(error){if(alive){status.textContent=error.message;submit.disabled=false;keys.disabled=false}}
   finally{saving=false}
  }
  void rpc('hosts.fingerprints',{id:host.id}).then(rows=>{
   if(!alive)return
   if(!rows.length){status.textContent='未取得主机公钥，请检查地址、端口或网络。';return}
   keys.innerHTML=rows.map(key=>`<option value="${esc(key.fingerprint)}">${esc(key.algorithm)} · ${esc(key.fingerprint)}</option>`).join('')
   keys.disabled=false;submit.disabled=false;status.textContent='核对后才会保存；取消不会信任此主机。'
  }).catch(error=>{if(alive)status.textContent=error.message})
 })
}
