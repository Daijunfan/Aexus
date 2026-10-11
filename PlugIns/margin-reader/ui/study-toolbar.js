// Only reading and mind-map tools are mounted. Secondary diagram operations
// share their original public handlers inside a single compact menu.
export function organizeStudyToolbar(study){
 const board=study.map.board,bar=study.mindmapStudio.bar,main=bar.querySelector('.mm-active-tools');
 const more=document.createElement('details');more.className='map-more';more.id='map-more';more.innerHTML='<summary aria-label="更多脑图工具">•••</summary><div class="map-more-body" aria-label="脑图工具"></div>';const body=more.lastElementChild;
 const keep=new Set(['mm-themes','mm-format','mm-new-child','mm-delete-topic','mm-relationship','mm-boundary','mm-summary','mm-export']);
 for(const child of [...main.children])if(!keep.has(child.id)){if(child.id==='mm-more-tools'){child.remove();continue;}body.append(child);}
 const work=board.querySelector('.study-workbench-tools'),edit=work.querySelector('.study-edit-tools');document.getElementById('study-add-note').remove();main.prepend(edit);
 const find=document.getElementById('map-find-toggle');main.append(find,more);
 for(const selector of ['.study-organization-tools','.map-interaction-tools','.card-ink-tools']){const row=board.querySelector(selector);if(row)body.append(row);}
 // Closing a menu action returns pointer space to the canvas. Inputs keep it open.
 body.addEventListener('click',e=>{if(e.target.closest('button'))more.open=false;});
 document.addEventListener('pointerdown',e=>{if(more.open&&!more.contains(e.target))more.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')more.open=false;});
 study.toolbar={showAll:()=>{more.open=true;},reset:()=>{more.open=false;}};
}
