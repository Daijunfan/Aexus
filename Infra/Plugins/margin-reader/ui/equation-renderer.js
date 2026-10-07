import {api} from './transport.js';
const cache=new Map(),queue=[];let running=0;
function drain(){
 while(running<4&&queue.length){const job=queue.shift();running++;api('study.mindmap.equation.preview',{latex:job.latex}).then(r=>job.resolve(r.svg),job.reject).finally(()=>{running--;drain();});}
}
function render(latex){
 if(!cache.has(latex)){const p=new Promise((resolve,reject)=>queue.push({latex,resolve,reject}));cache.set(latex,p);p.catch(()=>cache.delete(latex));if(cache.size>128)cache.delete(cache.keys().next().value);drain();}return cache.get(latex);
}
export function paintEquations(root){
 for(const box of root.querySelectorAll('[data-math-latex]')){
  if(box.dataset.mathLoading||box.firstElementChild)continue;const latex=box.dataset.mathLatex;box.dataset.mathLoading='true';box.setAttribute('aria-busy','true');
  render(latex).then(svg=>{if(!box.isConnected||box.dataset.mathLatex!==latex)return;box.innerHTML=svg.replace('<svg ','<svg width="100%" height="100%" ');box.removeAttribute('aria-busy');box.dataset.mathReady='true';},()=>{if(!box.isConnected)return;box.textContent='公式暂不可用';box.removeAttribute('aria-busy');delete box.dataset.mathLoading;});
 }
}
