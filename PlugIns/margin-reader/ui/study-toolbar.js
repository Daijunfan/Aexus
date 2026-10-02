import { TOOLS, TOOL_GROUPS } from './tool-catalog.mjs';
// Keep the original action elements and handlers; categories only filter presentation.
export function organizeStudyToolbar(study) {
  const board=study.map.board,heading=board.querySelector('.study-map-toolbar'),primary=board.querySelector('.study-workbench-tools');
  heading.after(primary);
  const shelf=document.createElement('section');shelf.className='study-tool-shelf';shelf.setAttribute('aria-label','学习工具');
  const header=document.createElement('header');header.className='study-tool-shelf-heading';
  const categories=document.createElement('nav');categories.className='study-tool-categories';categories.setAttribute('aria-label','按场景查看工具');
  for(const [id,title] of Object.entries(TOOL_GROUPS).filter(([id])=>!['reading','appearance'].includes(id))){
    const button=document.createElement('button');button.type='button';button.dataset.shelfGroup=id;button.textContent=title;button.setAttribute('aria-pressed',String(id==='all'));categories.append(button);
  }
  const toggle=document.createElement('button');toggle.id='study-tools-expand';toggle.type='button';toggle.textContent='展开工具区';toggle.setAttribute('aria-pressed','false');toggle.setAttribute('aria-controls','study-tool-shelf-body');
  const body=document.createElement('div');body.id='study-tool-shelf-body';body.className='study-tool-shelf-body';body.setAttribute('role','group');body.setAttribute('aria-label','可滚动的完整工具区');
  for(const selector of ['.map-interaction-tools','.study-organization-tools','.advanced-map-toolbar']){const group=board.querySelector(selector);if(group)body.append(group);}
  header.append(categories,toggle);shelf.append(header,body);primary.after(shelf);
  const known=new Map(TOOLS.map(tool=>[tool.id,tool.group]));
  const category=element=>{
    const ids=[element.id,...[...element.querySelectorAll('[id]')].map(el=>el.id)].filter(Boolean);
    const result=new Set(ids.map(id=>known.get(id)).filter(Boolean));
    for(const id of ids){
      if(/ink|ruler|pen/.test(id))result.add('ink');
      if(/review|recall|presentation/.test(id))result.add('review');
      if(/dictionary|link|reference|research/.test(id))result.add('links');
      if(/camera|record|speech|media|note/.test(id))result.add('notes');
    }
    if(!result.size)result.add('organize');
    return result;
  };
  const apply=group=>{
    shelf.dataset.group=group;
    categories.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shelfGroup===group)));
    for(const row of body.children){
      for(const child of row.children)child.classList.toggle('tool-filtered-out',group!=='all'&&!category(child).has(group));
      row.classList.toggle('tool-filtered-out',group!=='all'&&[...row.children].every(c=>c.classList.contains('tool-filtered-out')));
    }
    body.scrollTop=0;
  };
  const expand=value=>{toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'收起工具区':'展开工具区';shelf.classList.toggle('expanded',value);};
  toggle.onclick=()=>expand(toggle.getAttribute('aria-pressed')!=='true');
  categories.querySelectorAll('button').forEach(b=>b.onclick=()=>{apply(b.dataset.shelfGroup);if(b.dataset.shelfGroup!=='all')expand(true);});
  categories.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const buttons=[...categories.querySelectorAll('button')],at=buttons.indexOf(document.activeElement);
    const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(at+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    buttons[index].focus();buttons[index].click();
  });
  body.addEventListener('focusin',event=>{
    const element=event.target;if(!(element instanceof HTMLElement))return;
    const r=element.getBoundingClientRect(),b=body.getBoundingClientRect();
    if(r.top<b.top)body.scrollTop+=r.top-b.top-4;else if(r.bottom>b.bottom)body.scrollTop+=r.bottom-b.bottom+4;
  });
  study.toolbar={showAll:()=>{apply('all');expand(true);},reset:()=>apply('all')};
  apply('all');
}
