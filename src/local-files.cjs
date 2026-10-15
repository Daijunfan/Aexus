// Real local Core host file workspace, using the same bounded Python directory
// operations as SSH workspaces. No extra shell prompts or local SSH dependency.
const path=require('node:path');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const runtime=path.resolve(__dirname,'../Runtime');
const script=`import json,sys\nsys.path.insert(0,${JSON.stringify(runtime)})\nfrom workspace_files import workspace_files\np=json.load(sys.stdin)\nprint(json.dumps(workspace_files(p['directory'],p['operation'],p['args'])))\n`;
function files(operation,arguments_,directory=os.homedir()) {
 if(operation!=='workspace')throw Error('Use the workspace file API on the local host');
 if(typeof directory!=='string'||!(path.isAbsolute(directory)||process.platform==='win32'&&path.win32.isAbsolute(directory)))throw Error('Local workspace requires an absolute directory');
 const args=arguments_?.args||{},action=arguments_?.operation;
 if(typeof action!=='string')throw Error('Missing local workspace operation');
 return new Promise((resolve,reject)=>{
  const python=process.env.CLOUD_HOSTS_PYTHON||(process.platform==='win32'?'python':'python3');
  const child=spawn(python,['-B','-c',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',errors='';
  const timer=setTimeout(()=>child.kill(),40000);
  child.stdout.on('data',data=>{output=(output+data).slice(-32*1024*1024);});
  child.stderr.on('data',data=>{errors=(errors+data).slice(-2048);});
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('close',code=>{clearTimeout(timer);if(code)reject(Error(errors.trim()||'Local file operation failed'));else {try{resolve(JSON.parse(output))}catch(error){reject(error)}}});
  child.stdin.end(JSON.stringify({directory,operation:action,args}));
 });
}
module.exports={files};
