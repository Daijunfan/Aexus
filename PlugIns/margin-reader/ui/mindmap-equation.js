import {$,escape as E,field,showDialog,run,toast} from './dom.js';
import {api} from './transport.js';
export class MindmapEquation{
 constructor(studio){
  this.studio=studio;this.study=studio.study;const bar=studio.bar.querySelector('.mm-active-tools');bar.insertAdjacentHTML('beforeend','<button id="mm-equation" title="插入或编辑 LaTeX 公式">公式</button>');$('mm-equation').onclick=()=>this.open();
 }
 open(id=this.studio.map.selected){
  this.studio.guard();const set=this.study.current,card=set?.cards.find(c=>c.id===id);if(!card){toast('先选择需要添加公式的主题。');return;}const equation=card.mindmap?.equation;
  showDialog({title:'主题公式',html:`<label class="dialog-field"><span>数学或化学公式 · LaTeX</span><textarea name="latex" rows="4" spellcheck="false">${E(equation?.latex||'x^2 + y^2 = r^2')}</textarea></label>`+field('scale','显示比例',equation?.scale??1,{type:'number',min:.2,max:4})+field('action','操作','save',{choices:[['save','保存公式'],['remove','移除公式 · 保留主题']]})+'<button type="button" id="mm-equation-preview">预览公式</button><div id="mm-equation-result" class="mm-equation-result" role="status"></div><p class="dialog-note">支持分数、根号、积分、矩阵与 \\ce{H2 + O2 -> H2O} 化学式。双击主题内的公式可再次编辑。</p>',afterOpen:()=>{
   let serial=0;$('mm-equation-preview').onclick=run(async()=>{const current=++serial,latex=$('dialog-fields').querySelector('[name=latex]').value,result=await api('study.mindmap.equation.preview',{latex});if(current!==serial||!$('mm-equation-result'))return;$('mm-equation-result').innerHTML=result.svg;$('mm-equation-result').firstElementChild.style.height=Math.min(150,result.height*2)+'px';});run(()=>$('mm-equation-preview').click())();
  },onSubmit:v=>this.study.change('study.mindmap.topics.update',{cardIds:[card.id],patch:{equation:v.action==='remove'?null:{latex:v.latex,scale:Number(v.scale)}}},set.revision)});
 }
}
