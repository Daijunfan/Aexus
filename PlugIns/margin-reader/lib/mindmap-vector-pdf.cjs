'use strict';
const fs=require('node:fs'),PDFDocument=require('pdfkit'),SVGtoPDF=require('svg-to-pdfkit'),S=require('./safety.cjs');
// Only known platform fonts are consulted. SVG font-family values never become
// filesystem paths. Fonts are subset into the PDF; original font files stay local.
function fonts(doc){
 const choices=process.platform==='darwin'?[['Arial Unicode MS','/System/Library/Fonts/Supplemental/Arial Unicode.ttf']]:process.platform==='win32'?[['Microsoft YaHei','C:/Windows/Fonts/msyh.ttc','MicrosoftYaHei'],['Arial','C:/Windows/Fonts/arial.ttf']]:[['Noto Sans CJK','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','NotoSansCJKsc-Regular'],['DejaVu Sans','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']];
 let selected;
 for(const [name,file,face]of choices){if(!fs.existsSync(file))continue;try{doc.registerFont('ReaderUnicode',file,face);doc.font('ReaderUnicode');selected={name,file,face};break;}catch{}}
 return selected;
}
async function render(a){
 const paper=a.paper||'auto',margin=paper==='auto'?0:24,dimensions=paper==='A4'?[841.89,595.28]:paper==='A3'?[1190.55,841.89]:[a.width*Math.min(1,14000/Math.max(a.width,a.height)),a.height*Math.min(1,14000/Math.max(a.width,a.height))];
 const doc=new PDFDocument({autoFirstPage:false,compress:true,info:{Title:a.title||'Mind map',Creator:'Margin Reader',Producer:'Margin Reader vector PDF'}}),font=fonts(doc),warnings=new Set();
 S.assert(font||!/[^\x00-\xFF]/.test(a.text||''),'FONT_UNAVAILABLE','A local Unicode font is required for vector export. Use raster PDF on this machine.');
 if(font){const opened=require('fontkit').openSync(font.file,font.face),missing=[...new Set([...a.text||''].filter(c=>!/[\s\u200b-\u200f\ufe0e\ufe0f]/.test(c)&&!opened.hasGlyphForCodePoint(c.codePointAt(0))))];S.assert(!missing.length,'FONT_UNAVAILABLE','The local vector font cannot render: '+missing.slice(0,16).join('')+'. Use raster PDF for these characters.');}
 const used=new Set(),chunks=[];let length=0;
 const result=new Promise((resolve,reject)=>{doc.on('data',part=>{length+=part.length;if(length>128*1024*1024){doc.destroy();reject(new S.ReaderError('TOO_LARGE','Vector PDF exceeds 128 MiB.'));return;}chunks.push(part);});doc.once('error',reject);doc.once('end',()=>resolve(Buffer.concat(chunks)));});
 result.catch(()=>{});
 try{
  doc.addPage({size:dimensions,margin:0});const scale=Math.min((dimensions[0]-margin*2)/a.width,(dimensions[1]-margin*2)/a.height),width=a.width*scale,height=a.height*scale,x=(dimensions[0]-width)/2,y=(dimensions[1]-height)/2;
  SVGtoPDF(doc,a.svg,x,y,{width,height,assumePt:true,preserveAspectRatio:'xMidYMid meet',precision:4,
   fontCallback:(family,bold,italic,options)=>{if(font){options.fauxBold=bold;options.fauxItalic=italic;used.add(font.name);if(!/^(system-ui|sans-serif|Arial|Arial Unicode MS|PingFang SC|Helvetica)(,|$)/i.test(family||''))warnings.add('Font '+family+' was mapped to '+font.name);return 'ReaderUnicode';}used.add('Helvetica');return 'Helvetica'+(bold&&italic?'-BoldOblique':bold?'-Bold':italic?'-Oblique':'');},
   imageCallback:source=>{S.assert(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(source),'INVALID_PARAMS','Only embedded map images may be exported.');return Buffer.from(source.slice(source.indexOf(',')+1),'base64');},
   documentCallback:()=>S.fail('INVALID_PARAMS','External SVG resources are not permitted.'),
   warningCallback:message=>{if(!/Unsupported SVG element: (?:title|desc)/.test(message))warnings.add(message);}
  });
  doc.end();return {bytes:await result,vector:true,scale,width:dimensions[0],height:dimensions[1],fonts:[...used],warnings:[...warnings].slice(0,30)};
 }catch(error){doc.destroy();throw error;}
}
module.exports={render};
