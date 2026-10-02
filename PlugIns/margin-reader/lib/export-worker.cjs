'use strict';
const {parentPort,workerData:a}=require('node:worker_threads');
const fs=require('node:fs'),path=require('node:path');
const {escapeHtml:escape,safePath}=require('./safety.cjs');
const dataUri=(bytes,mime)=>`data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
function html(set){
  const katex=path.dirname(require.resolve('katex/package.json')),css=fs.readFileSync(path.join(katex,'dist/katex.min.css'),'utf8').replace(/url\(([^)]+)\)/g,(_,raw)=>{const file=raw.replace(/["']/g,'');if(!/^fonts\/[\w.-]+\.(woff2?|ttf)$/.test(file))return 'url()';const type=file.endsWith('woff2')?'font/woff2':file.endsWith('.woff')?'font/woff':'font/ttf';return `url(${dataUri(fs.readFileSync(path.join(katex,'dist',file)),type)})`;});
  const cards=set.cards.map(c=>{
    let body=c.rich.html+(c.imageBytes?`<img src="${dataUri(c.imageBytes,'image/png')}" alt="${escape(c.title)}">`:'')+(c.rich.noteHtml?'<hr>'+c.rich.noteHtml:'');
    const comments=new Map((c.comments||[]).map(comment=>[comment.id,comment]));
    for(const comment of c.rich.comments){const media=comments.get(comment.id);body+='<aside>'+comment.html;if(media.mediaBytes)body+=media.media.kind==='image'?`<img alt="${escape(media.media.name)}" src="${dataUri(media.mediaBytes,media.media.mimeType)}">`:`<audio controls preload="none" src="${dataUri(media.mediaBytes,media.media.mimeType)}"></audio>`;body+='</aside>';}
    if(c.rich.choices?.length)body+='<p>Link candidates</p>'+c.rich.choices.map(choice=>`<p>${escape(choice.label)}: ${choice.targets.map(t=>`<a href="margin-reader://card/${t.setId}/${t.cardId}">${escape(t.setTitle)} / ${escape(t.title)}</a>`).join(' · ')}</p>`).join('');
    body=body.replace(new RegExp(`href="margin-reader://card/${set.id}/([a-f0-9-]+)"`,'g'),(full,id)=>set.cards.some(n=>n.id===id)?`href="#card-${id}"`:full);
    return `<article id="card-${c.id}"><h2>${escape(c.title)}</h2><small>${(c.tags||[]).map(t=>'#'+escape(t)).join(' ')}</small>${body}<footer>${escape(c.source?c.source.title+' · '+(c.source.locator.page||c.source.locator.section+1):'Independent note')} · <a href="margin-reader://card/${set.id}/${c.id}">Reader source</a></footer></article>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'"><title>${escape(set.title)}</title><style>${css}body{max-width:860px;margin:40px auto;padding:0 24px;font:17px/1.7 system-ui;color:#20252d;background:white}article{border-top:1px solid #b7bec9;padding:24px 0;break-inside:avoid}img{max-width:100%;height:auto}aside{border-left:3px solid #bbc6d6;padding:8px 16px;margin:12px 0}audio{width:100%}footer,small{font-size:13px;color:#596579}pre{white-space:pre-wrap}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}a{color:#2767a3}</style></head><body><h1>${escape(set.title)}</h1><p>${escape(set.description)}</p><nav>${set.cards.map(c=>`<a href="#card-${c.id}">${escape(c.title)}</a>`).join(' · ')}</nav>${cards}</body></html>`;
}
function markdown(set){
  const safe=s=>String(s||'').replace(/</g,'&lt;');const depth=new Map();
  return '# '+safe(set.title)+'\n\n'+safe(set.description)+'\n\n'+set.cards.map(c=>{
    const d=c.parentId?(depth.get(c.parentId)||0)+1:0;depth.set(c.id,d);
    let body='#'.repeat(Math.min(6,d+2))+' '+safe(c.title)+'\n\n'+safe(c.editedText??c.text)+'\n\n';
    if(c.imageBytes)body+=`![${safe(c.title).replace(/[\[\]]/g,'')}](${dataUri(c.imageBytes,'image/png')})\n\n`;
    if(c.note)body+=safe(c.note)+'\n\n';
    for(const comment of c.comments||[]){body+='> '+safe(comment.text).replace(/\n/g,'\n> ')+'\n\n';if(comment.mediaBytes)body+=(comment.media.kind==='image'?'!':'')+`[${safe(comment.media.name)}](${dataUri(comment.mediaBytes,comment.media.mimeType)})\n\n`;}
    return body+(c.tags||[]).map(t=>'#'+safe(t)).join(' ')+`\n\n[Reader source](margin-reader://card/${set.id}/${c.id})\n\n`;
  }).join('');
}
function opml(set){
  const parent=new Map();for(const c of set.cards){const key=c.parentId||null;if(!parent.has(key))parent.set(key,[]);parent.get(key).push(c);}
  const build=id=>(parent.get(id)||[]).map(c=>`<outline text="${escape(c.title)}" _note="${escape([c.editedText??c.text,c.note,...(c.comments||[]).map(n=>n.text)].filter(Boolean).join('\n\n'))}" url="margin-reader://card/${set.id}/${c.id}" type="link">${build(c.id)}</outline>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>${escape(set.title)}</title></head><body>${build(null)}</body></opml>`;
}
async function run(){
  if(a.kind==='document')return require('./export-render.cjs').annotatedPdf(a);
  const {set,p}=a;
  if(p.format==='pdf'){const {mapInkVisibility}=await import('../ui/ink-binding.mjs'),options={focusId:p.rootId||set.map?.focusId,hideFocusInk:set.inkBinding?.hideFocusInk};set.canvasInk=(set.canvasInk||[]).filter(s=>mapInkVisibility(s,null,options)===1);for(const c of set.cards)c.ink=(c.ink||[]).filter(s=>mapInkVisibility(s,c.id,options)===1);}
  if(p.format!=='apkg'){const ink=require('./image-ink.cjs');for(const card of set.cards){if(card.imageBytes)card.imageBytes=await ink.paint(card.imageBytes,ink.forFace(set,card),set.colors);card.ink=(card.ink||[]).filter(s=>!ink.bound(s));}}
  if(p.format==='html')return {bytes:Buffer.from(html(set))};
  if(p.format==='md')return {bytes:Buffer.from(markdown(set))};
  if(p.format==='opml')return {bytes:Buffer.from(opml(set)),warnings:['OPML carries hierarchy and text; use MRPKG for images, audio and history.']};
  if(p.format==='docx')return require('./export-docx.cjs').wordDocument(set);
  if(p.format==='pdf')return require('./export-render.cjs').mapPdf(set,p);
  if(p.format==='apkg')return require('./export-anki.cjs').packageDeck({meta:rel=>safePath(a.workspace,`.margin-reader/${rel}`,{internal:true})},set,p);
  throw Error('Unsupported export format.');
}
run().then(result=>parentPort.postMessage({result}),error=>parentPort.postMessage({error:{code:error.code||'EXPORT_FAILED',message:error.message}}));
