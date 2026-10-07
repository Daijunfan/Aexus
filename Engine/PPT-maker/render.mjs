/** Native PowerPoint export. Generated slides are editable objects, never slide screenshots. */
import PptxGenJS from 'pptxgenjs';
import {validateDeck,inspectDeck,textMetrics,normalizeGenerated} from './scene.mjs';
import {inspectPptx} from './archive.mjs';
import {normalizeGeneratedPackage,auditGeneratedPackage} from './ooxml.mjs';
export async function renderGenerated(deck,{allowWarnings=true}={}){
 normalizeGenerated(deck);validateDeck(deck);if(deck.kind!=='generated')throw Error('请使用模板保真导出入口');
 const quality=inspectDeck(deck);if(!quality.passed||!allowWarnings&&quality.warnings)throw Object.assign(Error('版面检查未通过：'+quality.issues.filter(i=>i.severity==='error'||!allowWarnings).slice(0,4).map(i=>i.message).join('；')),{code:'PPT_LAYOUT_INVALID',quality});
 const pptx=new PptxGenJS();pptx.defineLayout({name:'ENGINE',width:deck.width,height:deck.height});pptx.layout='ENGINE';pptx.author='Aexus PPT-maker';pptx.subject='Editable presentation';pptx.title=deck.title;pptx.company='Aexus';pptx.lang=deck.language==='en'?'en-US':'zh-CN';
 pptx.theme={headFontFace:deck.theme.font,bodyFontFace:deck.theme.font,lang:pptx.lang};
 // A real native master/layout is retained in the output. Footer text remains per-slide.
 pptx.defineSlideMaster({title:'PPT_MAKER_MASTER',background:{color:deck.theme.background},objects:[]});
 for(const page of deck.slides){
  const slide=pptx.addSlide({masterName:'PPT_MAKER_MASTER'});slide.background={color:page.background??deck.theme.background};
  for(const e of page.elements){
   const box={x:e.x,y:e.y,w:e.w,h:e.h,objectName:e.id,...(e.rotation?{rotate:e.rotation}:{})};
   if(e.type==='text'){
    const text=textMetrics(e).lines.join('\n');
    slide.addText(text,{...box,fontFace:e.fontFamily??deck.theme.font,fontSize:e.fontSize,color:e.color??deck.theme.ink,bold:!!e.bold,italic:!!e.italic,underline:!!e.underline,align:e.align??'left',valign:e.valign==='middle'?'mid':e.valign==='bottom'?'bottom':'top',margin:(e.padding??0)*72,breakLine:false,lineSpacingMultiple:e.lineHeight??1.22,paraSpaceAfter:0,paraSpaceBefore:0,fit:'none',transparency:e.opacity===undefined?0:(1-e.opacity)*100});
   }else if(e.type==='shape'){
    slide.addShape(pptx.ShapeType[e.shape]??pptx.ShapeType.rect,{...box,...(e.fill&&e.fill!=='none'?{fill:{color:e.fill,transparency:e.opacity===undefined?0:(1-e.opacity)*100}}:{fill:{color:'FFFFFF',transparency:100}}),line:e.stroke&&e.stroke!=='none'?{color:e.stroke,width:e.strokeWidth??1,...(e.arrow?{endArrowType:'triangle'}:{})}:{color:e.fill&&e.fill!=='none'?e.fill:'FFFFFF',transparency:100,width:0}});
   }else if(e.type==='image'){
    const asset=deck.assets[e.assetId],data=asset.data;
    const sizing=e.fit==='cover'?pptx.imageSizingCrop(data,e.x,e.y,e.w,e.h):pptx.imageSizingContain(data,e.x,e.y,e.w,e.h);
    slide.addImage({...box,...sizing,data,altText:asset.name??'Uploaded image'});
   }else if(e.type==='table'){
    const rows=e.rows.map((r,i)=>r.map(value=>({text:value,options:{fill:i===0&&e.header?e.headerFill??deck.theme.accent:e.fill??deck.theme.paper,color:i===0&&e.header?e.headerColor??'FFFFFF':e.color??deck.theme.ink,bold:i===0&&!!e.header}})));
    slide.addTable(rows,{...box,fontFace:deck.theme.font,fontSize:e.fontSize??16,border:{type:'solid',pt:.5,color:e.stroke??'CBD5E1'},margin:[4,6,4,6],colW:Array(e.rows[0].length).fill(e.w/e.rows[0].length),rowH:e.h/e.rows.length,autoPage:false,paraSpaceAfter:0,valign:'top',color:e.color??deck.theme.ink});
   }else if(e.type==='chart'){
    const chart=e.chart,data=chart.series.map(s=>({name:s.name,labels:[...chart.categories],values:[...s.values]})),pie=['pie','doughnut'].includes(chart.type);
    slide.addChart(pptx.ChartType[chart.type],data,{...box,chartColors:!pie&&chart.series.length===1?[e.colors?.[0]??deck.theme.accent]:e.colors??[deck.theme.accent,deck.theme.secondary],showTitle:false,showLegend:true,legendPos:pie?'r':'b',legendFontFace:deck.theme.font,legendFontSize:10,legendColor:e.color??deck.theme.ink,showValue:false,showLabel:false,showPercent:false,holeSize:57,showBorder:false,showMarker:chart.type==='line',markerSize:5,lineSize:2,barDir:'col',grouping:'clustered',catAxisLabelFontFace:deck.theme.font,catAxisLabelFontSize:10,catAxisLabelColor:e.color??deck.theme.ink,catAxisLineShow:false,catAxisMajorTickMark:'none',valAxisLabelFontFace:deck.theme.font,valAxisLabelFontSize:10,valAxisLabelColor:e.color??deck.theme.ink,valAxisLineShow:false,valAxisMajorTickMark:'none',valGridLine:{color:'CBD5E1',size:.5},showCatName:false,showSerName:false,layout:pie?{x:.02,y:.04,w:.64,h:.78}:{x:.08,y:.05,w:.87,h:.78},altText:'Editable '+chart.type+' chart; '+(chart.unit??'')});
   }else throw Error('新创作文稿包含无法导出的对象：'+e.type);
  }
  const sources=(page.sourceIds??[]).map(id=>deck.sources.find(s=>s.id===id)).filter(Boolean).map(s=>`${s.id} — ${s.name}${s.url?' · '+s.url:''}`);
  const notes=[page.notes??'',sources.length?'来源 / Sources\n'+sources.join('\n'):''].filter(Boolean).join('\n\n');if(notes)slide.addNotes(notes);
 }
 const bytes=await normalizeGeneratedPackage(Buffer.from(await pptx.write({outputType:'nodebuffer',compression:true})));
 const packageAudit=await auditGeneratedPackage(bytes);
 if(!packageAudit.passed)throw Object.assign(Error('PPTX生成包校验失败：'+packageAudit.issues.slice(0,4).map(i=>i.code+' '+i.part).join('；')),{code:'PPT_PACKAGE_INVALID',packageAudit});
 const validation={...await inspectPptx(bytes),packageAudit};
 if(validation.slides!==deck.slides.length)throw Error('导出页数与文稿不一致');
 const expected={tables:0,charts:0,text:0};for(const s of deck.slides)for(const e of s.elements){if(e.type==='table')expected.tables++;if(e.type==='chart')expected.charts++;if(e.type==='text')expected.text++;}
 if(validation.native.tables!==expected.tables||validation.native.charts!==expected.charts||validation.native.textNodes<expected.text||validation.native.embeddedWorkbooks<expected.charts)throw Error('导出的原生文字/表格/图表或可编辑工作簿数量不匹配');
 return {bytes,quality,validation};
}
