import {CATALOG as C,mapStyle,svgShape,escapeXml as E} from './mindmap-style.mjs';
import {layoutMindmap} from './mindmap-layout.mjs';
import {diagramPaths} from './mindmap-view.mjs';
const sample=[{id:'root',parentId:null,title:'中心主题'}];
for(let i=0;i<4;i++){sample.push({id:'b'+i,parentId:'root',title:['调研','设计','实现','验证'][i]});for(let j=0;j<2;j++)sample.push({id:`l${i}${j}`,parentId:'b'+i,title:['关键思路','下一步'][j]});}
const cache=new Map();
export function skeletonThumbnail(id,options={},custom=false){
 const s=C.skeletons[id],theme=options.theme||'radiance',key=JSON.stringify([id,theme,options.palette,options.centralColor,custom?options:null]);
 if(!cache.has(key)){
  const l=layoutMindmap(sample,{mindmap:{...(custom?options:{}),skeleton:id,theme,palette:options.palette,centralColor:options.centralColor,structure:custom?options.structure||s.structure:s.structure,showImages:false,titleLines:2}});
  const shapes=sample.map(c=>{const b=l.positions.get(c.id),t=l.topics.get(c.id);return `<g transform="translate(${b.x} ${b.y})">${svgShape(t.shape,b.width,b.height,t,'sk-'+id+c.id)}<text x="${b.width/2}" y="${t.box.padTop+t.fontSize}" text-anchor="middle" fill="${t.textColor}" font-family="system-ui" font-size="${t.fontSize}" font-weight="${t.bold?650:450}">${E(c.title)}</text></g>`;}).join('');
  cache.set(key,`<svg viewBox="0 0 ${l.width} ${l.height}" aria-hidden="true"><rect width="${l.width}" height="${l.height}" fill="${l.config.paper}"/>${diagramPaths(l,[])}${shapes}</svg>`);if(cache.size>100)cache.delete(cache.keys().next().value);
 }
 return cache.get(key);
}
export function skeletonGallery(options={}){
 const current=mapStyle(options).skeleton,group=C.skeletons[current]?.group||'mindmap';
 return `<h3 class="mm-gallery-label">骨架 <small>${Object.keys(C.skeletons).length} 套 · 结构与层级样式</small></h3><div class="mm-gallery-filter"><select id="mm-skeleton-family" aria-label="骨架类别"><option value="all">全部骨架</option>${Object.entries(C.skeletonGroups).map(([id,name])=>`<option value="${id}"${id===group?' selected':''}>${name}</option>`).join('')}</select><input id="mm-skeleton-search" type="search" placeholder="搜索骨架" aria-label="搜索骨架"></div><div class="mm-skeleton-grid">${Object.entries(C.skeletons).map(([id,s])=>`<button type="button" data-mm-skeleton="${id}" data-mm-family="${s.group}" aria-pressed="${id===current}" title="${E(s.title)}"${s.group!==group?' hidden':''}><span class="mm-skeleton-picture"></span><span>${E(s.title)}</span></button>`).join('')}</div><p id="mm-skeleton-count" class="mm-empty" role="status"></p><h3 class="mm-gallery-label">配色 <small>保留选定骨架</small></h3>`;
}
export function bindSkeletonGallery(panel,options){
 const family=panel.querySelector('#mm-skeleton-family'),search=panel.querySelector('#mm-skeleton-search');if(!family)return;
 const apply=()=>{const query=search.value.trim().toLocaleLowerCase();let count=0;
  for(const b of panel.querySelectorAll('[data-mm-skeleton]')){const match=(family.value==='all'||family.value===b.dataset.mmFamily)&&[b.title,b.dataset.mmSkeleton,C.skeletonGroups[b.dataset.mmFamily]].join(' ').toLocaleLowerCase().includes(query);b.hidden=!match;if(match){count++;const image=b.querySelector('.mm-skeleton-picture');if(!image.firstElementChild)image.innerHTML=skeletonThumbnail(b.dataset.mmSkeleton,options);}}
  panel.querySelector('#mm-skeleton-count').textContent=count?`${count} 套可用骨架`:'没有匹配的骨架';
 };family.onchange=apply;search.oninput=apply;apply();
}
