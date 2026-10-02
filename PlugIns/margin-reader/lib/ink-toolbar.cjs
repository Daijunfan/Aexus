'use strict';
const {assert}=require('./safety.cjs');
const common={brush:'pen',color:'blue',width:.004,cardWidth:.004,canvasWidth:3,opacity:1,shape:'free',straighten:'off',perfectShape:false,rulerAngle:0,pressure:true,vanish:false,eraser:'stroke',eraserAutoCancel:false};
const builtins=[
 {id:'00000000-0000-4000-8000-000000000001',builtin:'pen',kind:'ink',title:'钢笔',settings:{...common}},
 {id:'00000000-0000-4000-8000-000000000002',builtin:'highlighter',kind:'ink',title:'荧光笔',settings:{...common,brush:'highlighter',color:'yellow',width:.012,cardWidth:.02,canvasWidth:12,opacity:.35}},
 {id:'00000000-0000-4000-8000-000000000003',builtin:'pencil',kind:'ink',title:'铅笔',settings:{...common,brush:'pencil',color:'#444444',opacity:.7}}
];
const contexts=['document','map','card','review'];
const builtin=id=>builtins.find(t=>t.id===id);
function tools(set){const saved=set.tools||[];return [...saved.map(({builtin:ignored,...t})=>({...t,...(builtin(t.id)?{builtin:builtin(t.id).builtin}:{})})),...builtins.filter(t=>!saved.some(s=>s.id===t.id)).map(t=>structuredClone(t))];}
function describe(set){const active=tools(set).filter(t=>t.kind==='ink'&&!t.deletedAt),defaultIds=[...builtins.map(t=>t.id),...active.map(t=>t.id)];return {toolIds:set.inkToolbar?.toolIds||[...new Set(defaultIds)].filter(id=>active.some(t=>t.id===id)).slice(0,12),placements:set.inkToolbar?.placements||{},widthMode:set.inkToolbar?.widthMode||'continuous'};}
const family=t=>t.settings?.brush==='laser'?'pen':t.settings?.brush||'pen';
function check(set,ids=describe(set).toolIds){
 assert(Array.isArray(ids)&&new Set(ids).size===ids.length,'INVALID_PARAMS','Choose distinct pen tools.');assert(ids.length<=12,'TOO_LARGE','The toolbar holds at most 12 pens.');
 const available=tools(set),selected=ids.map(id=>available.find(t=>t.id===id&&t.kind==='ink'&&!t.deletedAt));assert(selected.every(Boolean),'NOT_FOUND','A toolbar pen is unavailable in this study.');
 assert(['pen','highlighter','pencil'].every(brush=>selected.some(t=>family(t)===brush)),'TOOL_REQUIRED','Keep at least one pen, highlighter and pencil in the toolbar.');return ids;
}
function placement(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['dock','x','y','orientation'].includes(k))&&['left','right','top','bottom','free'].includes(value.dock)&&['horizontal','vertical'].includes(value.orientation)&&['x','y'].every(k=>Number.isFinite(value[k])&&value[k]>=0&&value[k]<=1),'INVALID_PARAMS','Supply dock, orientation and normalized x/y toolbar coordinates.');return {...value};
}
function validate(set){
 if(set.inkToolbar===undefined)return;const value=set.inkToolbar;assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['toolIds','placements','widthMode'].includes(k)),'INVALID_PARAMS','Invalid handwriting toolbar.');check(set);if(value.widthMode!==undefined)assert(['continuous','steps'].includes(value.widthMode),'INVALID_PARAMS','Choose continuous or stepped pen widths.');
 if(value.placements!==undefined){assert(value.placements&&typeof value.placements==='object'&&!Array.isArray(value.placements)&&Object.keys(value.placements).every(k=>contexts.includes(k)),'INVALID_PARAMS','Unknown handwriting toolbar context.');Object.values(value.placements).forEach(placement);}
}
module.exports={tools,describe,check,placement,validate,builtin,builtins,contexts,family};
