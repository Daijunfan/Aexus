import { $, field, showDialog, toast, run } from './dom.js';
import { api } from './transport.js';
async function encoded(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
export class StudyExport {
  constructor(study){
    this.study=study;this.busy=false;
    const button=document.createElement('button');button.id='study-import-package';button.textContent='导入';button.title='导入完整本地学习集包';button.setAttribute('aria-label',button.title);$('study-create').before(button);button.onclick=()=>this.importPackage();
  }
  export(){
    const set=this.study.current;
    showDialog({title:'导出学习集',html:field('format','格式','mrpkg',{choices:[['mrpkg','完整学习集包 · 原文 / 媒体 / 历史'],['html','离线 HTML · 可播放音频'],['md','Markdown · 含内嵌媒体'],['docx','Word 文档 · 文字与图片'],['opml','OPML 大纲 · 层级与文字'],['apkg','Anki 牌组 · 问答与媒体'],['pdf','脑图 PDF · 可打印'],['json','兼容 JSON · 卡片与媒体']]})+field('path','保存路径（相对文库）',`study-${set.id.slice(0,8)}.mrpkg`,{required:true})+field('scope','内容范围','all',{choices:[['all','全部内容'],['selected','当前选中卡片 / 分支'],['review','已加入复习的卡片']]})+field('password','完整包加密口令（可选，至少 8 位）','',{type:'password'})+field('layout','PDF 输出','sheets',{choices:[['sheets','分幅打印，文字可读'],['poster','单张大图']]})+'<p class="dialog-note">完整包保留源文件、摘录图片、音频、关联与撤销历史。新建文件，不覆盖原件。Anki 导出为新卡安排，不迁移 FSRS 调度记录。</p>',submit:'导出',onSubmit:async v=>{
      this.busy=true;
      try{
        let result;
        if(v.format==='mrpkg')result=await api('study.package.export',{setId:set.id,expectedRevision:set.revision,path:v.path,...(v.password?{password:v.password}:{})});
        else if(v.format==='json')result=await api('study.export',{setId:set.id,path:v.path,includeImages:true});
        else{
          const ids=this.study.organization.ids();if(v.scope==='selected'&&!ids.length)throw Error('请先选择卡片或分支');
          result=await api('study.export.file',{setId:set.id,expectedRevision:set.revision,path:v.path,format:v.format,expanded:true,poster:v.layout==='poster',...(v.scope==='review'?{reviewOnly:true}:v.scope==='selected'?(ids.length===1?{rootId:ids[0]}:{cardIds:ids}):{})});
        }
        toast(`已导出：${result.path}${result.warnings?.length?' · '+result.warnings.join('；'):''}`);
      }finally{this.busy=false;}
    },afterOpen:()=>{
      const format=$('dialog-fields').querySelector('[name=format]'),path=$('dialog-fields').querySelector('[name=path]');
      format.onchange=()=>{path.value=path.value.replace(/\.[a-z0-9]+$/i,'')+'.'+format.value;$('dialog-fields').querySelector('[name=password]').disabled=format.value!=='mrpkg';};
    }});
  }
  importPackage(){
    let staged,selected;
    showDialog({title:'导入完整学习集',html:'<label class="dialog-field"><span>本地 .mrpkg 文件</span><input name="package" type="file" accept=".mrpkg" required></label>'+field('folder','恢复到新文件夹',`Restored-${new Date().toISOString().slice(0,10)}-${crypto.randomUUID().slice(0,4)}`,{required:true})+field('title','学习集名称（可选）')+field('password','加密口令（未加密可留空）','',{type:'password'})+'<p id="package-progress" class="dialog-note">验证完整包后创建独立副本；不会覆盖现有文档或学习集，也不会扩大员工权限。</p>',submit:'验证并导入',onSubmit:async v=>{
      const file=$('dialog-fields').querySelector('[name=package]').files[0];if(!file||!/\.mrpkg$/i.test(file.name))throw Error('请选择 .mrpkg 学习集包');if(file.size>256*1024*1024)throw Error('学习集包超过 256 MiB');
      this.busy=true;
      try{
        if(selected!==file||!staged){
          const path=`import-${crypto.randomUUID().slice(0,8)}.mrpkg`,upload=await api('import.begin',{path,totalBytes:file.size});let complete=false;
          try{for(let offset=0;offset<file.size;offset+=1024*1024){$('package-progress').textContent=`正在传入 ${Math.round(offset/file.size*100)}%…`;await api('import.chunk',{uploadId:upload.uploadId,offset,contentBase64:await encoded(file.slice(offset,offset+1024*1024))});}await api('import.finish',{uploadId:upload.uploadId,parse:false,activate:false});complete=true;staged=path;selected=file;}
          finally{if(!complete)await api('import.abort',{uploadId:upload.uploadId}).catch(()=>{});}
        }
        $('package-progress').textContent='正在校验媒体与原文，并恢复独立副本…';
        const result=await api('study.package.import',{path:staged,folder:v.folder,...(v.title?{title:v.title}:{}),...(v.password?{password:v.password}:{})});
        await this.study.refreshList();setTimeout(()=>run(()=>this.study.home(result.setId))(),0);toast(`已恢复 ${result.setIds.length} 个学习集，${result.documents.length} 份原文`);
      }finally{this.busy=false;}
    }});
  }
}
