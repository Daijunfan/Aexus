"use strict";
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const S=require('./safety.cjs');
const methods=new Set(['speech.voices','speech.render','dictionary.lookup']);
function createLocalReading(store){
 const native=require('./native-process.cjs').createNativeProcess();let cache;
 const platform=()=>S.assert(process.platform==='darwin','UNSUPPORTED_PLATFORM','This native adapter requires macOS; no remote speech or dictionary service is used.');
 async function voices(){
  if(process.platform!=='darwin')return {available:false,voices:[],engine:null};
  if(!cache){const {stdout}=await native.run('/usr/bin/say',['-v','?'],{maxOutput:512*1024,timeout:10000});
   cache=stdout.split('\n').flatMap(line=>{const match=/^(.+?)\s+([a-z]{2,3}_[A-Z]{2})\s+#\s*(.*)$/.exec(line);return match?[{id:match[1].trim(),language:match[2].replace('_','-'),sample:match[3]}]:[];});}
  return {available:cache.length>0,engine:'macOS installed speech voices',voices:cache};
 }
 async function speech(p){
  platform();S.assert(typeof p.text==='string'&&p.text.trim()&&p.text.length<=6000,'INVALID_PARAMS','Speech requires 1–6000 text characters.');
  const available=await voices(),voice=p.voice||available.voices.find(v=>v.language==='en-US')?.id||available.voices[0]?.id;
  S.assert(available.voices.some(v=>v.id===voice),'VOICE_UNAVAILABLE','Choose an installed voice from speech.voices.');
  const rate=p.rate??180;S.assert(Number.isFinite(rate)&&rate>=80&&rate<=400,'INVALID_PARAMS','Speech rate must be 80–400 words per minute.');
  await store.mkdir('cache');const id=randomUUID(),input=await store.meta(`cache/speech-${id}.txt`),output=await store.meta(`cache/speech-${id}.wav`);
  try{
   // Embedded speech-control sequences are treated as ordinary source text.
   await fs.writeFile(input,p.text.replaceAll('[[','[ ['),{flag:'wx',mode:0o600});
   await native.run('/usr/bin/say',['-v',voice,'-r',String(Math.round(rate)),'--file-format=WAVE','--data-format=LEI16@22050','-o',output,'-f',input],{timeout:45000});
   const bytes=await S.readBounded(output,16*1024*1024);
   S.assert(bytes.length>44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE','NATIVE_FAILED','Speech did not produce a valid WAV file.');
   return {mimeType:'audio/wav',voice,rate,bytes:bytes.length,sha256:S.digest(bytes),contentBase64:bytes.toString('base64'),local:true};
  }finally{await Promise.all([fs.rm(input,{force:true}),fs.rm(output,{force:true})]);}
 }
 async function lookup(p){platform();S.assert(typeof p.term==='string'&&p.term.trim()&&p.term.length<=256&&!p.term.includes('\0'),'INVALID_PARAMS','Use 1–256 characters for a dictionary lookup.');
  const {stdout}=await native.run('/usr/bin/python3',[path.join(__dirname,'local-dictionary.py')],{input:JSON.stringify({term:p.term.trim()}),timeout:10000});
  let result;try{result=JSON.parse(stdout);}catch{S.fail('NATIVE_FAILED','Dictionary Services returned an invalid response.');}
  S.assert(typeof result.definition==='string'&&typeof result.found==='boolean','NATIVE_FAILED','Invalid dictionary result.');return result;
 }
 return {request:(method,p)=>method==='speech.voices'?voices():method==='speech.render'?speech(p):lookup(p),speech,close:()=>native.close()};
}
module.exports={createLocalReading,methods};
