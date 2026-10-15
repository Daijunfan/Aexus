// Native lifecycle hook. Emits no output or model context.
const fs=require('node:fs'),path=require('node:path');
const file=process.argv[2],event=JSON.parse(fs.readFileSync(0,'utf8'));
if(!/^[a-f0-9-]{36}$/i.test(event.session_id||''))process.exit(1);
let previous={};try{previous=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
const hasInput=event.hook_event_name!=='SessionStart'||event.source==='resume'||
  event.source!=='clear'&&previous.sessionId===event.session_id&&previous.hasInput===true;
const temporary=file+'.'+process.pid+'.tmp';
fs.mkdirSync(path.dirname(file),{recursive:true});
fs.writeFileSync(temporary,JSON.stringify({sessionId:event.session_id,hasInput,
  transcriptPath:event.transcript_path||(previous.sessionId===event.session_id?previous.transcriptPath:undefined)}),{mode:0o600});
fs.renameSync(temporary,file);
