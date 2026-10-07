import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {create,respond,parseJSON,validatePlan,validateReport} from '../../../Engine/deep-research/model.mjs'
import {publicURL,publicAddress,pageText,verifySource} from '../../../Engine/deep-research/sources.mjs'
import {renderReport} from '../../../Engine/deep-research/report.mjs'
import {deliveryZip} from '../../../Engine/deep-research/delivery.mjs'
import {documents,material,reply} from './fixtures/deep-research-answer.mjs'
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'.aexus/artifacts/deep-research/unit');fs.mkdirSync(out,{recursive:true});const checks=[]
const pass=text=>{checks.push(text);console.log('PASS '+text)}
assert.throws(()=>create({topic:''}));assert.throws(()=>create({topic:'test',engines:[{engine:'codex'},{engine:'codex'}]}))
let state=create({topic:'调研一个明确问题',engines:[{engine:'codex'},{engine:'claude'}]});assert.equal(state.questions.length,3);assert.equal(respond(state,{values:{},note:'保持证据范围'}).phase,'plan')
assert.throws(()=>parseJSON('{"taskId":"old"}','new'));assert.deepEqual(parseJSON('```json\n{"taskId":"new"}\n```','new'),{taskId:'new'})
assert.throws(()=>validatePlan({plan:{title:'empty'}}))
pass('Input, distinct-engine constraints, clarification transitions and exact task/result binding reject malformed or stale responses')
for(const host of ['127.0.0.1','127.1','0x7f000001','10.0.0.1','169.254.169.254','192.168.1.1','[::1]','[::ffff:127.0.0.1]','[fc00::1]'])assert.throws(()=>publicURL('http://'+host+'/'),host)
for(const value of ['file:///tmp/test','ftp://example.org/a','https://user:pass@example.org/a','https://localhost/a','https://host.local/a','https://example.org:444/a'])assert.throws(()=>publicURL(value),value)
assert.equal(publicAddress('93.184.216.34'),true);assert.equal(publicAddress('127.0.0.1'),false)
assert.equal(publicURL('https://example.org/a?utm_source=x&v=1#fragment'),'https://example.org/a?v=1')
assert.equal(pageText('<style>wrong</style><script>ignore()</script><p>A &amp; B&nbsp; &#x4e2d;</p>'),'A & B 中')
const read=async url=>({url,body:material(url),bytes:Buffer.byteLength(material(url))})
const verified=await Promise.all(documents.map(d=>verifySource(d,{read})))
assert.equal(verified.length,6);assert.equal(verified[0].verification,'excerpt-found');assert.equal(verified[0].sha256,createHash('sha256').update(material(documents[0].url)).digest('hex'))
await assert.rejects(verifySource({...documents[0],quote:'This statement does not actually exist in the retrieved source.'},{read}),/未找到/)
await assert.rejects(verifySource({...documents[0],quote:'tiny'},{read}),/过短/)
pass('Public URL/address guards reject private/local and encoded endpoints; short excerpts must match retrieved visible text and retain a real page hash')
const sources=verified.map((s,i)=>({...s,id:'S'+(i+1)})),payload={sources}
const task='[AEXUS_DEEP_RESEARCH_TASK]\n\n'+JSON.stringify({taskId:'test',kind:'report',payload})
const report=reply(task,'claude').report;validateReport(report,sources)
const invalid=structuredClone(report);invalid.executiveSummary[0].sourceIds=['S999'];assert.throws(()=>validateReport(invalid,sources),/未通过核验/)
const uncited=structuredClone(report);uncited.sections[0].paragraphs[0].sourceIds=[];assert.throws(()=>validateReport(uncited,sources))
const malicious=structuredClone(report);malicious.title='<img src=x onerror=alert(1)>';malicious.sections[0].title='</script><script>alert(1)</script>';malicious.sections[0].paragraphs[0].text='<script>alert("injection")</script> '+malicious.sections[0].paragraphs[0].text
state={...state,language:'zh-CN',report:malicious,plan:{objective:'可核对的合成验收'},sources,workers:[{engine:'codex'},{engine:'claude'}],finishedAt:new Date().toISOString(),review:{issues:[],disagreements:[]}}
const files=renderReport(state);assert.equal(files.length,3);const html=files[0].content
assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('<script>alert('));assert.ok(html.includes('不表示结论正确率或概率'))
assert.ok(html.includes('source-filter'));assert.ok(html.includes('page fingerprint')||html.includes('页面指纹'))
assert.ok(!html.includes('src="https://'));assert.equal((html.match(/<script>/g)??[]).length,1)
state.sources[0].title='=FORMULA()';const csv=renderReport(state).find(f=>f.name==='evidence.csv').content;assert.ok(csv.includes('"\'=FORMULA()"'))
fs.writeFileSync(path.join(out,'final-delivery.zip'),deliveryZip(files));fs.writeFileSync(path.join(out,'names.json'),JSON.stringify(files.map(f=>f.name)))
pass('Final report rejects invented/uncited evidence, escapes model-supplied HTML, separates counts from probabilities and prevents CSV formula execution; ZIP contains only the three finals')
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,checks,syntheticOnly:true},null,2))
