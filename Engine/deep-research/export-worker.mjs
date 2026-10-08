import {parentPort,workerData} from 'node:worker_threads'
import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {openSync} from 'fontkit'
import {Document,Packer,Paragraph,TextRun,ExternalHyperlink,InternalHyperlink,Bookmark,Table,TableRow,TableCell,Footer,PageNumber,HeadingLevel,WidthType,AlignmentType,BorderStyle} from 'docx'

const {state,format}=workerData,r=state.report,sources=state.sources,en=state.language==='en'
const t=(zh,english)=>en?english:zh
const clean=text=>String(text??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\u200b]/g,'')
const excerpts=source=>source.excerpts?.length?source.excerpts:[source]
const date=new Date(state.finishedAt),day=date.toISOString().slice(0,10)
const review=[...(state.review?.disagreements??[]),...(state.review?.issues??[]).map(i=>i.reason),...(state.reportReview?.disagreements??[])]
const sections=[{title:t('执行摘要','Executive summary'),paragraphs:r.executiveSummary},...r.sections]
const sourceURL=id=>{const source=sources.find(s=>s.id===id);return source.finalUrl??source.url}

async function word(){
 const runs=(text,options={})=>new TextRun({text:clean(text),...options})
 const link=id=>new ExternalHyperlink({link:sourceURL(id),children:[runs(' ['+id+']',{style:'Hyperlink',size:18})]})
 const p=(text,options={})=>new Paragraph({spacing:{after:150,line:300},children:[runs(text)],...options})
 const para=entry=>new Paragraph({spacing:{after:170,line:310},children:[runs(entry.kind==='analysis'?t('分析判断  ','Analysis  '):'',{bold:true,color:'126D75'}),runs(entry.text),...entry.sourceIds.map(link)]})
 const heading=(title,index)=>new Paragraph({heading:HeadingLevel.HEADING_1,keepNext:true,spacing:{before:340,after:180},children:[new Bookmark({id:'part'+index,children:[runs(title)]})]})
 const titleList=[...sections.map(s=>s.title),t('对照与权衡','Comparison and tradeoffs'),t('独立审查','Independent review'),t('行动建议','Recommended actions'),t('限制与待验证事项','Limitations and open questions'),t('来源清单','Source ledger')]
 const content=[p('AEXUS / DEEP RESEARCH',{spacing:{before:500,after:280},children:[runs('AEXUS / DEEP RESEARCH',{color:'126D75',size:22,bold:true})]}),p(r.title,{spacing:{after:360},children:[runs(r.title,{size:48,bold:true,color:'15333F'})]}),p(state.plan?.objective??state.topic),p(day+'  |  '+sources.length+' '+t('核验来源','verified sources')+'  |  '+new Set(state.workers.map(w=>w.engine)).size+' '+t('类引擎','engine types'),{children:[runs(day+'  |  '+sources.length+' '+t('核验来源','verified sources'),{color:'657780',size:20})]}),p(t('目录','Contents'),{heading:HeadingLevel.HEADING_1}),...titleList.map((title,index)=>new Paragraph({spacing:{after:95},children:[new InternalHyperlink({anchor:'part'+index,children:[runs(String(index+1).padStart(2,'0')+'  '+title,{style:'Hyperlink'})]})]})),new Paragraph({pageBreakBefore:true})]
 let index=0
 for(const section of sections)content.push(heading(section.title,index++),...section.paragraphs.map(para))
 content.push(heading(t('对照与权衡','Comparison and tradeoffs'),index++))
 const border={style:BorderStyle.SINGLE,size:4,color:'DAE4E8'}
 const widths=[1550,3150,3150,1056],cell=(text,column,header=false)=>new TableCell({width:{size:widths[column],type:WidthType.DXA},margins:{top:110,bottom:110,left:110,right:110},shading:header?{fill:'15333F'}:undefined,borders:{top:border,bottom:border,left:border,right:border},children:[p(text,{spacing:{after:40,line:270},children:[runs(text,{bold:header,color:header?'FFFFFF':'243D48',size:19})]})]})
 content.push(new Table({width:{size:8906,type:WidthType.DXA},columnWidths:widths,rows:[new TableRow({tableHeader:true,children:[t('方案','Option'),t('优势','Advantages'),t('取舍','Tradeoffs'),t('引用','Citations')].map((v,i)=>cell(v,i,true))}),...(r.comparisons??[]).map(row=>new TableRow({children:[cell(row.option,0),cell(row.advantages,1),cell(row.tradeoffs,2),new TableCell({width:{size:widths[3],type:WidthType.DXA},margins:{top:110,bottom:110,left:110,right:110},children:[new Paragraph({children:row.sourceIds.map(link)})]})]}))]}))
 content.push(heading(t('独立审查','Independent review'),index++),...(review.length?review:[t('独立证据审查与最终报告审查已通过；没有附加审查意见。','Independent evidence and final-report reviews passed without additional review notes.')]).map(text=>p(text)))
 content.push(heading(t('行动建议','Recommended actions'),index++),...r.recommendations.map(para))
 content.push(heading(t('限制与待验证事项','Limitations and open questions'),index++),...r.limitations.map(text=>p(text)))
 content.push(heading(t('来源清单','Source ledger'),index++))
 for(const source of sources){
  content.push(p(source.id+'  '+source.title,{heading:HeadingLevel.HEADING_2,keepNext:true}),new Paragraph({spacing:{after:140},children:[new ExternalHyperlink({link:source.finalUrl??source.url,children:[runs(source.finalUrl??source.url,{style:'Hyperlink',size:18})]})]}))
  for(const excerpt of excerpts(source))content.push(p(excerpt.quote,{indent:{left:240},border:{left:{style:BorderStyle.SINGLE,size:16,color:'9BC8C9',space:8}}}),p(t('核验时间：','Verified: ')+excerpt.retrievedAt+'  |  '+(excerpt.engines??source.engines??[]).join(' + '),{children:[runs(t('核验时间：','Verified: ')+excerpt.retrievedAt+'  |  '+(excerpt.engines??source.engines??[]).join(' + '),{size:17,color:'657780'})]}),p('SHA-256 '+excerpt.sha256,{children:[runs('SHA-256 '+excerpt.sha256,{size:15,color:'657780'})]}))
 }
 content.push(p(t('摘录匹配不证明结论必然成立；请同时核对适用条件、审查意见和原始来源。','Excerpt matching does not prove a conclusion; also check scope, review notes and original sources.'),{children:[runs(t('摘录匹配不证明结论必然成立；请同时核对适用条件、审查意见和原始来源。','Excerpt matching does not prove a conclusion; also check scope, review notes and original sources.'),{size:18,color:'657780'})]}))
 const document=new Document({
  title:r.title,creator:'Aexus',lastModifiedBy:'Aexus',description:state.plan?.objective,
  styles:{
   default:{document:{run:{font:{ascii:'Arial',hAnsi:'Arial',eastAsia:'Microsoft YaHei',cs:'Arial'},size:22,color:'243D48'},paragraph:{spacing:{after:150,line:300}}}},
   paragraphStyles:[
    {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:32,bold:true,color:'126D75'},paragraph:{keepNext:true}},
    {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:25,bold:true,color:'15333F'},paragraph:{keepNext:true}}
   ]
  },
  sections:[{
   properties:{page:{size:{width:11906,height:16838},margin:{top:1080,bottom:1080,left:1500,right:1500}}},
   footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[
    runs('AEXUS  |  '+day+'  |  ',{size:16,color:'657780'}),new TextRun({children:[PageNumber.CURRENT],size:16,color:'657780'}),
    runs(' / ',{size:16,color:'657780'}),new TextRun({children:[PageNumber.TOTAL_PAGES],size:16,color:'657780'})
   ]})]})},children:content
  }]
 })
 return Packer.toBuffer(document)
}

