// Opt-in VS Code Extension Host acceptance. Run with --extensionTestsPath.
// Uses the installed original Cline extension and canonical user configuration.
// Creates only a no-tools QA conversation in the selected test workspace.
const vscode=require('vscode'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
exports.run=async()=>{const work=vscode.workspace.workspaceFolders[0].uri.fsPath,receipt=path.join(work,'cline-extension-result.json'),marker='CLINE_VSCODE_SHARED_'+crypto.randomUUID().slice(0,8),data=path.join(os.homedir(),'.cline/data'),provider=path.join(data,'settings/providers.json'),hash=()=>crypto.createHash('sha256').update(fs.readFileSync(provider)).digest('hex'),before=hash();const result={marker,startedAt:new Date().toISOString(),workspace:work,passed:false};const save=()=>fs.writeFileSync(receipt,JSON.stringify(result,null,2));save();try{const ext=vscode.extensions.getExtension('saoudrizwan.claude-dev');if(!ext)throw Error('Cline extension not installed');const api=await ext.activate();result.extensionVersion=ext.packageJSON.version;result.api=Object.keys(api);save();await api.startNewTask('Reply exactly '+marker+'. Do not use tools or change files.');result.submitted=true;save();const query=String.raw`import sqlite3,json,sys,os
c=sqlite3.connect('file:'+os.path.expanduser('~/.cline/data/db/sessions.db')+'?mode=ro',uri=True);c.row_factory=sqlite3.Row
rows=[dict(x) for x in c.execute('select session_id,source,provider,model,status,messages_path,transcript_path from sessions where cwd=? order by started_at desc limit 3',(sys.argv[1],))]
for r in rows:
 for k in ['messages_path','transcript_path']:
  p=r.get(k)
  if p and os.path.isfile(p):
   s=json.load(open(p,encoding='utf-8'));r[k+'AssistantVerified']=any(m.get('role')=='assistant' and any(c.get('type')=='text' and c.get('text','').strip()==sys.argv[2] for c in m.get('content',[])) for m in s.get('messages',[]))
print(json.dumps(rows))`;
for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,1000));const rows=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',query,work,marker],{encoding:'utf8'}));result.sessions=rows;result.providerUnchanged=hash()===before;save();if(rows.some(r=>r.provider==='deepseek'&&r.model==='deepseek-flash'&&r.messages_pathAssistantVerified&&['completed','idle'].includes(r.status))){result.passed=true;save();return}}
throw Error('No completed native extension response with shared provider');}catch(e){result.error=e.message;save();throw e}};
