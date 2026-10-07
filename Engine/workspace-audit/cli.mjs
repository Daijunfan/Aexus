#!/usr/bin/env node
import fs from 'node:fs'
import {createNodeClient} from '../../Contract/node-client.mjs'
import {runAudit} from './workflow.mjs'
try{
 const args=process.argv.slice(2),at=args.indexOf('--input'),output=args.indexOf('--output')
 if(at<0||!args[at+1])throw Error('Usage: node Engine/workspace-audit/cli.mjs --input JSON|@file [--output report.json]')
 const text=args[at+1],input=JSON.parse(text.startsWith('@')?fs.readFileSync(text.slice(1),'utf8'):text)
 const report=await runAudit(createNodeClient(),input)
 if(output>=0){if(!args[output+1])throw Error('--output requires a filename');fs.writeFileSync(args[output+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'})}
 console.log(JSON.stringify({ok:true,data:report},null,2))
}catch(error){console.log(JSON.stringify({ok:false,error:error.message,code:error.code??'ENGINE_ERROR'}));process.exitCode=1}
