// Reuse the installed-app native TUI fixture against a frozen candidate and disposable profile.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=process.env.QA_DEEPSEEK_OUT||path.join(root,'artifacts/full-acceptance-20261015/deepseek'),backend=process.env.CLOUD_HOSTS_TEST_BACKEND||path.join(root,'artifacts/Aexus.app/Contents/Resources/backend');
fs.mkdirSync(out,{recursive:true});
if(process.argv.includes('--fixture')){
 let source=fs.readFileSync(path.join(__dirname,'agent-board-host-live.cjs'),'utf8')
  .replace("const installed='/Applications/Aexus.app/Contents/Resources/backend'",'const installed='+JSON.stringify(backend))
  .replace("path.resolve(__dirname,'../artifacts/agent-board-acceptance',run)",JSON.stringify(out))
  .replace("path.join(os.homedir(),'.pi/agent/sessions')","path.join(process.env.PI_CODING_AGENT_DIR,'sessions')")
  // Pi can render restored history before its input handler finishes startup.
  .replace("async function input(text,record){","async function input(text,record){\n await delay(2000);");
 process.argv=[process.execPath,__filename,'local','native','pi'];
 const fixture=new Module(path.join(__dirname,'agent-board-host-live.cjs'),module);fixture.filename=path.join(__dirname,'agent-board-host-live.cjs');fixture.paths=module.paths;fixture._compile(source,fixture.filename);
}else{
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'qa-deepseek-native-'))),profile=path.join(temp,'pi'),native=path.join(os.homedir(),'.pi/agent');fs.mkdirSync(profile);
 const files=['settings.json','auth.json','models.json'],hash=()=>Object.fromEntries(files.map(n=>[n,createHash('sha256').update(fs.readFileSync(path.join(native,n))).digest('hex')])),before=hash();
 const settings=JSON.parse(fs.readFileSync(path.join(native,'settings.json'))),auth=JSON.parse(fs.readFileSync(path.join(native,'auth.json')));
 if(settings.defaultProvider!=='deepseek'||!auth.deepseek?.key)throw Error('Native direct DeepSeek profile required');
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(settings),{mode:0o600});fs.writeFileSync(path.join(profile,'auth.json'),JSON.stringify({deepseek:auth.deepseek}),{mode:0o600});
 const env={...process.env,CLOUD_HOSTS_HOME:path.join(temp,'core'),PI_CODING_AGENT_DIR:profile,AGENTS_COMPANY_PROJECTS:path.join(temp,'projects'),AGENTS_COMPANY_WORKSPACES:path.join(temp,'workspaces')};
 const release=JSON.parse(fs.readFileSync(path.join(backend,'release.json'))),provenance={backend,version:release.version,buildId:release.buildId,provider:settings.defaultProvider,model:settings.defaultModel,thinking:settings.defaultThinkingLevel,profileBefore:before,finalCandidate:!!process.env.QA_FINAL_BUILD_ID,startedAt:new Date().toISOString(),temp};
 if(process.env.QA_FINAL_BUILD_ID&&release.buildId!==process.env.QA_FINAL_BUILD_ID)throw Error('Candidate identity changed before native run');
 fs.writeFileSync(path.join(out,'native-provenance.json'),JSON.stringify(provenance,null,2));
 fs.writeFileSync(path.join(out,'local-native.json'),JSON.stringify({hostId:'local',host:'Mac',mode:'native',runId:'deepseek-bounded',work:path.join(temp,'work'),cases:[]},null,2));
 let backendProcess,fixtureProcess;const delay=ms=>new Promise(r=>setTimeout(r,ms));
 (async()=>{try{
  backendProcess=spawn(process.execPath,[backend+'/cli.cjs','serve'],{env,stdio:['ignore','ignore','pipe']});let error='';backendProcess.stderr.on('data',d=>error=(error+d).slice(-4000));
  for(let i=0;i<200&&!fs.existsSync(path.join(env.CLOUD_HOSTS_HOME,'server.json'));i++)await delay(100);
  if(!fs.existsSync(path.join(env.CLOUD_HOSTS_HOME,'server.json')))throw Error('Candidate backend did not start: '+error);
  fixtureProcess=spawn(process.execPath,[__filename,'--fixture'],{env,stdio:'inherit'});const deadline=setTimeout(()=>fixtureProcess.kill('SIGTERM'),420000);
  const code=await new Promise(resolve=>fixtureProcess.once('exit',resolve));clearTimeout(deadline);process.exitCode=code??1;
  const ledger=JSON.parse(fs.readFileSync(path.join(out,'local-native.json')));for(const record of ledger.cases){if(record.nativeTranscript&&fs.existsSync(record.nativeTranscript))fs.copyFileSync(record.nativeTranscript,path.join(out,'native-transcript.jsonl'))}
  if(fs.existsSync(path.join(temp,'work/pi-proof.txt')))fs.copyFileSync(path.join(temp,'work/pi-proof.txt'),path.join(out,'pi-proof.txt'));
 }catch(e){provenance.error=e.message;process.exitCode=1}finally{
  fixtureProcess?.kill('SIGTERM');backendProcess?.kill('SIGTERM');await delay(1200);if(backendProcess?.exitCode===null&&backendProcess?.signalCode===null)backendProcess.kill('SIGKILL');
  provenance.profileAfter=hash();provenance.nativeConfigUnchanged=JSON.stringify(before)===JSON.stringify(provenance.profileAfter);provenance.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'native-provenance.json'),JSON.stringify(provenance,null,2));fs.rmSync(temp,{recursive:true,force:true});
 }})();
}
