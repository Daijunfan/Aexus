import { BackupJobs } from './backup-jobs.js';
import {$,escape,field,showDialog,closeDialog,run,toast} from './dom.js';
import {api} from './transport.js';
export class BackupTools{
 constructor(study){
  this.study=study;this.jobs=new BackupJobs();const button=document.createElement('button');button.id='library-backups';button.textContent='备份 / 版本';$('new-folder').after(button);button.onclick=()=>this.backupMenu();
  const versions=document.createElement('button');versions.id='study-versions';versions.textContent='版本';$('study-edit-set').after(versions);versions.onclick=run(()=>this.versions());
  const current=document.createElement('button');current.id='study-version-toolbar';current.textContent='历史版本';$('study-tools-customize').after(current);current.onclick=run(()=>this.versions());
 }
 backupMenu(){
  showDialog({title:'本地备份与恢复',html:'<div class="organize-actions"><button type="button" id="backup-create">备份当前完整文库</button><button type="button" id="backup-resumable">可暂停 / 重启续做的备份</button><button type="button" id="backup-inspect">检查备份</button><button type="button" id="backup-restore">恢复到新文件夹</button></div><p class="dialog-note">保存文档、卡片、附件、回收站和历史版本。不会复制员工凭据、Git 数据或进行中的上传。恢复始终使用新目录，不替换当前文库。</p>',onSubmit:null,afterOpen:()=>{$('backup-resumable').onclick=run(()=>{closeDialog();return this.jobs.open();});for(const action of ['create','inspect','restore'])$('backup-'+action).onclick=()=>{closeDialog();this.backup(action);};}});
 }
 backup(action){
  showDialog({title:action==='create'?'创建完整本地备份':action==='restore'?'恢复完整本地备份':'检查备份',html:field('path','文库内备份路径','library-'+new Date().toISOString().slice(0,10)+'.mrbackup',{required:true})+(action==='create'?field('format','备份格式','segmented',{choices:[['segmented','分块目录包 · 适合大文库'],['zip','旧版单文件 ZIP · 最多 256 MiB']]})+'<button type="button" id="backup-plan">预估容量与可用空间</button><p id="backup-plan-status" role="status"></p>':'')+(action==='restore'?field('folder','恢复到新文件夹','Restored-library',{required:true}):'')+field('password','加密口令（未加密时留空）','',{type:'password'})+'<p class="dialog-note">加密使用 AES-256-GCM，口令不保存。分块目录包逐块读写与校验，不将整库装入内存；迁移时必须复制整个 .mrbackup 文件夹。数据预算 1 TiB / 100000 个文件，状态和清单各限 64 MiB。旧版 ZIP 仍可检查和恢复。工作期间避免修改文库；并发修改会拒绝发布混合备份。</p>',submit:action==='create'?'创建备份':action==='restore'?'验证并恢复':'检查完整性',onSubmit:async v=>{
   const params={path:v.path,...(v.password?{password:v.password}:{}),...(action==='restore'?{folder:v.folder}:{}),...(action==='create'?{format:v.format}:{})};
   const result=action==='create'?await api('library.backup.create',params):action==='inspect'?await api('library.backup.inspect',params):await api('library.backup.restore',params);
   if(action==='inspect')toast(`校验通过：${result.files} 个文件，${result.studies.length} 个学习集。`);
   else if(action==='restore')toast(`已恢复到 ${result.folder}。可将该目录作为独立文库打开；当前文库未替换。`);
   else toast(`已备份 ${result.files} 个文件：${result.path}`);
  },afterOpen:()=>{if(action==='create')$('backup-plan').onclick=run(async()=>{const button=$('backup-plan');button.disabled=true;try{const data=await api('library.backup.plan',{path:$('dialog-fields').querySelector('[name=path]').value});const unit=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GiB':(n/1048576).toFixed(1)+' MiB';if($('backup-plan-status'))$('backup-plan-status').textContent=`${data.files} 个文件 · 原始内容 ${unit(data.originalBytes)} · 预计新增 ${unit(data.estimatedAdditionalBytes)} · 可用 ${unit(data.availableBytes)}${data.sufficientSpace?'':' · 空间不足'}${data.fitsLegacyZip?'':' · 超过旧版 ZIP 限制，请使用分块目录包'}`;}finally{button.disabled=false;}});}});
 }
 async versions(){
  const set=this.study.current;if(!set){toast('先打开一个学习集');return;}const data=await api('study.versions.list',{setId:set.id,includeArchived:true,limit:100});
  showDialog({title:'历史版本 · '+set.title,html:'<div class="board-actions"><button type="button" id="version-create">保存当前版本</button><button type="button" id="version-policy">自动版本设置</button></div><div class="version-list">'+data.versions.map(v=>`<section><strong>${escape(v.title)}</strong><small>${escape(new Date(v.createdAt).toLocaleString())} · ${v.cardCount} 张卡片${v.automatic?' · 自动':''}${v.archived?' · 已归档':''}</small><button type="button" data-version="${v.id}" data-action="inspect">比较 / 恢复</button><button type="button" data-version="${v.id}" data-action="archive">${v.archived?'取消归档':'归档'}</button></section>`).join('')+'</div>',onSubmit:null,afterOpen:()=>{
   $('version-create').onclick=()=>{closeDialog();showDialog({title:'保存历史版本',html:field('title','版本名称',new Date().toLocaleString(),{required:true}),onSubmit:v=>this.study.change('study.versions.create',{title:v.title},data.revision)});};
   $('version-policy').onclick=()=>{closeDialog();showDialog({title:'自动历史版本',html:field('enabled','状态',data.policy.enabled?'yes':'no',{choices:[['yes','开启'],['no','关闭']]})+field('intervalSeconds','最短间隔（秒）',data.policy.intervalSeconds||600,{type:'number',min:30,max:86400})+'<p class="dialog-note">达到间隔后的下一次修改会先保存旧状态；无修改时不产生版本。文档原件不回退，已有图片和附件持续保留。最多保留 500 个可恢复版本。</p>',onSubmit:v=>this.study.change('study.versions.policy',{enabled:v.enabled==='yes',intervalSeconds:Number(v.intervalSeconds)},data.revision)});};
   $('dialog-fields').querySelectorAll('[data-version]').forEach(b=>b.onclick=run(async()=>{const v=data.versions.find(v=>v.id===b.dataset.version);closeDialog();if(b.dataset.action==='archive'){await this.study.change('study.versions.update',{versionId:v.id,archived:!v.archived},data.revision);return this.versions();}
    const version=await api('study.versions.get',{setId:set.id,versionId:v.id});showDialog({title:'版本比较 · '+v.title,html:`<p>${version.summary.cards} 张历史卡片；与当前相比，新增 ${version.changes.added.length}、移除 ${version.changes.removed.length}、修改 ${version.changes.changed.length} 张。</p><p class="dialog-note">恢复后保留当前状态供撤销。原文件不被改写；来源发生变化的旧坐标仍会提示失效。</p>`+field('title','版本名称',v.title,{required:true})+field('action','操作','rename',{choices:[['rename','只重命名'],['restore','恢复此版本']]}),submit:'执行',onSubmit:values=>this.study.change(values.action==='restore'?'study.versions.restore':'study.versions.update',{versionId:v.id,...(values.action==='rename'?{title:values.title}:{})},version.revision)});
   }));
  }});
 }
}
