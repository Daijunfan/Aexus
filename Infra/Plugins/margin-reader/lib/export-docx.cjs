'use strict';
const JSZip=require('jszip');
const {escapeHtml:escape}=require('./safety.cjs');
const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
// Minimal standards-based OOXML; no macros, remote templates or executable media.
async function wordDocument(document){
  const zip=new JSZip(),rels=[],images=[];let relation=1,drawing=1;
  const text=(value,style='Normal')=>`<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${String(value||'').split('\n').map((line,i)=>`${i?'<w:r><w:br/></w:r>':''}<w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r>`).join('')}</w:p>`;
  function picture(bytes,label,width=600,height=300){
    const name=`image${images.length+1}.png`,id=`rId${relation++}`,maxWidth=5400000,maxHeight=7200000,scale=Math.min(maxWidth/width,maxHeight/height);
    const cx=Math.round(width*scale),cy=Math.round(height*scale),number=drawing++;images.push(name);zip.file('word/media/'+name,bytes);
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
    return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${number}" name="Figure ${number}" descr="${escape(label)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${number}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  const depths=new Map();let body=text(document.title,'Title')+text(document.description||'');const warnings=[];
  for(const c of document.cards){const depth=c.parentId?(depths.get(c.parentId)||0)+1:0;depths.set(c.id,depth);
    body+=text(c.title,`Heading${Math.min(3,depth+1)}`);
    if(c.tags?.length)body+=text(c.tags.map(t=>'#'+t).join(' '),'Caption');
    if(c.editedText??c.text)body+=text(c.editedText??c.text);
    if(c.imageBytes)body+=picture(c.imageBytes,c.title,c.image.width,c.image.height);
    if(c.note)body+=text(c.note);
    for(const comment of c.comments||[]){if(comment.deletedAt)continue;body+=text(comment.text||'');if(comment.mediaBytes){if(comment.media.kind==='image')body+=picture(comment.mediaBytes,comment.media.name,comment.media.width,comment.media.height);else{body+=text('Audio: '+comment.media.name+' (available in HTML, Anki or the complete study package)','Caption');warnings.push('Audio attachments are not embedded in Word; use HTML/APKG/MRPKG for playable audio.');}}}
    const address=`margin-reader://card/${document.id}/${c.id}`,id=`rId${relation++}`;
    rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${address}" TargetMode="External"/>`);
    if(c.source)body+=text(c.source.title+' · '+(c.source.locator.page?'p. '+c.source.locator.page:'section '+(c.source.locator.section+1)),'Caption');
    body+=`<w:p><w:hyperlink r:id="${id}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${address}</w:t></w:r></w:hyperlink></w:p>`;
  }
  zip.file('[Content_Types].xml',XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels',XML+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',XML+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/document.xml',XML+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  zip.file('word/styles.xml',XML+'<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="PingFang SC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+[['Title',38],['Heading1',30],['Heading2',26],['Heading3',24]].map(([name,size])=>`<w:style w:type="paragraph" w:styleId="${name}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120"/>${name!=='Title'?`<w:outlineLvl w:val="${Number(name.slice(-1))-1}"/>`:''}</w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`).join('')+'<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="596579"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:rPr><w:color w:val="2767A3"/><w:u w:val="single"/></w:rPr></w:style></w:styles>');
  return {bytes:await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}),warnings:[...new Set(warnings)]};
}
module.exports={wordDocument};
