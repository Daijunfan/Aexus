const fs=require('node:fs/promises');
const path=require('node:path');
exports.createPlugin=({workspace})=>({
  async request({id,method,params={}}){
    try{
      let result;
      if(method==='notes.list')result=(await fs.readdir(workspace)).filter(name=>name.endsWith('.md'));
      else if(method==='notes.write'){
        if(!/^[\p{L}\p{N} _-]+\.md$/u.test(params.name||''))throw new Error('name must be a Markdown filename');
        const file=path.join(workspace,params.name);
        const existing=await fs.lstat(file).catch(e=>{if(e.code!=='ENOENT')throw e});
        if(existing?.isSymbolicLink())throw new Error('Cannot write through a symbolic link');
        await fs.writeFile(file,String(params.content||''));result={name:params.name};
      }else throw new Error('Unknown method: '+method);
      return {jsonrpc:'2.0',id,result};
    }catch(error){return {jsonrpc:'2.0',id,error:{code:-32000,message:error.message}}}
  }
});
