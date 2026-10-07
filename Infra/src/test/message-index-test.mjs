// Public-only derived search storage; all files and SQLite connections are disposable.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
const root=path.resolve(import.meta.dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-message-index-'))
process.env.AGENTS_COMPANY_HOME=temp
const bundle=path.join(temp,'index.cjs');await build({entryPoints:[root+'/Infra/src/main/message-index.ts'],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent'})
const api=createRequire(import.meta.url)(bundle),checks=[]
const row=(conversation,id,text,createdAt=7)=>({conversation,id,text,createdAt,author:'Original',authorIdentity:{kind:'agent',employeeId:'reader'},role:'assistant',images:[]})
const a=[row('employee:a','m_1','甲乙测试 café STRASSE 100%_literal'),row('employee:a','m-2','First\nsecond "quoted" \\path'),row('employee:a','m10','Emoji 😀🌕☀ and z\0null'),{...row('employee:a','m2','Attachment',0),images:['image.png'],files:[{path:'sound.wav',name:'Voice clip.wav',mimeType:'audio/wav',kind:'file',bytes:3}],authorIdentity:{kind:'operator'}}]
const b=[row('group:b','m1','甲乙测试 CAFÉ https://example.test',7),row('group:b','m2','Private query _%',9)]
let loads=0,version='v1',prefs={}
const sources=()=>[{id:'employee:a',version,read:()=>{loads++;return a}},{id:'group:b',version:'v1',read:()=>{loads++;return b}}]
const sort=(x,y)=>(y.createdAt??0)-(x.createdAt??0)||x.conversation.localeCompare(y.conversation)||x.id.localeCompare(y.id)
const expected=(query,filter='all',author='all')=>[...a,...b].filter(row=>!prefs[row.conversation+'/'+row.id]?.hidden&&(!query||[row.text,...(row.files??[]).map(file=>file.name)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))&&(author==='all'||row.authorIdentity?.kind===(author==='you'?'operator':'agent'))&&(filter==='all'||filter==='saved'&&prefs[row.conversation+'/'+row.id]?.saved||filter==='pinned'&&prefs[row.conversation+'/'+row.id]?.pinned||filter==='media'&&(row.images.length||row.files?.some(f=>f.mimeType.startsWith('video/')))||filter==='audio'&&row.files?.some(f=>f.mimeType.startsWith('audio/'))||filter==='files'&&row.files?.length||filter==='links'&&/https?:\/\/\S+/i.test(row.text))).sort(sort)
const query=(text='',filter='all',author='all',offset=0,limit=2)=>api.searchMessageIndex({query:text.trim().toLocaleLowerCase(),filter,author,offset,limit})
try{
 api.syncMessageIndex(sources(),prefs)
 for(const term of ['', '甲', '甲乙', '测试', 'café','STRASSE','100%_', '"quoted"', 'first\nsecond','\\path','😀🌕☀','z\0null','voice clip','missing'])for(const filter of ['all','media','audio','files','links'])for(const author of ['all','you','employee']){
  const wanted=expected(term,filter,author);for(const offset of [0,1,8]){const result=query(term,filter,author,offset);assert.equal(result.total,wanted.length);assert.deepEqual(result.rows,wanted.slice(offset,offset+2))}
 }
 checks.push('Literal Unicode substring semantics, special characters, file names, filters and exact timestamp/locale ordering match the legacy projection')
 prefs={'employee:a/m_1':{saved:true},'group:b/m1':{hidden:true},'employee:a/m-2':{pinned:true}};api.syncMessageIndex(sources(),prefs);assert.equal(loads,2)
 for(const filter of ['all','saved','pinned'])assert.deepEqual(query('',filter,'all',0,100).rows,expected('',filter))
 const returned=query('attachment','all','all',0,1).rows[0];returned.images.push('forged');returned.authorIdentity.kind='agent';assert.equal(query('attachment','all','all',0,1).rows[0].images.length,1)
 api.closeMessageIndex();api.syncMessageIndex(sources(),prefs);assert.equal(loads,2,'restart reuses persisted source revisions')
 api.syncMessageIndex([sources()[0]],prefs);assert.ok(query('','all','all',0,100).rows.every(row=>row.conversation==='employee:a'))
 checks.push('Warm preference changes, scope restriction, independent returned objects and process restart preserve correctness without reloading source bodies')
 a[0]={...a[0],text:'Updated document'};version='v2';api.syncMessageIndex(sources(),prefs);assert.equal(query('updated').total,1);assert.equal(query('strasse').total,0)
 a.splice(1,1);version='v3';api.syncMessageIndex(sources(),prefs);assert.equal(query('quoted').total,0)
 assert.throws(()=>api.syncMessageIndex([{id:'employee:a',version:'broken',read:()=>{throw Error('source corrupt')}}],prefs),/source corrupt/)
 api.removeIndexedConversation('employee:a');api.syncMessageIndex(sources(),prefs);assert.equal(query('updated').total,1)
 checks.push('Edits, removals and recreation update FTS and metadata atomically; failed source reads never advance its indexed version')
 api.closeMessageIndex();fs.writeFileSync(path.join(temp,'cache/message-index.sqlite'),'corrupt derived index');api.syncMessageIndex(sources(),prefs);assert.equal(query('updated').total,1)
 api.closeMessageIndex();fs.rmSync(path.join(temp,'cache/message-index.sqlite'));const outside=path.join(temp,'private-file');fs.writeFileSync(outside,'keep');fs.symlinkSync(outside,path.join(temp,'cache/message-index.sqlite'));assert.throws(()=>api.syncMessageIndex(sources(),prefs),/symlink/);assert.equal(fs.readFileSync(outside,'utf8'),'keep')
 checks.push('Only disposable corrupt indexes rebuild; symlinks never redirect writes to other files')
 const out=path.join(root,'.aexus/artifacts/slimming-final');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'message-index.json'),JSON.stringify({passed:true,checks},null,2));console.log('PASS '+checks.join('; '))
}finally{api.closeMessageIndex();fs.rmSync(temp,{recursive:true,force:true})}
