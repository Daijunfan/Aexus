'use strict';
const S=require('./safety.cjs');
const cache=new Map();let engine;
function initialize(){
 const {mathjax}=require('mathjax-full/js/mathjax.js'),{TeX}=require('mathjax-full/js/input/tex.js'),{SVG}=require('mathjax-full/js/output/svg.js'),{liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js'),{RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
 require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');require('mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js');require('mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js');
 const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);return {adaptor,mathjax,TeX,SVG};
}
function render(latex){
 S.assert(typeof latex==='string'&&latex.trim()&&latex.length<=2000,'INVALID_PARAMS','Equation must contain 1–2000 LaTeX characters.');
 S.assert(!/\\(?:href|url|includegraphics|require|class|style|cssId|htmlId|htmlClass|htmlStyle|htmlData)\b/i.test(latex),'INVALID_PARAMS','Equation links, external resources and HTML styling are not accepted.');
 if(cache.has(latex))return cache.get(latex);engine??=initialize();const {adaptor,mathjax,TeX,SVG}=engine;let svg;const input=new TeX({packages:['base','ams','newcommand','mhchem'],maxBuffer:4096,maxMacros:500}),document=mathjax.document('',{InputJax:input,OutputJax:new SVG({fontCache:'none'})});
 try{input.reset();document.reset();const node=document.convert(latex,{display:true});svg=adaptor.outerHTML(adaptor.firstChild(node));}
 catch{S.fail('INVALID_PARAMS','LaTeX equation could not be rendered.');}
 S.assert(!/data-mml-node="merror"|data-mjx-error|<script|<foreignObject|\son\w+=/i.test(svg),'INVALID_PARAMS','The equation contains unsupported or invalid LaTeX.');
 const viewBox=svg.match(/viewBox="([^"]+)"/)?.[1],box=viewBox?.split(/\s+/).map(Number);S.assert(box?.length===4&&box.every(Number.isFinite)&&box[2]>0&&box[3]>0,'INVALID_PARAMS','Equation has no visible output.');
 S.assert(Buffer.byteLength(svg)<=128*1024,'TOO_LARGE','Equation rendering exceeds 128 KiB.');
 const width=Math.round(box[2]*.02*1000)/1000,height=Math.round(box[3]*.02*1000)/1000;S.assert(width<=40000&&height<=40000,'TOO_LARGE','Equation dimensions exceed the supported limit.');
 svg=svg.replace(/^<svg\b([^>]*)>/,(_,attrs)=>'<svg'+attrs.replace(/\s(?:width|height|style)="[^"]*"/g,'')+'>');const value=Object.freeze({latex,svg,width,height});cache.set(latex,value);if(cache.size>96)cache.delete(cache.keys().next().value);return value;
}
function equation(value){
 S.assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>['latex','scale','width','height'].includes(k)),'INVALID_PARAMS','An equation accepts latex and scale only.');
 const scale=value.scale??1;S.assert(Number.isFinite(scale)&&scale>=.2&&scale<=4,'INVALID_PARAMS','Equation scale must be .2–4.');const r=render(value.latex);return {latex:value.latex,scale,width:r.width,height:r.height};
}
module.exports={render,equation};
