import { $, escape, field, showDialog, toast, describeError } from './dom.js';
import { api } from './transport.js';
const prefix='library.backup.job.';
const phases={copying:'复制原件',verifying:'完整性校验',ready:'等待发布',publishing:'正在发布',complete:'备份完成'};
const size=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GiB':(n/1048576).toFixed(1)+' MiB';
export class BackupJobs {
  constructor(){this.busy=false;}
  async open(){
    if(this.busy){toast('当前备份批次仍在结束中。完成后再打开进度，已提交的检查点会保留。');return;}
    const list=await api(prefix+'list');
    if(this.busy||$('dialog').open)return;
    let current=null,pauseRequested=false,creatingId=null;
    showDialog({title:'可暂停的本地备份',html:`<section class="backup-job-panel"><p class="dialog-note">准备时冻结学习数据和原件版本。暂停或重启后继续已提交的分块；后来新增的笔记和文件不加入这次快照。已复制的内容保留，尚未复制的原件变化会明确报错。</p>${field('backupJobId','已有检查点','',{choices:[['','准备新的备份'],...list.jobs.map(j=>[j.jobId,new Date(j.createdAt||Date.now()).toLocaleString()+' · '+j.jobId.slice(0,8)+(j.encrypted?' · 加密':'')+(j.error?' · 损坏':'')])]})}${field('backupJobPath','备份到文库中的新目录','resumable-'+new Date().toISOString().slice(0,10)+'.mrbackup')}${field('backupJobPassword','加密口令（每次重新打开后需再次输入）','',{type:'password'})}<div class="backup-job-actions"><button type="button" id="backup-job-prepare">准备检查点</button><button type="button" id="backup-job-load">读取进度</button><button type="button" class="primary" id="backup-job-run">继续到完成</button><button type="button" id="backup-job-pause" disabled>暂停</button></div><div class="backup-job-progress"><div><strong id="backup-job-phase">尚未准备</strong><span id="backup-job-count"></span></div><progress id="backup-job-progress" max="1" value="0"></progress><p id="backup-job-status" role="status">关闭对话框会在当前请求结束后暂停，不会启动隐藏的后台任务。</p><code id="backup-job-receipt"></code></div><details class="backup-job-advanced"><summary>单批推进与任务清理</summary><p class="dialog-note">复制按 4 MiB 数据块提交。首次计算某个文件的 SHA-256 和最终校验按整文件进行；中断这两个步骤时会重新校验当前文件，内存仍按块读取。</p><button type="button" id="backup-job-step">只推进一批</button><button type="button" id="backup-job-publish">发布已验证备份</button><button type="button" id="backup-job-discard">清理此检查点…</button><div id="backup-job-discard-box" hidden><p>只清理该任务的私有检查点和临时副本。文档原件、学习数据和已完成的 .mrbackup 目录均保留。</p><button type="button" id="backup-job-discard-confirm">确认清理</button><button type="button" id="backup-job-discard-cancel">返回</button></div></details></section>`,onSubmit:null,afterOpen:()=>{
      const root=$('dialog-fields').querySelector('.backup-job-panel');
      const control=name=>root.querySelector(`[name="${name}"]`);
      const alive=()=>root.isConnected&&$('dialog').open;
      const auth=()=>({jobId:control('backupJobId').value||creatingId,...(control('backupJobPassword').value?{password:control('backupJobPassword').value}:{})});
      const hasJob=()=>Boolean(control('backupJobId').value||creatingId);
      const enabled=()=>{
        if(!alive())return;
        for(const id of ['backup-job-prepare','backup-job-load','backup-job-run','backup-job-step','backup-job-publish','backup-job-discard','backup-job-discard-confirm'])$(id).disabled=this.busy||(id==='backup-job-prepare'?hasJob():!hasJob());
        $('backup-job-pause').disabled=!this.busy;
        control('backupJobId').disabled=this.busy;control('backupJobPath').disabled=this.busy||hasJob();control('backupJobPassword').disabled=this.busy;
      };
      const paint=result=>{
        current=result;if(!alive())return;
        root.dataset.phase=result.phase;root.dataset.jobId=result.jobId;
        $('backup-job-phase').textContent=phases[result.phase]||result.phase;
        $('backup-job-count').textContent=`${size(result.copiedBytes)} / ${size(result.totalBytes)} · 校验 ${result.filesVerified} / ${result.files}`;
        $('backup-job-progress').max=Math.max(1,result.totalBytes);$('backup-job-progress').value=result.copiedBytes;
        $('backup-job-receipt').textContent='任务 '+result.jobId+' · 修订 '+result.revision;
        control('backupJobPath').value=result.path;
        if(result.phase==='complete')$('backup-job-status').textContent=result.outputAvailable===false?'任务记录已完成，但输出目录不可用。请检查是否已移动备份。':'已发布：'+result.path+'。复制整个目录即可迁移，原件未改变。';
      };
      const task=async work=>{
        if(this.busy)return;this.busy=true;pauseRequested=false;enabled();
        try{await work();}
        catch(error){if(alive()){$('backup-job-status').textContent=(error.code==='PASSWORD_REQUIRED'?'请输入这次备份的正确口令。':error.code==='BUSY'?'任务正由另一个请求处理；异常退出后，安全锁最多需要约两分钟到期。':describeError(error))+' 请读取同一任务的最新进度后再继续。';root.dataset.error=error.code||'error';}}
        finally{this.busy=false;enabled();}
      };
      const load=async()=>{if(!hasJob())throw Error('先准备或选择一个检查点。');const result=await api(prefix+'get',auth());paint(result);return result;};
      const advance=async result=>{
        if(result.phase==='complete')return result;
        if(['ready','publishing'].includes(result.phase))return api(prefix+'publish',{...auth(),expectedRevision:result.revision});
        return api(prefix+'step',{...auth(),expectedRevision:result.revision,maxChunks:4,maxFiles:1});
      };
      $('backup-job-prepare').onclick=()=>task(async()=>{
        const path=control('backupJobPath').value;creatingId||=crypto.randomUUID();
        const select=control('backupJobId');if(![...select.options].some(o=>o.value===creatingId))select.add(new Option('新检查点 · '+creatingId.slice(0,8),creatingId));select.value=creatingId;
        $('backup-job-receipt').textContent='任务 '+creatingId+' · 正在准备';
        const result=await api(prefix+'create',{...auth(),path});paint(result);
        if(alive())$('backup-job-status').textContent='检查点已准备。点击“继续到完成”，或关闭后再恢复。';
      });
      $('backup-job-load').onclick=()=>task(load);
      $('backup-job-run').onclick=()=>task(async()=>{
        let result=await load();
        while(alive()&&!pauseRequested&&result.phase!=='complete'){
          $('backup-job-status').textContent=(result.phase==='copying'?'正在读取与复制原件…':result.phase==='verifying'?'正在校验完整文件…':'正在发布已验证的备份…')+' 可在当前请求结束后暂停。';
          result=await advance(result);paint(result);
        }
        if(alive()&&pauseRequested&&result.phase!=='complete')$('backup-job-status').textContent='已暂停。已提交的分块与校验进度可在重启后恢复。';
        if(result.phase==='complete'&&result.outputAvailable!==false&&alive())toast('可恢复备份已完成：'+result.path);
      });
      $('backup-job-pause').onclick=()=>{pauseRequested=true;$('backup-job-status').textContent='等待当前请求完成后暂停…';};
      $('backup-job-step').onclick=()=>task(async()=>{
        let result=await load();
        if(!['copying','verifying'].includes(result.phase)){if(alive())$('backup-job-status').textContent='数据已验证，可发布备份。';return;}
        result=await api(prefix+'step',{...auth(),expectedRevision:result.revision,maxChunks:1,maxFiles:1});paint(result);
        if(alive())$('backup-job-status').textContent='本批已提交，当前暂停。';
      });
      $('backup-job-publish').onclick=()=>task(async()=>{const result=await load();paint(await api(prefix+'publish',{...auth(),expectedRevision:result.revision}));});
      $('backup-job-discard').onclick=()=>{$('backup-job-discard-box').hidden=false;};
      $('backup-job-discard-cancel').onclick=()=>{$('backup-job-discard-box').hidden=true;};
      $('backup-job-discard-confirm').onclick=()=>task(async()=>{
        const id=auth().jobId;await api(prefix+'discard',{jobId:id});
        if(!alive())return;control('backupJobId').querySelector(`option[value="${id}"]`)?.remove();control('backupJobId').value='';creatingId=null;current=null;
        $('backup-job-discard-box').hidden=true;$('backup-job-phase').textContent='检查点已清理';$('backup-job-status').textContent='原件、学习数据和已发布备份均保留。';$('backup-job-count').textContent='';$('backup-job-progress').value=0;$('backup-job-receipt').textContent='';
      });
      control('backupJobId').onchange=()=>{current=null;creatingId=null;root.dataset.phase='unloaded';enabled();$('backup-job-phase').textContent=hasJob()?'未读取进度':'尚未准备';$('backup-job-count').textContent='';$('backup-job-progress').value=0;$('backup-job-receipt').textContent='';$('backup-job-status').textContent=hasJob()?'输入口令（若加密），然后读取进度。':'填写新的备份路径并准备检查点。';};
      $('dialog').addEventListener('close',()=>{pauseRequested=true;control('backupJobPassword').value='';},{once:true});
      enabled();
    }});
  }
}
