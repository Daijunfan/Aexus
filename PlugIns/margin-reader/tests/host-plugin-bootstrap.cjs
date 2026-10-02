'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
async function reference({cli,workspace,scope,home}){
 const bootstrap=await cli('workspace','docs',...scope);
 if(typeof bootstrap.documentation==='string'&&bootstrap.documentation===path.join(home,'api-docs')){
  const [guide,schema]=await Promise.all([cli('api','docs','plugin/margin-reader/api'),cli('api','docs','plugin/margin-reader/schema')]);
  assert.equal(guide.catalogRoot,bootstrap.documentation);assert.equal(schema.catalogRoot,bootstrap.documentation);
  assert(guide.path.startsWith(bootstrap.documentation+path.sep));
  return {guide:guide.markdown,schema:JSON.parse(schema.markdown),layout:'host-runtime',bootstrap};
 }
 const directory=path.join(workspace,'.agents-company/plugins/margin-reader');
 return {guide:await fs.readFile(path.join(directory,'API.md'),'utf8'),schema:JSON.parse(await fs.readFile(path.join(directory,'schema.json'),'utf8')),layout:'workspace',bootstrap};
}
async function launcherFor({workspace,credential,layout}){
 const file=layout==='host-runtime'?path.join(credential.folder,'bin','margin-reader'):path.join(workspace,'.agents-company/bin/margin-reader');
 const st=await fs.lstat(file);assert(st.isFile()&&!st.isSymbolicLink());
 const text=await fs.readFile(file,'utf8');assert(text.includes('AGENTS_WORKSPACE')&&text.includes('AGENTS_COMPANY_PLUGIN_RPC'));assert(text.includes(workspace));
 return file;
}
module.exports={reference,launcherFor};

async function verifyFixtureOnly(control,employees){
 const files=await fs.readdir(control);
 assert(!files.some(n=>/-(user|work)\.json$/.test(n)),'Plugin acceptance must not dispatch a user work/model turn.');
 const initial=files.filter(n=>n.endsWith('-initializing.json'));
 for(const file of initial){
  const id=file.slice(0,-'-initializing.json'.length);assert(employees.includes(id),'Only the explicitly created fixture employees may initialize.');
  const request=JSON.parse(await fs.readFile(path.join(control,file),'utf8'));assert(request.text.includes('[Agents Company private initialization]'));
  const receipt=JSON.parse(await fs.readFile(path.join(control,id+'-read.json'),'utf8'));assert.deepEqual(receipt.operations,['identity','index']);
 }
 return {syntheticInitializations:initial.length,syntheticWorkTurns:0,realModelCalls:0};
}
module.exports.verifyFixtureOnly=verifyFixtureOnly;
