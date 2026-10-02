'use strict';
const fs=require('node:fs/promises');
const {randomUUID,createHash}=require('node:crypto');
const JSZip=require('jszip');
const {assert,escapeHtml,digest}=require('./safety.cjs');
// Independent implementation of Anki's documented legacy deck package format.
// These are interoperability table definitions, not copied exporter logic.
const tables={
  col:'id integer primary key,crt integer not null,mod integer not null,scm integer not null,ver integer not null,dty integer not null,usn integer not null,ls integer not null,conf text not null,models text not null,decks text not null,dconf text not null,tags text not null',
  notes:'id integer primary key,guid text not null,mid integer not null,mod integer not null,usn integer not null,tags text not null,flds text not null,sfld integer not null,csum integer not null,flags integer not null,data text not null',
  cards:'id integer primary key,nid integer not null,did integer not null,ord integer not null,mod integer not null,usn integer not null,type integer not null,queue integer not null,due integer not null,ivl integer not null,factor integer not null,reps integer not null,lapses integer not null,left integer not null,odue integer not null,odid integer not null,flags integer not null,data text not null',
  revlog:'id integer primary key,cid integer not null,usn integer not null,ease integer not null,ivl integer not null,lastIvl integer not null,factor integer not null,time integer not null,type integer not null',
  graves:'usn integer not null,oid integer not null,type integer not null'
};
const numberId=value=>parseInt(digest(value).slice(0,12),16);
const rich=text=>require('./card-text.cjs').render(text||'',{math:'mathjax'});
async function packageDeck(store,document,p={}){
  const {DatabaseSync}=require('node:sqlite');
  const temporary=await store.meta(`cache/anki-${randomUUID()}.sqlite`),db=new DatabaseSync(temporary),zip=new JSZip();
  const now=Date.now(),seconds=Math.floor(now/1000),mid=numberId('margin-reader.basic.v1'),did=numberId(document.id),deckName=p.deckName||document.title;
  const files=new Map(),media={};
  const add=(bytes,extension)=>{const name=`mr-${digest(bytes)}.${extension}`;if(!files.has(name)){const index=String(files.size);files.set(name,index);media[index]=name;zip.file(index,bytes);}return name;};
  try{
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA page_size=4096;');
    for(const [name,columns] of Object.entries(tables))db.exec(`CREATE TABLE ${name} (${columns});`);
    db.exec('CREATE INDEX ix_notes_csum ON notes(csum); CREATE INDEX ix_cards_nid ON cards(nid); CREATE INDEX ix_cards_sched ON cards(did,queue,due); CREATE INDEX ix_revlog_cid ON revlog(cid);');
    const fields=['Front','Back','Source','ReaderURI'];
    const template={name:'Margin Reader',ord:0,qfmt:'{{Front}}',afmt:'{{FrontSide}}<hr id="answer">{{Back}}<hr><small>{{Source}}</small><br><small>{{ReaderURI}}</small>',bqfmt:'',bafmt:'',did:null};
    const model={id:mid,name:'Margin Reader · Source-linked v1',type:0,mod:seconds,usn:-1,sortf:0,did,tmpls:[template],flds:fields.map((name,ord)=>({name,ord,sticky:false,rtl:false,font:'Arial',size:20,media:[]})),css:'.card{font:20px/1.6 Arial;text-align:left;color:#20252d;background:white}img{max-width:100%;height:auto}.nightMode.card{color:#eee;background:#20252d}small{font-size:13px}',latexPre:'\\documentclass[12pt]{article}\n\\begin{document}',latexPost:'\\end{document}',latexsvg:false,req:[[0,'any',[0]]],vers:[],tags:[]};
    const deck={id:did,name:deckName,mod:seconds,usn:-1,desc:'Local source-linked export from Margin Reader',dyn:0,collapsed:false,browserCollapsed:false,conf:1,extendNew:0,extendRev:0,newToday:[0,0],revToday:[0,0],lrnToday:[0,0],timeToday:[0,0]};
    const conf={id:1,name:'Default',mod:0,usn:0,maxTaken:60,autoplay:true,timer:0,replayq:true,new:{delays:[1,10],ints:[1,4],initialFactor:2500,order:1,perDay:20,separate:true},lapse:{delays:[10],mult:0,minInt:1,leechFails:8,leechAction:0},rev:{perDay:200,ease4:1.3,fuzz:.05,ivlFct:1,maxIvl:36500,bury:true,hardFactor:1.2}};
    db.prepare('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(1,Math.floor(now/86400000)*86400,now,now,11,0,-1,0,JSON.stringify({nextPos:document.cards.length+1,curDeck:did,activeDecks:[did],curModel:String(mid),schedVer:2,newSpread:0,collapseTime:1200,timeLim:0,sortType:'noteFld',sortBackwards:false,addToCur:true,dayLearnFirst:false,dueCounts:true,estTimes:true}),JSON.stringify({[mid]:model}),JSON.stringify({[did]:deck}),JSON.stringify({1:conf}),'{}');
    const noteInsert=db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)'),cardInsert=db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const rows=document.cards.flatMap(c=>c.reviewVariants?.length?c.reviewVariants.map(face=>({...c,reviewFaces:face,exportVariantId:face.variantId,review:{...c.review,occlusions:face.occlusions}})):[c]);
    for(const [index,c] of rows.entries()){
      const source=c.source?`${c.source.title} · ${c.source.locator.page?'p. '+c.source.locator.page:'section '+(c.source.locator.section+1)}`:'Independent note';
      let front=rich(c.reviewFaces?.front.contentText??c.review?.front??c.title),back=rich(c.reviewFaces?.back.contentText??c.review?.back??(c.note||c.editedText||c.text||c.title));
      if(c.imageBytes){const ink=require('./image-ink.cjs'),frontBytes=await ink.paint(c.imageBytes,c.reviewFaces?.frontImageInk||[],document.colors),backBytes=await ink.paint(c.imageBytes,c.reviewFaces?.backImageInk||[],document.colors),original=add(backBytes,'png'),questionImage=add(frontBytes,'png');back+=`<br><img src="${original}">`;
        if(c.reviewFaces?.frontMode==='card'&&!c.review?.cloze&&!c.review?.occlusions?.length)front+=`<br><img src="${questionImage}">`;
        if(c.review?.occlusions?.length){const {createCanvas,loadImage}=require('@napi-rs/canvas'),image=await loadImage(frontBytes),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.fillStyle='#697483';for(const r of c.review.occlusions)ctx.fillRect(r.x*image.width,r.y*image.height,r.width*image.width,r.height*image.height);front+=`<br><img src="${add(await canvas.encode('png'),'png')}">`;}
      }
      for(const comment of c.comments||[]){if(comment.deletedAt)continue;let html=comment.text?'<hr>'+rich(comment.text):'';if(comment.mediaBytes){const filename=add(comment.mediaBytes,comment.media.extension);html+=comment.media.kind==='audio'?`<br>[sound:${filename}]`:`<br><img src="${filename}">`;}const side=comment.reviewSide||'back';if(side==='front'||side==='both'||c.reviewFaces?.frontMode==='card'&&!c.review?.cloze)front+=html;if(side==='back'||side==='both')back+=html;}
      for(const [side,ink] of [['front',c.reviewFaces?.frontInk],['back',c.reviewFaces?.ink]]){if(!ink?.length)continue;const canvas=require('@napi-rs/canvas').createCanvas(800,400),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,800,400);for(const s of ink)require('./export-render.cjs').stroke(ctx,s,800,400);const html=`<br><img src="${add(await canvas.encode('png'),'png')}">`;if(side==='front')front+=html;else back+=html;}
      const readerLink=`margin-reader://card/${document.id}/${c.id}`;
      const values=[front,back,escapeHtml(source),`<a href="${readerLink}">${readerLink}</a>`];
      const noteId=now+index,guid=digest(`${document.id}/${c.id}${c.exportVariantId&&c.exportVariantId!=='default'?'/'+c.exportVariantId:''}`).slice(0,20),tags=[...(c.tags||[]),...(c.favorite?['marked']:[])].map(t=>t.replace(/\s+/g,'_'));
      const modified=Math.max(seconds,Math.floor(Date.parse(c.updatedAt||document.updatedAt)/1000)||seconds);
      const checksum=parseInt(createHash('sha1').update(front.replace(/<[^>]*>/g,'')).digest('hex').slice(0,8),16);
      noteInsert.run(noteId,guid,mid,modified,-1,' '+tags.join(' ')+' ',values.join('\x1f'),c.title,checksum,0,'');
      cardInsert.run(noteId,noteId,did,0,seconds,-1,0,0,index+1,0,2500,0,0,0,0,0,0,'');
    }
    db.close();zip.file('collection.anki2',await fs.readFile(temporary));zip.file('media',JSON.stringify(media));
    return {bytes:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),media:files.size,notes:rows.length};
  }finally{try{db.close();}catch{}await fs.rm(temporary,{force:true});await fs.rm(temporary+'-journal',{force:true});}
}
module.exports={packageDeck};
