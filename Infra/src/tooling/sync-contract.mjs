import fs from 'node:fs'
import path from 'node:path'
import {CONTRACT_VERSION} from '../../../Contract/protocol.ts'
import {exportsToEngine,capabilityDomain} from '../../../Contract/policy.ts'
import {COMMANDS} from '../shared/api-registry.ts'
import {apiReadOnly} from '../shared/api-effects.ts'
const root=path.resolve(import.meta.dirname,'../../..'),check=process.argv.includes('--check')
const conditional=new Set(['assets.naming','conversation.file','conversation.download-status','conversation.transfer','channel.settings'])
const commands=COMMANDS.filter(c=>exportsToEngine(c.name,c.replacement)).map(c=>({name:c.name,summary:c.summary,permission:c.permission,inputSchema:c.inputSchema??{type:'object',additionalProperties:true,description:'Legacy Core request. Consult the command documentation before supplying fields.'},schemaSource:c.inputSchema?'registry':'legacy-documentation',readOnly:!conditional.has(c.name)&&apiReadOnly(c.name),effect:conditional.has(c.name)?'conditional':apiReadOnly(c.name)?'read':'write',domain:capabilityDomain(c.name),transport:c.name==='session.follow'?'stream':'request',documentation:'Infra/src/docs/API.md'}))
const value={contractVersion:CONTRACT_VERSION,commands},file=path.join(root,'Contract/commands.v1.json'),content=JSON.stringify(value,null,2)+'\n'
if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw Error('Contract v1 catalog differs from canonical Infra definitions; run contract:sync and review the diff')}else fs.writeFileSync(file,content)
console.log((check?'Verified':'Generated')+' Contract '+CONTRACT_VERSION+': '+commands.length+' capabilities; '+commands.filter(c=>c.schemaSource==='registry').length+' registry schemas')
