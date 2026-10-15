const fs=require('node:fs'),path=require('node:path');
const registry=require('./registry.cjs'),ssh=require('./ssh.cjs');
function detectVirtualization(signals={}) {
  const {manufacturer='',model='',bios='',hypervisor='',container='',hypervisorPresent=false}=signals;
  const evidence=[manufacturer&&'厂商：'+manufacturer,model&&'型号：'+model,bios&&'固件：'+bios].filter(Boolean);
  const detected=hypervisor&&hypervisor!=='none'?hypervisor:'';
  const text=manufacturer+' '+model+' '+bios;
  const match=[['QEMU/KVM',/qemu|kvm|seabios|bochs/i],['VMware',/vmware/i],['VirtualBox',/virtualbox|innotek/i],['Hyper-V',/virtual machine/i],['Parallels',/parallels/i],['Xen',/xen|hvm domu/i],['Apple Virtualization',/virtualmac/i],['Cloud VM',/google compute engine|openstack|digitalocean/i]].find(([,pattern])=>pattern.test(text));
  if(detected)evidence.unshift('系统虚拟化检测：'+detected);
  if(container&&container!=='none')evidence.push('容器环境：'+container);
  if(hypervisorPresent)evidence.push('检测到 Hypervisor；物理机启用虚拟化功能也会出现此标志');
  const isVirtual=!!(detected||match);
  const physical=!isVirtual&&((hypervisor==='none'&&!hypervisorPresent)||/lenovo|dell|hewlett|hp |supermicro|apple|asus|gigabyte|inspur/i.test(manufacturer));
  return {kind:isVirtual?'virtual':physical?'physical':'unknown',isVirtual:isVirtual?true:physical?false:null,platform:detected||match?.[0]||'',container:container&&container!=='none'?container:'',evidence};
}
async function inspect(value) {
  const host=registry.get(value),script=fs.readFileSync(path.join(__dirname,'../Runtime/host_info.'+(host.os==='windows'?'ps1':'py')),'utf8');
  const command=host.os==='windows'?script:'python3 -c '+ssh.quote(script);
  const reply=await ssh.execute(host.id,command,undefined,40);
  if(reply.exit_code)throw Error(reply.stderr.trim()||'Unable to read host information');
  const raw=JSON.parse(reply.stdout.trim()),{virtualSignals,...data}=raw;
  const info={...data,virtualization:detectVirtualization(virtualSignals),checkedAt:Date.now()};
  registry.update(host.id,{info});return info;
}
module.exports={inspect,detectVirtualization};
