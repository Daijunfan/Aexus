import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {create,describe} from '../../../Engine/deep-research/model.mjs'
import {prepare,DOCUMENT_LIMITS} from '../../../Engine/deep-research/documents.mjs'
import {exportReport} from '../../../Engine/deep-research/exports.mjs'
import {fork} from '../../../Engine/deep-research/followup.mjs'
import {verifySource} from '../../../Engine/deep-research/sources.mjs'
import {absorb} from '../../../Engine/deep-research/evidence.mjs'
import {pause} from '../../../Engine/deep-research/agents.mjs'
import {toolbarOffset} from '../renderer/src/components/company-toolbar-center.mjs'
import {documents,reply,material} from './fixtures/deep-research-answer.mjs'
const require=createRequire(new URL('../../../Engine/deep-research/package.json',import.meta.url))
const {zipSync,strToU8,unzipSync}=require('fflate')
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/research-studio-docs');fs.mkdirSync(out,{recursive:true})
const input=(name,bytes)=>({files:[{name,encoding:'base64',content:Buffer.from(bytes).toString('base64')}]})
const ctx={signal:new AbortController().signal,checkpoint:async()=>{}}
const fixture=async()=>{
 const state=create({topic:'多 Agent 研究报告 · 真实文件格式验收',engines:[{engine:'codex'},{engine:'claude'}]})
 state.sources=await Promise.all(documents.map(async(source,index)=>({...await verifySource(source,{read:async url=>({url,body:material(url),bytes:Buffer.byteLength(material(url))})}),id:'S'+(index+1),engines:[index%2?'claude':'codex'],workerIds:['worker-'+index]})))
 state.report=reply('[AEXUS_DEEP_RESEARCH_TASK]\n\n'+JSON.stringify({taskId:'studio',kind:'report',payload:{sources:state.sources}}),'claude').report
 state.phase='complete';state.reportReview={verdict:'pass',issues:[],disagreements:[]};state.review={verdict:'pass',issues:[],disagreements:[]};state.plan={objective:'验证中文文档、来源引用、可编辑表格与报告分页。'};state.workers=[{id:'lead',engine:'codex'},{id:'source',engine:'claude'}];state.finishedAt='2026-10-08T00:00:00.000Z'
 return state
}
let state,word,pdf

