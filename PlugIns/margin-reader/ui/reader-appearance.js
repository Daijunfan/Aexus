import {$,field,showDialog,run} from './dom.js';
import {api} from './transport.js';
export class ReaderAppearance{
 constructor(study,settingsChanged){
  this.study=study;this.settingsChanged=settingsChanged;
  const button=document.createElement('button');button.id='reader-appearance-open';button.textContent='阅读设置';button.title='亮度、颜色与沉浸阅读';$('theme').before(button);button.onclick=run(()=>this.dialog());
  window.addEventListener('resize',()=>this.apply(this.settings));document.addEventListener('study-view-mounted',()=>this.apply(this.settings));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog').open&&this.settings?.readingMode==='immersive')run(()=>settingsChanged({readingMode:'normal'}))();});
 }
 async dialog(){
  const s=await api('settings.get');showDialog({title:'阅读设置',html:field('readingMode','阅读空间',s.readingMode||'normal',{choices:[['normal','标准'],['immersive','沉浸 · 隐藏文件侧栏']]})+field('brightness','文档亮度',s.brightness||1,{type:'number',min:.25,max:1.5})+field('pdfDarkMode','PDF 颜色',s.pdfDarkMode||'original',{choices:[['original','保持原图颜色'],['invert','反色阅读']]})+field('theme','界面',s.theme,{choices:[['light','浅色'],['dark','深色'],['sepia','暖色']]}),onSubmit:v=>this.settingsChanged({...v,brightness:Number(v.brightness)}),afterOpen:()=>{$('dialog-fields').querySelector('[name=brightness]').step='any';}});
 }
 apply(settings){
  if(!settings)return;this.settings=settings;
  const workspace=$('workspace');workspace.style.gridTemplateColumns='';workspace.style.gridTemplateRows='';
  for(const el of [workspace.querySelector('.main-pane'),workspace.querySelector('.explorer'),$('explorer-divider'),$('outline-divider'),$('study-pane'),$('outline-pane')])if(el){el.style.gridColumn='';el.style.gridRow='';el.style.display='';}
  workspace.classList.toggle('reader-immersive',Boolean(this.study.getDocument()&&settings.readingMode==='immersive'));
 }
}
