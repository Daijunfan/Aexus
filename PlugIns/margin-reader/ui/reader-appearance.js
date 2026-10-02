import { $,field,showDialog,run } from './dom.js';
import { api } from './transport.js';
export class ReaderAppearance {
 constructor(study,settingsChanged){
  this.study=study;this.settingsChanged=settingsChanged;
  const button=document.createElement('button');button.id='reader-appearance-open';button.textContent='阅读视图';button.title='阅读亮度、沉浸、文档 / 脑图视图与排列方向';$('theme').before(button);button.onclick=run(()=>this.dialog());
  window.addEventListener('resize',()=>this.apply(this.settings));document.addEventListener('study-view-mounted',()=>this.apply(this.settings));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('dialog').open&&this.settings?.readingMode==='immersive'){e.preventDefault();run(()=>this.settingsChanged({readingMode:'normal'}))();}});
 }
 async dialog(){
  const s=await api('settings.get');
  showDialog({title:'阅读与联动视图',html:field('readingMode','阅读模式',s.readingMode||'normal',{choices:[['normal','标准'],['immersive','沉浸 · 隐藏文件侧栏']]})+field('studyLayout','文档 / 脑图',s.studyLayout||'columns',{choices:[['columns','左右分栏'],['rows','上下分栏'],['document','仅文档'],['map','仅脑图']]})+field('studyOrder','顺序',s.studyOrder||'document-first',{choices:[['document-first','文档在前'],['map-first','脑图在前']]})+field('studyRatio','文档比例',s.studyRatio||.53,{type:'number',min:.3,max:.7})+field('brightness','文档亮度',s.brightness||1,{type:'number',min:.25,max:1.5})+field('pdfDarkMode','PDF 图像颜色',s.pdfDarkMode||'original',{choices:[['original','保持原图颜色'],['invert','反色阅读']]})+field('presentationPointers','演示触点',s.presentationPointers?'yes':'no',{choices:[['no','关闭'],['yes','显示点击 / 触摸 / 笔尖'] ]})+field('theme','界面主题',s.theme,{choices:[['light','浅色'],['dark','深色'],['sepia','暖色']]})+'<p class="dialog-note">设置只影响显示，不会修改原文件。沉浸模式可按 Escape 退出；仅脑图状态下仍可从顶部“阅读视图”恢复文档。</p>',onSubmit:async v=>{this.study.outline=false;await this.settingsChanged({...v,presentationPointers:v.presentationPointers==='yes',studyRatio:Number(v.studyRatio),brightness:Number(v.brightness)});this.study.mount(Boolean(this.study.getDocument()));},afterOpen:()=>{for(const name of ['studyRatio','brightness'])$('dialog-fields').querySelector(`[name="${name}"]`).step='any';}});
 }
 apply(settings){
  if(!settings)return;this.settings=settings;
  const workspace=$('workspace'),main=workspace.querySelector('.main-pane'),explorer=workspace.querySelector('.explorer'),fileDivider=$('explorer-divider'),divider=$('outline-divider'),map=$('study-pane'),outline=$('outline-pane');
  const elements=[main,explorer,fileDivider,divider,map,outline];
  workspace.style.gridTemplateColumns='';workspace.style.gridTemplateRows='';
  for(const el of elements)if(el){el.style.gridColumn='';el.style.gridRow='';el.style.display='';}
  if(!this.study.getDocument())return;
  const active=Boolean(this.study.current),immersive=settings.readingMode==='immersive',layout=active?settings.studyLayout||'columns':'document',swapped=settings.studyOrder==='map-first';
  const custom=immersive||active&&(layout!=='columns'||swapped);
  if(!custom)return;
  const showExplorer=!immersive&&innerWidth>760,prefix=showExplorer?[getComputedStyle(document.documentElement).getPropertyValue('--explorer')||'240px','1px']:[],base=prefix.length+1;
  explorer.style.display=showExplorer?'':'none';fileDivider.style.display=showExplorer?'':'none';if(showExplorer){explorer.style.gridColumn='1';fileDivider.style.gridColumn='2';}
  const canSplit=active&&!this.study.outline&&['columns','rows'].includes(layout);
  outline.style.display=active&&!this.study.outline||immersive||['document','map'].includes(layout)?'none':'';
  if(canSplit&&layout==='rows'){
   workspace.style.gridTemplateColumns=[...prefix,'minmax(0,1fr)'].join(' ');workspace.style.gridTemplateRows=swapped?'minmax(0,var(--study-map,.47fr)) 5px minmax(0,var(--study-document,.53fr))':'minmax(0,var(--study-document,.53fr)) 5px minmax(0,var(--study-map,.47fr))';
   main.style.gridColumn=map.style.gridColumn=divider.style.gridColumn=String(base);main.style.gridRow=swapped?'3':'1';map.style.gridRow=swapped?'1':'3';divider.style.gridRow='2';divider.style.display='';
   if(showExplorer)explorer.style.gridRow=fileDivider.style.gridRow='1/4';
  }else if(canSplit){
   const columns=swapped?['minmax(0,var(--study-map,.47fr))','5px','minmax(0,var(--study-document,.53fr))']:['minmax(0,var(--study-document,.53fr))','5px','minmax(0,var(--study-map,.47fr))'];
   workspace.style.gridTemplateColumns=[...prefix,...columns].join(' ');workspace.style.gridTemplateRows='minmax(0,1fr)';main.style.gridColumn=String(base+(swapped?2:0));map.style.gridColumn=String(base+(swapped?0:2));divider.style.gridColumn=String(base+1);main.style.gridRow=map.style.gridRow=divider.style.gridRow='1';
  }else{
   workspace.style.gridTemplateColumns=[...prefix,'minmax(0,1fr)'].join(' ');workspace.style.gridTemplateRows='minmax(0,1fr)';divider.style.display='none';
   if(active&&layout==='map'){main.style.display='none';map.style.gridColumn=String(base);map.style.gridRow='1';map.style.display='';}
   else{main.style.gridColumn=String(base);main.style.gridRow='1';map.style.display='none';}
  }
  divider.setAttribute('aria-orientation',canSplit&&layout==='rows'?'horizontal':'vertical');divider.style.cursor=canSplit&&layout==='rows'?'row-resize':'col-resize';
 }
}
