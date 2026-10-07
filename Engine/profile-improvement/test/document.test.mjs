import test from 'node:test'
import assert from 'node:assert/strict'
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate'
import {inspectDocument,applyPatches,validatePatches,decodeBase64,encodeBase64} from '../document.mjs'
import {create,parseTargets,modelDocument,validateFacts,validateMatch} from '../model.mjs'
import {fixture,ORIGINAL_BULLET,OPTIMIZED_BULLET} from './fixtures.mjs'
const patchFor=(doc,before=ORIGINAL_BULLET,after=OPTIMIZED_BULLET)=>{const u=doc.units.find(u=>u.text===before);return {id:u.id,before,after,reason:'Preserve true experience and improve wording',evidenceIds:[u.id]}}
test('only original body text changes; styles, table, header and every other part remain exact',()=>{
 const bytes=fixture(),before=Uint8Array.from(bytes),doc=inspectDocument(bytes,'resume.docx'),patch=patchFor(doc),result=applyPatches(bytes,[patch]),a=unzipSync(bytes),b=unzipSync(result.bytes)
 assert.deepEqual(bytes,before);assert.equal(doc.tables,1);assert.deepEqual(Object.keys(a),Object.keys(b))
 for(const name of Object.keys(a))if(name!=='word/document.xml')assert.deepEqual(a[name],b[name],name)
 assert.ok(strFromU8(b['word/document.xml']).includes(OPTIMIZED_BULLET));assert.ok(result.verification.stylesPreserved);assert.equal(result.verification.changedParts.length,1)
})
test('preserves bold runs and paragraph/column structure while escaping new text',()=>{
 const bytes=fixture({extra:'<w:p><w:r><w:t>Documented APIs and wrote clear guides.</w:t></w:r></w:p>'}),doc=inspectDocument(bytes,'resume.docx')
 const patch=patchFor(doc,'Documented APIs and wrote clear guides.','Documented APIs & wrote clear guides.'),result=applyPatches(bytes,[patch]),xml=strFromU8(unzipSync(result.bytes)['word/document.xml'])
 assert.ok(xml.includes('APIs &amp; wrote'));assert.ok(xml.includes('<w:rPr><w:b/></w:rPr><w:t>Python</w:t>'));assert.equal(inspectDocument(result.bytes).units.find(u=>u.id===patch.id).text,patch.after)
})
test('identity, contact information, dates, metrics and readonly text cannot be invented or altered',()=>{
 const bytes=fixture(),doc=inspectDocument(bytes),name=doc.units[0],contact=doc.units[1],p=patchFor(doc)
 for(const unit of [name,contact])assert.throws(()=>validatePatches(doc,[{...p,id:unit.id,before:unit.text,after:'Changed identity'}]),/不能修改/)
 assert.throws(()=>validatePatches(doc,[{...p,after:'Built 99 REST APIs.'}]),/数字/)
 assert.throws(()=>validatePatches(doc,[{...p,evidenceIds:['missing']}]),/证据/)
 assert.throws(()=>validatePatches(doc,[{...p,before:'Not the original'}]),/原文/)
 assert.throws(()=>validatePatches(doc,[{...p,after:ORIGINAL_BULLET.repeat(3)}]),/预算/)
 assert.throws(()=>validatePatches(doc,[p],{protectedIds:[p.id]}),/不能修改/)
})
test('invalid formats, encrypted/oversized archives, macros and tracked changes fail before model work',()=>{
 assert.throws(()=>inspectDocument(fixture(),'resume.pdf'),/docx/)
 assert.throws(()=>inspectDocument(new TextEncoder().encode('%PDF-1.7 fake'),'fake.docx'),/docx/)
 assert.throws(()=>inspectDocument(fixture({tracked:true})),/修订/)
 const files=unzipSync(fixture());files['word/vbaProject.bin']=new Uint8Array([1,2]);assert.throws(()=>inspectDocument(zipSync(files)),/宏/)
 const other=unzipSync(fixture());other['word/_rels/header1.xml.rels']=strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" TargetMode="External" Target="https://example.invalid/tracker"/></Relationships>');assert.throws(()=>inspectDocument(zipSync(other)),/外部/)
 assert.throws(()=>decodeBase64('not-a-file'),/无效/)
})
test('independent target variants are based on the same original; inputs and evidence are strictly checked',()=>{
 const state=create({resume:{name:'resume.docx',data:encodeBase64(fixture())},targets:'后端开发；测试开发'})
 assert.deepEqual(state.targets,['后端开发','测试开发']);assert.throws(()=>parseTargets('a;b;c;d'),/三个/)
 assert.throws(()=>create({resume:{name:'a.docx',data:encodeBase64(fixture())},targets:'developer',providerKey:'forbidden'}),/输入/)
 assert.throws(()=>validateFacts({facts:[{unitId:'t0006',quote:'Led a team of 100',category:'experience'}],protectedIds:[]},state.document),/原简历/)
 assert.throws(()=>validateMatch({roles:[]},state),/对应/)
 const payload=JSON.stringify(modelDocument(state.document));assert.ok(!payload.includes('alex@example.com'));assert.ok(!payload.includes('Alex Morgan'))
})
test('explicit empty Word text nodes cannot shift subsequent replacement identities',()=>{
 const bytes=fixture({extra:'<w:p><w:r><w:t></w:t></w:r><w:r><w:t>Helped write stable Python API tests.</w:t></w:r></w:p>'}),doc=inspectDocument(bytes)
 const p=patchFor(doc,'Helped write stable Python API tests.','Wrote stable Python API tests.')
 assert.equal(inspectDocument(applyPatches(bytes,[p]).bytes).units.find(u=>u.id===p.id).text,p.after)
})

