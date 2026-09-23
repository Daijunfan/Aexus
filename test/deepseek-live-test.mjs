// Opt-in: two short real DeepSeek requests through the user's configured provider.
import fs from'node:fs';import os from'node:os';import path from'node:path';import assert from'node:assert/strict';import{createRequire}from'node:module';import{build}from'esbuild';import{query}from'@anthropic-ai/claude-agent-sdk';
if(process.env.AGENTS_COMPANY_DEEPSEEK_LIVE!=='1')throw Error('Set AGENTS_COMPANY_DEEPSEEK_LIVE=1');
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ac-ds-live-')),config=temp+'/claude';fs.mkdirSync(config);const source=JSON.parse(fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR||os.homedir()+'/.claude','settings.json')));fs.writeFileSync(config+'/settings.json',JSON.stringify({env:source.env}),{mode:0o600});
Object.assign(process.env,{CLAUDE_CONFIG_DIR:config,AGENTS_COMPANY_HOME:temp+'/state',CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:'1'});const sdk=require.resolve('@anthropic-ai/claude-agent-sdk'),bundle=temp+'/options.cjs';await build({stdin:{contents:"export {buildOptions} from './src/main/sessions'",resolveDir:root,loader:'ts'},bundle:true,alias:{'@anthropic-ai/claude-agent-sdk':sdk},external:[sdk],platform:'node',format:'cjs',outfile:bundle,logLevel:'silent'});const {buildOptions}=require(bundle),report=[];
try{
 for(const model of ['deepseek-flash','deepseek-v4-pro']){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);const options={...buildOptions({cwd:temp,model,thinking:false,effort:'low'}),tools:[],mcpServers:{},strictMcpConfig:true,settingSources:[],env:{...source.env,...process.env},systemPrompt:'Answer briefly.',abortController:controller,maxTurns:1};
  const q=query({prompt:'Reply only OK.',options});let resolved,reply='',error;
  try{for await(const m of q){if(m.type==='assistant'){resolved=m.message.model;reply+=m.message.content.filter(c=>c.type==='text').map(c=>c.text).join('')}if(m.type==='result'&&m.subtype!=='success')error=m.subtype}}finally{clearTimeout(timer);q.close()}
  assert.ok(!error,error);assert.match(reply,/OK/);assert.ok(resolved?.startsWith(model)||model==='deepseek-flash'&&resolved?.includes('flash'),String(resolved));report.push({requested:model,responseModel:resolved,reply,thinkingRequested:false,effort:'low'});console.log(JSON.stringify(report.at(-1)));
 }
 fs.mkdirSync(root+'/artifacts/model-catalog',{recursive:true});fs.writeFileSync(root+'/artifacts/model-catalog/live.json',JSON.stringify(report,null,2));
}finally{fs.rmSync(temp,{recursive:true,force:true})}
