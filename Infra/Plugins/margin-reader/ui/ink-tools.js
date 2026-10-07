import {bindingSettings,mapInkVisibility} from './ink-binding.mjs';
import {InkRulers} from './ink-rulers.js';
import {InkToolbar} from './ink-toolbar.js';
import {imageBounds as measuredImageBounds} from './image-ink.js';
import {$,field,showDialog,run,toast} from './dom.js';
import {polylineIntersectsPolygon} from './ink-shapes.mjs';
const choices={brush:[['pen','钢笔 / 压感'],['pencil','铅笔'],['highlighter','荧光笔'],['laser','消失笔 · 不保存']],shape:[['free','自由手写'],['line','直线'],['rectangle','矩形'],['ellipse','椭圆'],['ruler','指定角度尺子']]};
export class InkTools {
  constructor(study){this.study=study;this.rulers=new InkRulers(study);this.toolbar=new InkToolbar(study);}
  get settings(){return {brush:'pen',color:'blue',width:.004,canvasWidth:3,opacity:1,shape:'free',straighten:'off',perfectShape:false,rulerAngle:0,pressure:true,vanish:false,eraser:'stroke',eraserAutoCancel:false,...this.study.current?.inkSettings,cardWidth:this.study.current?.inkSettings?.cardWidth??this.study.current?.inkSettings?.width??.004};}
  configure(){
    const set=this.study.current;if(!set)return;const s=this.settings;
    showDialog({title:'手写工具设置',html:field('brush','笔刷',s.brush,{choices:choices.brush})+field('color','颜色',s.color,{choices:this.study.colors.some(c=>c[0]===s.color)?this.study.colors:[...this.study.colors,[s.color,s.color]]})+field('opacity','不透明度',s.opacity,{type:'number',min:.05,max:1})+field('width','文档粗细（宽度百分比）',Number((s.width*100).toPrecision(12)),{type:'number',min:.1,max:3})+field('cardWidth','卡片粗细（宽度百分比）',Number((s.cardWidth*100).toPrecision(12)),{type:'number',min:.1,max:3})+field('vanish','消失模式',s.vanish?'yes':'no',{choices:[['no','保留笔迹'],['yes','停笔一秒消失']]})+field('canvasWidth','画布粗细',s.canvasWidth,{type:'number',min:.1,max:30})+field('shape','辅助形状',s.shape,{choices:choices.shape})+field('straighten','自由手写直线辅助',s.straighten,{choices:[['off','关闭'],['auto','自动拉直近似直线'],['always','始终直线']]})+field('perfectShape','完美图形与涂抹删除',s.perfectShape?'yes':'no',{choices:[['no','关闭'],['yes','停笔半秒识别']]})+field('rulerAngle','尺子角度',s.rulerAngle,{type:'number',min:-180,max:180})+field('pressure','使用笔压',s.pressure?'yes':'no',{choices:[['yes','使用'],['no','固定粗细']]})+field('eraser','橡皮擦',s.eraser,{choices:[['stroke','整笔擦除'],['partial','局部涂抹擦除']]})+field('eraserAutoCancel','擦除后自动回到笔刷',s.eraserAutoCancel?'yes':'no',{choices:[['no','保持橡皮擦'],['yes','返回原笔刷']]})+'<p class="dialog-note">消失模式保留当前笔型与颜色，连续书写的笔迹在停笔一秒后一起消失；其他笔画经公开接口保存，可以撤销。开启完美图形后，连续来回涂抹并停笔半秒可删除碰到的整笔，支持撤销。图形辅助不识别或转写文字。</p>',onSubmit:v=>this.study.change('study.ink.settings',{brush:v.brush,color:v.color,opacity:Number(v.opacity),width:Number((Number(v.width)/100).toPrecision(12)),cardWidth:Number((Number(v.cardWidth)/100).toPrecision(12)),vanish:v.vanish==='yes',canvasWidth:Number(v.canvasWidth),shape:v.shape,straighten:v.straighten,perfectShape:v.perfectShape==='yes',rulerAngle:Number(v.rulerAngle),pressure:v.pressure==='yes',eraser:v.eraser,eraserAutoCancel:v.eraserAutoCancel==='yes'},set.revision),afterOpen:()=>{for(const name of ['opacity','width','cardWidth','canvasWidth'])$('dialog-fields').querySelector(`[name=${name}]`).step='0.05';}});
  }
  binding(){
    const set=this.study.current,s=bindingSettings(set.inkBinding);showDialog({title:'脑图手写随动与聚焦',html:field('autoBind','绑定到卡片',s.autoBind?'yes':'no',{choices:[['yes','自动绑定'],['no','保留为画布笔迹']]})+field('autoSelect','在卡片上书写时自动选中',s.autoSelect?'yes':'no',{choices:[['yes','自动切换'],['no','仅绑定已选中的卡片']]})+field('doubleTapFocus','双击 / 双点卡片进入聚焦',s.doubleTapFocus?'yes':'no',{choices:[['yes','启用'],['no','保留双击编辑']]})+field('hideFocusInk','退出聚焦后隐藏其中创建的笔迹',s.hideFocusInk?'yes':'no',{choices:[['yes','隐藏，选中时半透明预览'],['no','保持显示']]})+'<p class="dialog-note">聚焦中的脑图笔迹全部跟随聚焦卡片。开启双击聚焦后，鼠标/触摸点按用于选择，拖动书写；笔尖点按仍绘制。双击空白处退出聚焦。</p>',onSubmit:v=>this.study.change('study.ink.binding.set',Object.fromEntries(Object.keys(s).map(k=>[k,v[k]==='yes'])),set.revision)});
  }
  bound(card){
    const set=this.study.current,ink=(card.ink||[]).filter(s=>s.reviewSide!=='front'),ids=ink.map(s=>s.id),hidden=ink.some(s=>mapInkVisibility(s,card.id,{hideFocusInk:bindingSettings(set.inkBinding).hideFocusInk})===0&&!s.hidden);
    showDialog({title:'绑定笔迹 · '+card.title,html:'<div class="organize-actions">'+[['focus',set.map?.focusId===card.id?'退出聚焦':'聚焦此卡片'],['visibility',hidden?'显示全部绑定笔迹':'隐藏绑定笔迹'],['detach','解绑到画布'],['erase','清除全部绑定笔迹'],['manage','逐笔管理 / 变形']].map(([id,title])=>`<button type="button" data-bound-action="${id}">${title}</button>`).join('')+'</div>',onSubmit:null,afterOpen:()=>{$('dialog-fields').querySelectorAll('[data-bound-action]').forEach(b=>b.onclick=run(async()=>{const action=b.dataset.boundAction;if(action==='focus'){await this.study.map.focus(set.map?.focusId===card.id?null:card.id);$('dialog-cancel').click();return;}if(action==='manage'){$('dialog-cancel').click();this.all(card);return;}if(!ids.length)return;if(action==='detach')await this.study.change('study.ink.detach',{cardId:card.id,strokeIds:ids},set.revision);else await this.study.change('study.ink.batch',{scope:'card',cardId:card.id,strokeIds:ids,action:action==='erase'?'remove':'transform',...(action==='visibility'?{mapHidden:!hidden}:{})},set.revision);$('dialog-cancel').click();}));}});
  }
  adjust(scope,strokes,{cardId,aspectRatio=1,imageBounds}={}){
    if(!strokes.length){toast('没有选中可编辑的笔迹');return;}
    const set=this.study.current,strokeIds=strokes.map(s=>s.id),world=scope==='canvas',card=set.cards.find(c=>c.id===cardId);
    const operations=[['transform','移动 / 缩放 / 旋转'],['copy','复制笔迹'],['remove','删除选中笔迹'],...(scope==='canvas'?[['bind','绑定到卡片']]:[]),...(scope==='card'?[['detach','解绑回画布'],...(card?.image&&!card.reference?[['bind-image','绑定到图片']]:[]),...(strokes.some(s=>s.imageBound)?[['unbind-image','解除图片绑定']]:[])]:[]),...(scope!=='card'?[['to-card','转为手写卡片']]:[])];
    showDialog({title:`处理 ${strokeIds.length} 条笔迹`,html:field('action','操作','transform',{choices:operations})+field('dx',world?'水平位移（画布单位）':'水平位移（宽度 %）',0,{type:'number'})+field('dy',world?'垂直位移（画布单位）':'垂直位移（高度 %）',0,{type:'number'})+field('scale','缩放（%）',100,{type:'number',min:5,max:2000})+field('angle','旋转角度',0,{type:'number',min:-360,max:360})+field('color','颜色','',{choices:[['','保持原色'],...this.study.colors]})+field('opacity','不透明度（留空保持）','',{type:'number',min:.05,max:1})+field('hidden','可见性','',{choices:[['','保持'],['yes','隐藏'],['no','显示']]})+field('layerId','图层','',{choices:[['','保持当前'],...set.layers.filter(l=>!l.deletedAt&&!l.locked).map(l=>[l.id,l.title])]})+(world?field('target','绑定到卡片',this.study.map.selected||'',{choices:[['','请选择'],...set.cards.map(c=>[c.id,c.title])]}):'')+field('title','手写卡片标题','手写笔记'),onSubmit:async v=>{
      if(v.action==='to-card')return this.study.change('study.ink.toCard',{scope,strokeIds,title:v.title,copy:true},set.revision);
      if(v.action==='bind'){if(!v.target)throw Error('请选择目标卡片');return this.study.change('study.ink.bind',{scope,strokeIds,cardId:v.target},set.revision);}
      if(v.action==='detach')return this.study.change('study.ink.detach',{cardId,strokeIds,...(imageBounds?{imageBounds}:{})},set.revision);
      return this.study.change('study.ink.batch',{scope,strokeIds,...(cardId?{cardId}:{}),action:['bind-image','unbind-image'].includes(v.action)?'transform':v.action,...(['bind-image','unbind-image'].includes(v.action)?{imageBound:v.action==='bind-image'}:{}),...(imageBounds?{imageBounds}:{}),dx:Number(v.dx)/(world?1:100),dy:Number(v.dy)/(world?1:100),scaleX:Number(v.scale)/100,scaleY:Number(v.scale)/100,angle:Number(v.angle),aspectRatio,...(v.color?{color:v.color}:{}),...(v.opacity!==''?{opacity:Number(v.opacity)}:{}),...(v.layerId?{layerId:v.layerId}:{}),...(v.hidden?{hidden:v.hidden==='yes'}:{})},set.revision);
    },afterOpen:()=>{$('dialog-fields').querySelector('[name=opacity]').step='.05';}});
  }
  async erase(scope,path,{cardId,documentId,page,aspectRatio=1,radius,revision,imageBounds,mode='partial',bands}){
    const set=this.study.current;if(!set)return;
    await this.study.change('study.ink.erase',{scope,path:sample(path,256),radius,aspectRatio,mode,...(scope==='card'?{side:'back'}:{}),...(bands?{bands}:{}),...(imageBounds?{imageBounds}:{}),...(cardId?{cardId}:{}),...(documentId?{documentId,page}:{})},revision??set.revision);
  }
  eraserCursor(event,radius){const cursor=document.createElement('div');cursor.className='ink-eraser-cursor';cursor.style.width=cursor.style.height=radius*2+'px';document.body.append(cursor);const move=e=>{cursor.style.left=e.clientX-radius+'px';cursor.style.top=e.clientY-radius+'px';};move(event);return {move,remove:()=>cursor.remove()};}
  selected(strokes,polygon){
    const layers=this.study.current.layers;
    return strokes.filter(s=>!s.hidden&&s.notebookVisible!==false&&!s.notebookLocked&&layers.some(l=>l.id===(s.layerId||'default')&&!l.deletedAt&&l.visible&&!l.locked)&&polylineIntersectsPolygon(s.points,polygon));
  }
  all(card){
    const set=this.study.current;
    if(card){const element=this.study.map.board.querySelector(`[data-card-id="${card.id}"]`),frame=element&&measuredImageBounds(element,card.image);this.adjust('card',card.ink||[],{cardId:card.id,...(frame?{imageBounds:frame}:{}),aspectRatio:(card.style?.height||set.appearance?.height||226)/(card.style?.width||set.appearance?.width||236)});return;}
    this.adjust('canvas',set.canvasInk||[]);
  }
}
function sample(points,max){if(points.length<=max)return points;return Array.from({length:max},(_,i)=>points[Math.round(i*(points.length-1)/(max-1))]);}