function reportFont(){
 const all=clean([r.title,state.plan?.objective,...sections.flatMap(s=>[s.title,...s.paragraphs.map(p=>p.text)]),...r.limitations,...r.recommendations.map(p=>p.text),...sources.flatMap(s=>[s.title,...excerpts(s).map(e=>e.quote)]),...review,...(r.comparisons??[]).flatMap(c=>[c.option,c.advantages,c.tradeoffs])].join('\n'))
 const candidates=[...(process.env.AEXUS_REPORT_FONT?[[process.env.AEXUS_REPORT_FONT,process.env.AEXUS_REPORT_FONT_FAMILY]]:[]),['/System/Library/Fonts/STHeiti Light.ttc','STHeitiSC-Light'],['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','NotoSansCJKsc-Regular'],[path.join(process.env.WINDIR??'C:\\Windows','Fonts','msyh.ttc'),'MicrosoftYaHei']]
 for(const [file,family] of candidates)try{
  if(!fs.existsSync(file))continue
  const font=openSync(file,family),characters=[...new Set(Array.from(all))]
  if(characters.filter(c=>!/[\s\uFEFF]/.test(c)).every(c=>font.hasGlyphForCodePoint(c.codePointAt(0))))return font
 }catch{}
 if(!/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u2010-\u2026]/.test(all)&&en)return 'Helvetica'
 throw Error('当前主机缺少覆盖报告字符的字体；请使用 Word/HTML，或在主机配置 AEXUS_REPORT_FONT。不会输出缺字 PDF。')
}
async function pdf(){
 const features={vert:false,vrt2:false}
 const document=new PDFDocument({size:'A4',margins:{top:52,bottom:58,left:54,right:54},bufferPages:true,info:{Title:r.title,Author:'Aexus',CreationDate:date,ModDate:date},compress:true})
 const completed=new Promise((resolve,reject)=>{const chunks=[];let size=0;document.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024){document.destroy(Error('PDF 超过 8 MiB'));return}chunks.push(chunk)});document.once('end',()=>resolve(Buffer.concat(chunks)));document.once('error',reject)})
 const font=reportFont();document.font(font)
 const width=document.page.width-108,bottom=()=>document.page.height-58
 const need=height=>{if(document.y+height>bottom())document.addPage()}
 const body=(text,size=10.5,color='#243D48')=>{document.fontSize(size).fillColor(color).text(clean(text),54,document.y,{features,width,lineGap:4});document.moveDown(.55)}
 const head=(title,level=1)=>{need(level===1?86:65);document.moveDown(.55).fontSize(level===1?19:13).fillColor('#126D75').text(clean(title),54,document.y,{features,width,lineGap:3});document.outline.addItem(clean(title));document.moveDown(.6)}
 const refs=ids=>{need(22);document.fontSize(9).fillColor('#126D75');ids.forEach((id,i)=>document.text('['+id+']'+(i<ids.length-1?'  ':''),{features,link:sourceURL(id),continued:i<ids.length-1,width}));document.moveDown(.85)}
 const para=entry=>{need(52);body(entry.kind==='analysis'?t('分析判断','ANALYSIS'):t('有来源的事实','SOURCED FINDING'),8,'#657780');body(entry.text);refs(entry.sourceIds)}
 body('AEXUS / DEEP RESEARCH',10,'#126D75');document.moveDown(1.2);document.fontSize(28).fillColor('#15333F').text(clean(r.title),{features,width,lineGap:6});document.moveDown(.8);body(state.plan?.objective??state.topic,12);body(day+'  |  '+sources.length+' '+t('核验来源','verified sources'),9,'#657780');document.moveDown(.6)
 for(const section of sections){head(section.title);section.paragraphs.forEach(para)}
 head(t('对照与权衡','Comparison and tradeoffs'))
 for(const row of r.comparisons??[]){head(row.option,2);body(t('优势：','Advantages: ')+row.advantages);body(t('取舍：','Tradeoffs: ')+row.tradeoffs);refs(row.sourceIds)}
 head(t('证据分布','Evidence distribution'))
 const domains=new Map();for(const source of sources){const domain=new URL(source.finalUrl??source.url).hostname;domains.set(domain,(domains.get(domain)??0)+1)}
 for(const [domain,count] of [...domains].sort((a,b)=>b[1]-a[1])){need(60);body(domain+'  ('+count+')',9);const y=document.y;document.rect(54,y,width,7).fill('#E5EFF0');document.rect(54,y,width*count/sources.length,7).fill('#16818A');document.y=y+18}
 body(t('图表反映来源数量，不表示结论置信度。','Charts show source counts, not confidence probabilities.'),8,'#657780')
 head(t('独立审查','Independent review'));(review.length?review:[t('独立证据审查与最终报告审查已通过；没有附加审查意见。','Independent evidence and final-report reviews passed without additional review notes.')]).forEach(text=>body(text))
 head(t('行动建议','Recommended actions'));r.recommendations.forEach(para)
 head(t('限制与待验证事项','Limitations and open questions'));r.limitations.forEach(text=>body(text))
 head(t('来源清单','Source ledger'))
 for(const source of sources){head(source.id+'  '+source.title,2);document.fontSize(8).fillColor('#126D75').text(source.finalUrl??source.url,{features,width,link:source.finalUrl??source.url,lineGap:3});document.moveDown(.7);for(const excerpt of excerpts(source)){body(excerpt.quote,10);body(t('核验：','Verified: ')+excerpt.retrievedAt+' | '+(excerpt.engines??source.engines??[]).join(' + '),7.5,'#657780');body('SHA-256 '+excerpt.sha256,6.7,'#657780')}}
 const range=document.bufferedPageRange(),pages=range.count
 for(let page=0;page<pages;page++){
  document.switchToPage(page);const oldBottom=document.page.margins.bottom;document.page.margins.bottom=0
  document.moveTo(54,document.page.height-43).lineTo(document.page.width-54,document.page.height-43).strokeColor('#DAE4E8').lineWidth(.5).stroke()
  document.fontSize(8).fillColor('#657780').text('AEXUS  |  '+day+'  |  '+(page+1)+' / '+pages,54,document.page.height-33,{features,width,align:'center',lineBreak:false})
  document.page.margins.bottom=oldBottom
 }
 document.end();return completed
}
try{const bytes=await (format==='docx'?word():pdf());parentPort.postMessage({ok:true,bytes})}catch(error){parentPort.postMessage({ok:false,error:error.message??String(error)})}
