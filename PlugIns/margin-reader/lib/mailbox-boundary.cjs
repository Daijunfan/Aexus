'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {assert,safePath,readBounded}=require('./safety.cjs');
// Two documented host layouts are supported. Neither permits an arbitrary
// external mailbox or a search for operator/global credentials.
async function mailboxBoundary(workspace,mailbox,env=process.env){
 const root=path.resolve(workspace),directory=path.resolve(mailbox);
 if(directory.startsWith(root+path.sep)){
  const relative=path.relative(root,directory).split(path.sep).join('/');
  await safePath(root,relative,{internal:true});
  return {layout:'workspace',checkedFile:name=>safePath(root,relative+'/'+name,{internal:true}),credentialFile:null};
 }
 const employee=env.AGENTS_COMPANY_EMPLOYEE,home=env.AGENTS_COMPANY_HOME;
 assert(typeof employee==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(employee)&&typeof home==='string'&&path.isAbsolute(home),'SCOPE_DENIED','An external mailbox requires the explicit host home and assigned employee identity.');
 const hostRoot=path.resolve(home),runtime=path.join(hostRoot,'agent-access',employee),expected=path.join(runtime,'ipc','margin-reader');
 assert(directory===expected,'SCOPE_DENIED','Mailbox does not match this employee’s host-issued runtime directory.');
 assert(typeof env.AGENTS_COMPANY_TOKEN_FILE==='string'&&path.isAbsolute(env.AGENTS_COMPANY_TOKEN_FILE)&&path.resolve(env.AGENTS_COMPANY_TOKEN_FILE)===path.join(runtime,'token'),'AUTH_REQUIRED','Centralized mailboxes require this employee’s explicit credential file.');
 const st=await fs.lstat(hostRoot);assert(st.isDirectory()&&!st.isSymbolicLink(),'SCOPE_DENIED','The assigned host home must be a real directory.');
 const rel=path.relative(hostRoot,directory).split(path.sep).join('/');await safePath(hostRoot,rel,{internal:true});
 const credentialFile=await safePath(hostRoot,`agent-access/${employee}/token`,{internal:true});
 // The credential is not discovered or copied. Its host-issued location binds
 // the transport layout; Core still authorizes every request and revocation.
 const credentialStat=await fs.lstat(credentialFile).catch(()=>null);
 assert(credentialStat?.isFile()&&!credentialStat.isSymbolicLink()&&credentialStat.nlink===1,'AUTH_REQUIRED','The assigned employee credential is unavailable.');
 const token=(await readBounded(credentialFile,4096)).toString('utf8').trim();assert(token,'AUTH_REQUIRED','The assigned employee credential is empty.');
 assert(!env.AGENTS_COMPANY_TOKEN||env.AGENTS_COMPANY_TOKEN.trim()===token,'AUTH_REQUIRED','Conflicting credentials cannot be substituted for the assigned employee token.');
 return {layout:'host-runtime',checkedFile:name=>safePath(hostRoot,rel+'/'+name,{internal:true}),credentialFile,token};
}
module.exports={mailboxBoundary};
