'use strict';
const {Marked}=require('marked');
const katex=require('katex');
const sanitize=require('sanitize-html');
function render(text){
 const parser=new Marked({breaks:true});
 parser.use({extensions:[{name:'math',level:'inline',start:src=>src.indexOf('$'),tokenizer(src){const m=/^(\${1,2})([^$]+)\1/.exec(src);if(m)return {type:'math',raw:m[0],text:m[2],display:m[1].length===2};},renderer(token){return katex.renderToString(token.text,{displayMode:token.display,throwOnError:false,trust:false,output:'html'});}}]});
 return sanitize(parser.parse(text||''),{allowedTags:['p','br','hr','strong','em','del','blockquote','pre','code','ul','ol','li','h1','h2','h3','h4','table','thead','tbody','tr','th','td','a','span','svg','path','line'],allowedAttributes:{svg:['width','height','viewBox','preserveAspectRatio'],path:['d','fill','stroke'],line:['x1','y1','x2','y2','stroke'],a:['href'],span:['class','style','aria-hidden'],code:['class']},allowedSchemes:['https','http','mailto'],allowedStyles:{span:{height:[/^[-.\d]+em$/],width:[/^[-.\d]+em$/],top:[/^[-.\d]+em$/],'margin-right':[/^[-.\d]+em$/],'margin-left':[/^[-.\d]+em$/],'vertical-align':[/^[-.\d]+em$/],'font-size':[/^[.\d]+em$/],'position':[/^relative$/]}}});
}
module.exports={render};
