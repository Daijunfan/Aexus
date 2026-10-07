import {objectSchema,nonemptySchema,textSchema} from './api-schema.ts'
export const CONTRACT_COMMANDS=[
 {name:'contract.info',args:'',summary:'Read the independent Engine/Infra protocol version and capability boundaries',gui:'Engine layer',cli:{},inputSchema:objectSchema({})},
 {name:'contract.describe',args:'[--version 1.0.0] [--command NAME] [--domain DOMAIN]',summary:'Discover versioned Engine-facing capabilities; does not grant caller permissions',gui:'Engine capability discovery',cli:{},inputSchema:objectSchema({version:textSchema,command:textSchema,domain:textSchema})},
 {name:'contract.call',args:'--version 1.0.0 --command NAME [--args JSON]',summary:'Invoke a declared Engine-facing capability as the unchanged authenticated caller',gui:'Engine workflow',cli:{required:['version','command']},inputSchema:objectSchema({version:nonemptySchema,command:nonemptySchema,args:{type:'object',additionalProperties:true}},['version','command'])},
 {name:'contract.engines',args:'',summary:'List installed source Engine manifests without executing them',gui:'Engine catalog',cli:{},inputSchema:objectSchema({})},
 {name:'view.layer',args:'engine|infra [--engine ID]',summary:'Select the application layer while retaining the Infra view and client-owned state',gui:'Engine / Infra',cli:{positionals:['layer'],aliases:{engineId:'engine'}},inputSchema:objectSchema({layer:{enum:['engine','infra']},engineId:{type:['string','null']}},['layer'])},
 {name:'infra.api',args:'[--domain company|messages|plan|files|runtime] [--command NAME]',summary:'Read employee collaboration and visualization APIs for Infra only, excluding plugin APIs',gui:'Infra API reference',cli:{},inputSchema:objectSchema({domain:textSchema,command:textSchema})}
]
