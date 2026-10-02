'use strict';
const {assert}=require('./safety.cjs'),{contexts}=require('./ink-toolbar.cjs');
const defaults={enabled:false,x:.5,y:.5,angle:0,length:.7,cover:false};
function pose(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>Object.hasOwn(defaults,k)),'INVALID_PARAMS','Invalid ruler settings.');const p={...defaults,...value};
 assert(typeof p.enabled==='boolean'&&typeof p.cover==='boolean'&&Number.isFinite(p.x)&&p.x>=0&&p.x<=1&&Number.isFinite(p.y)&&p.y>=0&&p.y<=1&&Number.isFinite(p.angle)&&Math.abs(p.angle)<=180&&Number.isFinite(p.length)&&p.length>=.1&&p.length<=2,'INVALID_PARAMS','Invalid ruler position, angle or length.');return p;
}
function request(set,p){const {setId,expectedRevision,context,...patch}=p;assert(contexts.includes(context)&&Object.keys(patch).length,'INVALID_PARAMS','Choose a drawing context and ruler settings.');set.inkRulers={...set.inkRulers,[context]:pose({...set.inkRulers?.[context],...patch})};}
function validate(set){if(set.inkRulers===undefined)return;assert(set.inkRulers&&typeof set.inkRulers==='object'&&!Array.isArray(set.inkRulers)&&Object.keys(set.inkRulers).every(k=>contexts.includes(k)),'INVALID_PARAMS','Invalid ruler contexts.');Object.values(set.inkRulers).forEach(pose);}
function intent(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['edges','tolerance'].includes(k))&&Number.isFinite(value.tolerance)&&value.tolerance>0&&value.tolerance<=1000,'INVALID_PARAMS','Invalid ruler guide.');
 assert(Array.isArray(value.edges)&&value.edges.length>0&&value.edges.length<=256&&value.edges.every(e=>e&&Object.keys(e).every(k=>['a','b','group','t0','t1'].includes(k))&&['top','bottom'].includes(e.group)&&['a','b'].every(k=>Array.isArray(e[k])&&e[k].length===2&&e[k].every(v=>Number.isFinite(v)&&Math.abs(v)<=1000000))&&Number.isFinite(e.t0)&&Number.isFinite(e.t1)&&e.t0>=0&&e.t1<=1&&e.t1>e.t0),'INVALID_PARAMS','A ruler guide needs finite edge segments and ordered positions along its edge.');for(const group of ['top','bottom']){const edges=value.edges.filter(e=>e.group===group).sort((a,b)=>a.t0-b.t0);assert(edges.every((e,i)=>!i||e.t0>=edges[i-1].t1-1e-9),'INVALID_PARAMS','Ruler edge segments must not overlap.');}return value;
}
module.exports={defaults,pose,request,validate,intent};
