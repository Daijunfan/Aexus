window.runFileBoardChecks=async()=>{
 const checks=[],record=(name,pass)=>checks.push({name,passed:!!pass}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const calls=[],fingerprint='SHA256:specific-out-of-band-verified-test-key';
 const host={id:'fake-host-id',name:'Test Machine',host:'host.invalid',port:2222,os:'linux',desktop:{protocol:'rdp',address:'127.0.0.1',port:3389}};
 const rpc=async(method,args)=>{calls.push({method,args});if(method==='hosts.fingerprints')return [{algorithm:'ssh-ed25519',fingerprint,line:'example.invalid ssh-ed25519 AAAA'}];if(method==='hosts.trust')return 'ok';throw Error('Unexpected RPC: '+method)};
 const first=window.expertTrust(host,rpc);await sleep(60);
 record('22: new SSH host displays its host, port and untrusted fingerprint',
  document.querySelector('.ssh-trust-dialog')?.textContent.includes('host.invalid:2222')&&document.querySelector('.trust-keys')?.value===fingerprint);
 document.querySelector('.ssh-trust-dialog [data-cancel]').click();await sleep(15);
 record('22: cancelling never writes a trusted SSH key',await first===false&&!calls.some(x=>x.method==='hosts.trust'));
 const second=window.expertTrust(host,rpc);await sleep(60);
 const panel=document.querySelector('.ssh-trust-dialog'),form=panel.querySelector('form');
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await sleep(35);
 record('22: SSH fingerprint trust requires explicit out-of-band verification checkbox',!calls.some(x=>x.method==='hosts.trust'));
 panel.querySelector('[type=checkbox]').checked=true;
 form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 record('22: confirmed trust pins only the explicitly selected fingerprint',await second===true&&
  calls.find(x=>x.method==='hosts.trust')?.args.id===host.id&&calls.find(x=>x.method==='hosts.trust')?.args.fingerprint===fingerprint);
 const root=document.querySelector('#root');
 let mounted=0,active=false,activeProfile='';
 const makePane=()=>(panel,host)=>{
  mounted++;activeProfile=JSON.stringify(host.desktop);panel.dataset.profile=activeProfile;
  const cleanup=()=>{};cleanup.pause=()=>{};cleanup.hasConnection=()=>active;
  cleanup.updateHost=host=>{panel.dataset.name=host.name};return cleanup;
 };
 const tabs=window.expertTabs(root,()=>{},()=>{},makePane,()=>{},()=>{});
 await tabs.open({...host});
 record('12: remote desktop tab initially loads configured profile',mounted===1&&activeProfile.includes('3389'));
 tabs.update({...host,desktop:{protocol:'vnc',address:'127.0.0.1',port:5900}});await sleep(50);
 record('12: changing a disconnected desktop profile remounts its panel',mounted===2&&root.querySelector('.remote-panel')?.dataset.profile.includes('5900'));
 active=true;
 tabs.update({...host,desktop:{protocol:'rdp',address:'127.0.0.1',port:3391}});await sleep(50);
 record('12: an already connected desktop is not interrupted by a profile save',mounted===2);
 active=false;
 tabs.update({...host,desktop:{protocol:'rdp',address:'127.0.0.1',port:3391}});await sleep(50);
 record('12: disconnected panel applies the latest saved desktop configuration',mounted===3&&root.querySelector('.remote-panel')?.dataset.profile.includes('3391'));
 tabs.dispose();
 return {passed:checks.every(c=>c.passed),checks};
}
