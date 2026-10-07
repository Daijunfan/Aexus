import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {fixture,ORIGINAL_BULLET,OPTIMIZED_BULLET} from './fixtures.mjs'
import {inspectDocument,applyPatches} from '../document.mjs'
import {verifyLayout,compareGeometry,layoutTools,readGeometry} from '../layout.mjs'
import {complexFixture,CHINESE_ORIGINAL,CHINESE_OPTIMIZED} from './complex-fixtures.mjs'
const evidence=fileURLToPath(new URL('../../../.aexus/artifacts/profile-improvement/layout/',import.meta.url))
test('real LibreOffice rendering preserves page count, line positions, table and header',async()=>{
 assert.ok(layoutTools().ready,'Install LibreOffice and Poppler before layout acceptance')
 const original=fixture(),doc=inspectDocument(original),unit=doc.units.find(u=>u.text===ORIGINAL_BULLET),patch={id:unit.id,before:unit.text,after:OPTIMIZED_BULLET,reason:'Clearer expression',evidenceIds:[unit.id]},result=applyPatches(original,[patch])
 const layout=await verifyLayout(original,result.bytes,result.patches,{keepDirectory:path.join(evidence,'english')})
 assert.equal(layout.passed,true,layout.issues.join('; '));assert.equal(layout.pages,1)
})
test('a real extra page or resized font is rejected rather than quietly shrinking the document',async()=>{
 const original=fixture(),files=unzipSync(original)
 files['word/document.xml']=strToU8(strFromU8(files['word/document.xml']).replace('<w:sectPr>','<w:p><w:r><w:br w:type="page"/><w:t>Unexpected extra page.</w:t></w:r></w:p><w:sectPr>'))
 const layout=await verifyLayout(original,zipSync(files),[],{keepDirectory:path.join(evidence,'overflow')});assert.equal(layout.passed,false);assert.ok(layout.issues.some(s=>s.includes('页数')))
})
test('unchanged line count does not hide clipped replacement or shifted text',()=>{
 const before=[{width:612,height:792,lines:[{x:50,y:100,bottom:110,text:'Original evidence'}]}]
 assert.equal(compareGeometry(before,before,[{id:'t1',after:'Missing optimized words'}]).passed,false)
 assert.equal(compareGeometry(before,[{...before[0],lines:[{...before[0].lines[0],y:120,bottom:130}]}],[]).passed,false)
})

for(const chinese of [false,true])test('real two-page '+(chinese?'Chinese':'English')+' template keeps images, links, list numbering, footer and exact immutable parts',async()=>{
 const original=complexFixture({chinese,multipage:true}),doc=inspectDocument(original),before=chinese?CHINESE_ORIGINAL:ORIGINAL_BULLET,after=chinese?CHINESE_OPTIMIZED:OPTIMIZED_BULLET,unit=doc.units.find(u=>u.text===before)
 assert.ok(unit?.editable);assert.equal(doc.images,1)
 const result=applyPatches(original,[{id:unit.id,before,after,reason:'More direct phrasing of existing experience',evidenceIds:[unit.id]}]),a=unzipSync(original),b=unzipSync(result.bytes)
 for(const name of Object.keys(a))if(name!=='word/document.xml')assert.deepEqual(a[name],b[name],name)
 const layout=await verifyLayout(original,result.bytes,result.patches,{keepDirectory:path.join(evidence,chinese?'chinese-two-page':'english-two-page')})
 assert.ok(layout.passed,layout.issues.join('; '));assert.equal(layout.pages,2)
})
test('empty or nonfinite rendered geometry cannot pass acceptance',()=>{
 assert.throws(()=>readGeometry('<doc><page width="612" height="792"/></doc>'),/分页/)
 assert.throws(()=>readGeometry('<doc><page width="NaN" height="792"><line xMin="1" yMin="1" yMax="2"><word>text</word></line></page></doc>'),/分页/)
})

test('multicolumn reading order does not falsely reject a wrapped edited sentence',()=>{
 const page={width:612,height:792,lines:[{x:50,y:100,bottom:110,text:'Contributed REST'},{x:300,y:100,bottom:110,text:'Side column'},{x:50,y:120,bottom:130,text:'API features'}],readingText:'Contributed REST API features Side column',blocks:['Contributed REST API features','Side column']}
 assert.equal(compareGeometry([page],[page],[{id:'t1',after:'Contributed REST API features'}]).passed,true)
})
