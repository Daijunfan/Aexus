const fs=require('node:fs'),path=require('node:path');
const {NativeExecutor}=require('./native-executor.cjs');
function source(executable='claude'){
 return 'const executable='+JSON.stringify(executable)+';\nconst pluginSource='+
  JSON.stringify(fs.readFileSync(path.join(__dirname,'../Runtime/claude_executor_mod.mjs'),'utf8'))+';\n'+
  fs.readFileSync(path.join(__dirname,'../Runtime/claude_exec.mjs'),'utf8');
}
class ClaudeWorker extends NativeExecutor{
 constructor(id,cwd,executable){super(id,cwd,source(executable))}
}
module.exports={ClaudeWorker,source};
