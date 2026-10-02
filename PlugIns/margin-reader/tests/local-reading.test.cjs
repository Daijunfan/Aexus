"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {setup}=require('./fixtures.cjs');
test('local speech enumerates installed voices, writes a valid WAV and leaves no source or cache residue',async t=>{
 const f=await setup(t),voices=await f.api('speech.voices');
 if(process.platform!=='darwin'){assert.equal(voices.available,false);await f.error('speech.render',{text:'Local sample'},'UNSUPPORTED_PLATFORM');return;}
 assert(voices.available&&voices.voices.length>0);const voice=voices.voices.find(v=>v.language==='en-US').id;
 await f.api('settings.set',{theme:'light'});
 const state=await fs.readFile(path.join(f.workspace,'.margin-reader/state.json'));
 const output=await f.api('speech.render',{text:'Local reading sample.',voice,rate:200});
 const bytes=Buffer.from(output.contentBase64,'base64');assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert(bytes.length>1000);
 assert.equal(output.sha256,require('../lib/safety.cjs').digest(bytes));assert.equal(output.local,true);
 assert.deepEqual(await fs.readFile(path.join(f.workspace,'.margin-reader/state.json')),state);
 assert(!(await fs.readdir(path.join(f.workspace,'.margin-reader/cache'))).some(name=>name.startsWith('speech-')));
 await f.error('speech.render',{text:'',voice},'INVALID_PARAMS');await f.error('speech.render',{text:'bad voice',voice:'--output=/outside'},'VOICE_UNAVAILABLE');
});
test('speech comments use normal immutable media storage and remain undoable without playing through a speaker',async t=>{
 const f=await setup(t);if(process.platform!=='darwin')return;
 let s=await f.api('study.create',{title:'Read-aloud'});s=await f.api('study.note.create',{setId:s.id,expectedRevision:s.revision,title:'Question',text:'A short recorded answer.'});const cardId=s.cards[0].id;
 s=await f.api('study.speech.attach',{setId:s.id,expectedRevision:s.revision,cardId,field:'text',rate:210});
 const comment=s.cards[0].comments[0];assert(comment.media.kind==='audio');const media=await f.api('study.media.get',{setId:s.id,mediaId:comment.mediaId});assert(Buffer.from(media.contentBase64,'base64').length>1000);
 s=await f.api('study.undo',{setId:s.id,expectedRevision:s.revision});assert.equal(s.cards[0].comments.length,0);
});
test('dictionary lookup returns a public local plain-text response and rejects empty or excessive input',async t=>{
 const f=await setup(t);
 if(process.platform!=='darwin'){await f.error('dictionary.lookup',{term:'knowledge'},'UNSUPPORTED_PLATFORM');return;}
 const result=await f.api('dictionary.lookup',{term:'knowledge'});assert.equal(result.term,'knowledge');assert.equal(typeof result.found,'boolean');assert.equal(typeof result.definition,'string');assert.match(result.source,/Dictionary Services/);
 await f.error('dictionary.lookup',{term:''},'INVALID_PARAMS');await f.error('dictionary.lookup',{term:'x'.repeat(257)},'INVALID_PARAMS');
 console.log('Local dictionary returned a definition:',result.found);
});