test('text preparation is explicit, bounded, hashed and leaves workflow evidence empty',async()=>{
 const text='用户背景材料 PRIVATE_CONTEXT\n检验公开研究的恢复路径。',result=await prepare(input('brief.md',text))
 assert.equal(result.materials[0].text,text);assert.equal(result.materials[0].provenance.sha256,createHash('sha256').update(text).digest('hex'))
 const initial=create({topic:'study',materials:result.materials});assert.equal(initial.sources.length,0);assert.ok(!JSON.stringify(describe(initial)).includes('PRIVATE_CONTEXT'))
 for(const bad of [{files:[]},input('../secret.txt','x'),input('binary.exe','x'),{files:[{name:'x.txt',encoding:'base64',content:'%%%'}]},input('bad.txt',Buffer.from([0,1,2])),input('oversize.txt',Buffer.alloc(DOCUMENT_LIMITS.fileBytes+1))])await assert.rejects(prepare(bad))
 const controller=new AbortController();controller.abort(Error('explicit abort'));await assert.rejects(prepare(input('x.txt','hello'),{signal:controller.signal}),/explicit abort/)
})
test('oversized extracted text is visibly truncated instead of silently called complete',async()=>{
 const result=await prepare(input('long.txt','中'.repeat(80020)))
 assert.equal(result.materials[0].text.length,80000);assert.equal(result.materials[0].provenance.characters,80020);assert.equal(result.materials[0].provenance.truncated,true);assert.match(result.materials[0].provenance.warnings.join(' '),/80,000/)
})
test('Word export contains editable text, real tables, hyperlinks and a complete source ledger',async()=>{
 state=await fixture();const original=JSON.stringify(state);word=await exportReport(state,'docx');const bytes=Buffer.from(word.content,'base64');fs.writeFileSync(path.join(out,word.name),bytes)
 const parts=unzipSync(bytes),xml=Buffer.from(parts['word/document.xml']).toString('utf8'),rels=Buffer.from(parts['word/_rels/document.xml.rels']).toString('utf8')
 for(const p of [...state.report.executiveSummary,...state.report.sections.flatMap(s=>s.paragraphs),...state.report.recommendations])assert.ok(xml.includes(p.text))
 assert.ok(xml.includes('<w:tbl>'));assert.ok(xml.includes('<w:bookmarkStart'));for(const source of state.sources)assert.ok(rels.includes(source.url))
 const parsed=await prepare(input(word.name,bytes));assert.ok(parsed.materials[0].text.includes(state.report.title));assert.ok(parsed.materials[0].text.includes('SHA-256'));assert.equal(parsed.materials[0].provenance.truncated,false)
 assert.equal(JSON.stringify(state),original);fs.writeFileSync(path.join(out,'docx-text.txt'),parsed.materials[0].text)
})
test('PDF export contains selectable Chinese text, linked references and stable final pagination',async()=>{
 state??=await fixture();pdf=await exportReport(state,'pdf');const bytes=Buffer.from(pdf.content,'base64');fs.writeFileSync(path.join(out,pdf.name),bytes)
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');const parsed=await prepare(input(pdf.name,bytes));assert.ok(parsed.materials[0].provenance.pages>=3)
 const joined=parsed.materials[0].text.replace(/AEXUS\s*\|\s*\d{4}-\d{2}-\d{2}\s*\|\s*\d+\s*\/\s*\d+/g,'').replace(/\[Page \d+\]/g,'').replace(/\s/g,'');for(const section of state.report.sections)assert.ok(joined.includes(section.title.replace(/\s/g,'')))
 assert.ok(joined.includes(state.report.sections.at(-1).paragraphs.at(-1).text.replace(/\s/g,'')))
 const {getDocument}=await import('../../../Engine/deep-research/node_modules/pdfjs-dist/legacy/build/pdf.mjs'),loading=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,verbosity:0})
 try{const doc=await loading.promise;let links=0;for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i);links+=(await page.getAnnotations()).filter(a=>a.subtype==='Link'&&a.url).length;const text=(await page.getTextContent()).items.map(i=>i.str??'').join('');assert.ok(text.includes(i+' / '+doc.numPages),'Footer pagination is correct')}assert.ok(links>=state.sources.length)}finally{await loading.destroy()}
 fs.writeFileSync(path.join(out,'pdf-text.txt'),parsed.materials[0].text);fs.writeFileSync(path.join(out,'state.json'),JSON.stringify(state))
})
test('Office readers retain sheet and slide identity without executing formulas or external targets',async()=>{
 const zip=parts=>zipSync(Object.fromEntries(Object.entries(parts).map(([name,text])=>[name,strToU8(text)])))
 const types='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'
 const sheet=zip({'[Content_Types].xml':types,'xl/workbook.xml':'<workbook xmlns:r="urn:r"><sheets><sheet name="预算" r:id="rId1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="bad" Target="https://private.invalid" TargetMode="External"/></Relationships>','xl/sharedStrings.xml':'<sst><si><t>成本</t></si></sst>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="B1"><f>WEBSERVICE("https://should-never-load.invalid")</f><v>42</v></c></row></sheetData></worksheet>'})
 const excel=await prepare(input('budget.xlsx',sheet));assert.ok(excel.materials[0].text.includes('[Sheet: 预算]'));assert.ok(excel.materials[0].text.includes('B1=42'));assert.ok(!excel.materials[0].text.includes('WEBSERVICE'));assert.equal(excel.materials[0].provenance.sheets,1)
 const deck=zip({'[Content_Types].xml':types,'ppt/presentation.xml':'<presentation xmlns:r="urn:r"><sldIdLst><sldId r:id="second"/><sldId r:id="first"/></sldIdLst></presentation>','ppt/_rels/presentation.xml.rels':'<Relationships><Relationship Id="first" Target="slides/slide1.xml"/><Relationship Id="second" Target="slides/slide2.xml"/></Relationships>','ppt/slides/slide1.xml':'<slide xmlns:a="urn:a"><a:p><a:r><a:t>First source</a:t></a:r></a:p></slide>','ppt/slides/slide2.xml':'<slide xmlns:a="urn:a"><a:p><a:r><a:t>Second source</a:t></a:r></a:p></slide>'})
 const ppt=await prepare(input('slides.pptx',deck));assert.ok(ppt.materials[0].text.startsWith('[Slide 1]\nSecond source'));assert.equal(ppt.materials[0].provenance.pages,2)
 const evil=zip({'[Content_Types].xml':types,'word/document.xml':'<!DOCTYPE doc [<!ENTITY ext SYSTEM "file:///etc/passwd">]><document><body><p><t>&ext;</t></p></body></document>'})
 await assert.rejects(prepare(input('evil.docx',evil)),/DTD|实体/)
 const bomb=zip({'[Content_Types].xml':types,'word/document.xml':' '.repeat(6*1024*1024+1)})
 await assert.rejects(prepare(input('large.docx',bomb)),/上限/)
})
test('a valid prefix cannot validate an invented suffix or grant another research engine credit',async()=>{
 const quote='A complete verified source statement contains enough words to test the exact content rather than merely a prefix. '.repeat(2),url='https://example.org/source',read=async()=>({url,body:'<p>'+quote+'</p>',bytes:quote.length})
 await assert.rejects(verifySource({url,title:'Source',quote:quote+'Fabricated ending.'},{read}),/未找到/)
 const s=create({topic:'exact quotes'});await absorb(s,ctx,[{engine:'codex',workerId:'a',result:{sources:[{url,title:'Source',quote}],findings:[{statement:'Fact',kind:'fact',urls:[url]}]}},{engine:'claude',workerId:'b',result:{sources:[{url,title:'Source',quote:quote+'Fabricated ending.'}],findings:[{statement:'Fake',kind:'fact',urls:[url]}]}}],{read})
 assert.deepEqual(s.sources[0].engines,['codex']);assert.equal(s.findings.length,1);assert.equal(s.rejectedFindings.length,1)
})
test('follow-ups preserve originals, start fresh evidence and require explicit private material reuse',async()=>{
 state??=await fixture();const parent={...state,materials:[{name:'private.md',text:'PRIVATE_CONTEXT'}]};const original=JSON.stringify(parent)
 const next=fork(parent,{topic:'Investigate recent counterevidence'});assert.equal(next.phase,'scope');assert.deepEqual(next.sources,[]);assert.deepEqual(next.workers,[]);assert.deepEqual(next.materials,[]);assert.equal(next.parentContext.title,parent.report.title);assert.ok(next.sourcePolicy.seedUrls.length>0)
 assert.equal(fork(parent,{topic:'Follow-up',reuseMaterials:true}).materials[0].text,'PRIVATE_CONTEXT');assert.equal(JSON.stringify(parent),original)
 assert.throws(()=>fork({...parent,phase:'research'},{topic:'x'}));assert.throws(()=>fork(parent,{topic:'x',reuseMaterials:'yes'}));assert.throws(()=>fork(parent,{topic:'x',parentId:'forged'}))
 await assert.rejects(exportReport({...parent,phase:'research'},'pdf'));await assert.rejects(exportReport(parent,'exe'))
})
test('pause persists a recovered receipt and waits for that owned approval turn to stop',async()=>{
 const s=create({topic:'pause receipts'});s.tasks={one:{employeeId:'a',status:'running',prompt:'original',transportUncertain:true}};let reads=0,interrupted=0
 const context={signal:new AbortController().signal,client:{invoke:async(command,args)=>{
  if(command==='session.transcript')return {items:[{role:'user',text:'original',outbound:{taskId:'owned'}}]}
  if(command==='session.status')return [{busy:false,waitingApproval:++reads<3,currentTask:{messageId:'owned'}}]
  if(command==='session.interrupt'){assert.equal(args.expectedMessageId,'owned');interrupted++;return {interrupted:true}}
  throw Error(command)
 }}}
 await pause(s,context);assert.equal(s.tasks.one.receipt.messageId,'owned');assert.equal(interrupted,1);assert.ok(reads>=3);assert.equal(s.pausedForOwner,true)
 const ambiguous={...s,tasks:{one:{employeeId:'a',status:'running',prompt:'original'}}};await assert.rejects(pause(ambiguous,{...context,client:{invoke:async()=>({items:[{role:'user',text:'original',outbound:{taskId:'a'}},{role:'user',text:'original',outbound:{taskId:'b'}}]})}}),/歧义/)
})
test('toolbar centering uses the window midpoint and respects constrained space at every zoom',()=>{
 let cases=0
 for(const scale of [.75,1,1.25,1.5,2])for(const width of [390,720,1100,1440,1920])for(const sidebar of [0,64,320]){
  const left=Math.min(sidebar,width/2)+16,right=width-16,navWidth=Math.min(560,(right-left)*.9),baseCenter=(left+right)/2
  const value=toolbarOffset({windowCenter:width/2,baseCenter,navWidth,left,right,scale}),center=baseCenter+value.offset*scale
  assert.ok(center-navWidth/2>=left-.01);assert.ok(center+navWidth/2<=right+.01)
  if(!value.constrained)assert.ok(Math.abs(center-width/2)<=.01)
  cases++
 }
 assert.equal(cases,75)
})
