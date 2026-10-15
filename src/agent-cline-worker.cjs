const {NativeExecutor}=require('./native-executor.cjs'),{source}=require('./agent-cli.cjs');
// Original installed Cline executors, without a model or provider session.
class ClineWorker extends NativeExecutor{
 constructor(id,cwd){super(id,cwd,source('cline_exec.mjs'))}
}
module.exports={ClineWorker};
