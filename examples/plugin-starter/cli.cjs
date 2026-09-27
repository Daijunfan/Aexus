#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const {createPlugin}=require('./runtime.cjs');
const args=process.argv.slice(2),flag=name=>args[args.indexOf(name)+1];
(async()=>{
  if(!args.includes('--workspace'))throw new Error('--workspace is required');
  const workspace=process.env.AGENTS_COMPANY_PLUGIN_RPC?path.resolve(flag('--workspace')):fs.realpathSync(flag('--workspace')),method=flag('api');
  const schema=JSON.parse(fs.readFileSync(path.join(__dirname,'schema.json'),'utf8'));
  if(!schema.commands.some(command=>command.method===method))throw new Error('Method is not declared in the CLI schema: '+method);
  const value=args.includes('--data')?flag('--data'):'{}';
  const params=JSON.parse(value.startsWith('@')?fs.readFileSync(value.slice(1),'utf8'):value);
  const response=await createPlugin({workspace}).request({jsonrpc:'2.0',id:1,method,params});
  process.stdout.write(JSON.stringify(response)+'\n');if(response.error)process.exitCode=1;
})().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1});