test('split contacts and hyperlinks are locked and masked without changing the Word original',()=>{
 const extra='<w:p><w:r><w:t>split</w:t></w:r><w:r><w:t>@</w:t></w:r><w:r><w:t>example.com</w:t></w:r></w:p><w:p><w:hyperlink w:anchor="portfolio"><w:r><w:t>https://example.com/private-profile</w:t></w:r></w:hyperlink></w:p>'
 const bytes=fixture({extra}),doc=inspectDocument(bytes),masked=JSON.stringify(modelDocument(doc))
 for(const unit of doc.units.filter(u=>u.context.includes('split@example.com')||u.context.includes('private-profile')))assert.equal(unit.editable,false)
 assert.ok(!masked.includes('split@example.com'));assert.ok(!masked.includes('private-profile'));assert.ok(strFromU8(unzipSync(bytes)['word/document.xml']).includes('example.com'))
})
test('blank target lists and invalid resume metadata reject before side effects',()=>{
 for(const target of [';；','\n;\n','  ;  '])assert.throws(()=>parseTargets(target),/岗位|方向/)
 assert.throws(()=>create({resume:{data:encodeBase64(fixture())},targets:'Developer'}),/简历/)
})
test('central-directory tampering, truncated data and CRC corruption reject',()=>{
 const original=fixture(),bytes=Uint8Array.from(original),view=new DataView(bytes.buffer);let first=0
 while(view.getUint32(first,true)!==0x02014b50)first++
 view.setUint32(first+16,view.getUint32(first+16,true)^1,true)
 assert.throws(()=>inspectDocument(bytes),/校验|一致/)
 assert.throws(()=>inspectDocument(original.subarray(0,original.length-2)),/docx/)
 const stored=zipSync(unzipSync(original),{level:0}),bad=Uint8Array.from(stored),v=new DataView(bad.buffer);let pos=0
 while(v.getUint32(pos,true)!==0x04034b50)pos++
 const start=pos+30+v.getUint16(pos+26,true)+v.getUint16(pos+28,true);bad[start+10]^=1
 assert.throws(()=>inspectDocument(bad),/完整性/)
})
test('unaccepted header revisions fail even when body is otherwise editable',()=>{
 const files=unzipSync(fixture());files['word/header1.xml']=strToU8(strFromU8(files['word/header1.xml']).replace('<w:p>','<w:p><w:ins w:id="9"><w:r><w:t>Pending edit</w:t></w:r></w:ins>'))
 assert.throws(()=>inspectDocument(zipSync(files)),/修订/)
})

test('initial workflow transformation is deterministic and does not consult runtime time',()=>{
 const input={resume:{name:'resume.docx',data:encodeBase64(fixture())},targets:'Backend Engineer'},now=Date.now
 try{Date.now=()=>{throw Error('Runtime clock must be used only in run')};assert.deepEqual(create(input),create(input))}finally{Date.now=now}
})
