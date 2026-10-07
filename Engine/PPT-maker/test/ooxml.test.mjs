import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import PptxGenJS from 'pptxgenjs';
import {normalizeGeneratedPackage,auditGeneratedPackage} from '../ooxml.mjs';
import {openPackage,xmlPart,serialize,descendants,children,first,NS,inspectPptx} from '../archive.mjs';
import {renderGenerated} from '../render.mjs';
import {makeDeck} from '../scene.mjs';
import {importTemplate,exportNative} from '../template.mjs';
import {outline,content,source} from './fixtures.mjs';
let raw,normalized;
const workbookPart='ppt/embeddings/Microsoft_Excel_Worksheet1.xlsx';
test.before(async()=>{
 const p=new PptxGenJS();p.layout='LAYOUT_WIDE';p.defineSlideMaster({title:'TEST',objects:[]});
 p.addSlide({masterName:'TEST'}).addText('A reusable native master',{x:1,y:1,w:10,h:1});
 p.addSlide({masterName:'TEST'}).addChart(p.ChartType.bar,[{name:'Measurements',labels:['甲','乙','丙'],values:[1.25,3,7]}],{x:1,y:1,w:8,h:4,barDir:'col'});
 raw=Buffer.from(await p.write({outputType:'nodebuffer'}));normalized=await normalizeGeneratedPackage(raw);
});

test('生成包清除悬空母版声明、多余图表轴和未使用表格',async()=>{
 const before=await auditGeneratedPackage(raw);
 assert.ok(before.issues.some(i=>i.code==='DANGLING_CONTENT_TYPE'));
 assert.ok(before.issues.some(i=>i.code==='INVALID_2D_CHART_AXES'));
 assert.ok(before.issues.some(i=>i.code==='INVALID_TABLE_RANGE'));
 assert.ok(before.issues.some(i=>i.code==='UNCONNECTED_WORKSHEET_TABLE'));
 const after=await auditGeneratedPackage(normalized);assert.equal(after.passed,true,JSON.stringify(after.issues));
});

test('导出正规化保留原生页面、图表数值与工作表原文',async()=>{
 const a=await inspectPptx(raw),b=await inspectPptx(normalized);
 assert.deepEqual(a.perSlide,b.perSlide);assert.equal(b.native.charts,1);assert.equal(b.native.embeddedWorkbooks,1);
 const az=await openPackage(raw),bz=await openPackage(normalized);
 const aw=await JSZip.loadAsync(await az.file(workbookPart).async('nodebuffer')),bw=await JSZip.loadAsync(await bz.file(workbookPart).async('nodebuffer'));
 for(const part of ['xl/worksheets/sheet1.xml','xl/sharedStrings.xml','xl/styles.xml'])assert.equal(await aw.file(part).async('string'),await bw.file(part).async('string'));
 const chart=await xmlPart(bz,'ppt/charts/chart1.xml');
 assert.deepEqual(descendants(first(chart,'c','numCache'),'c','pt').map(n=>Number(first(n,'c','v').textContent)),[1.25,3,7]);
});

test('生成包正规化幂等，合格文件不重新压缩',async()=>{
 const again=await normalizeGeneratedPackage(normalized);assert.ok(again.equals(normalized));
});

test('生成包检查能发现新增悬空ContentType和缺失内容类型',async()=>{
 const z=await openPackage(normalized),doc=await xmlPart(z,'[Content_Types].xml');
 const entry=doc.createElementNS(NS.ct,'Override');entry.setAttribute('PartName','/ppt/slideMasters/missing.xml');entry.setAttribute('ContentType','application/xml');doc.documentElement.appendChild(entry);
 z.file('[Content_Types].xml',serialize(doc));z.file('ppt/media/unknown.unregistered','fixture');
 const r=await auditGeneratedPackage(await z.generateAsync({type:'nodebuffer'}));
 assert.ok(r.issues.some(i=>i.code==='DANGLING_CONTENT_TYPE'));assert.ok(r.issues.some(i=>i.code==='MISSING_PART_CONTENT_TYPE'));
});

test('二维图表检查能发现不存在的轴和交叉轴',async()=>{
 const z=await openPackage(normalized),doc=await xmlPart(z,'ppt/charts/chart1.xml');
 const chart=first(doc,'c','barChart'),axis=children(chart,'c','axId')[0];axis.setAttribute('val','999');
 first(doc,'c','crossAx').setAttribute('val','998');z.file('ppt/charts/chart1.xml',serialize(doc));
 const r=await auditGeneratedPackage(await z.generateAsync({type:'nodebuffer'}));
 assert.ok(r.issues.some(i=>i.code==='INVALID_2D_CHART_AXES'));assert.ok(r.issues.some(i=>i.code==='MISSING_CROSS_AXIS'));
});

test('柱线饼环图及多序列数据均通过生成包审计',async()=>{
 for(const type of ['bar','line','pie','doughnut']){
  const d=makeDeck(content(outline()),{sources:[{id:'S1',name:'test'},{id:'S2',...source}]}),c=d.slides[5].elements.find(e=>e.type==='chart');c.chart.type=type;
  if(type==='bar'||type==='line')c.chart.series.push({name:'Comparison',values:[10.5,15.2,21]});
  const out=await renderGenerated(d);assert.equal(out.validation.packageAudit.passed,true,type);
  const imported=await importTemplate(out.bytes),read=imported.slides[5].elements.find(e=>e.type==='chart');
  assert.deepEqual(read.chart.series,c.chart.series,type);assert.deepEqual(read.chart.categories,c.chart.categories,type);
 }
});

test('用户原始模板不经过生成稿正规化，无改动导出仍字节一致',async()=>{
 const base=await importTemplate(raw),out=await exportNative(raw,base,base);
 assert.ok(out.bytes.equals(raw));assert.equal(out.templatePreservation.unchangedArchive,true);
});
