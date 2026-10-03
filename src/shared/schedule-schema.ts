import {booleanSchema,nonemptySchema,objectSchema} from './api-schema.ts'
// Machine-readable inputs shared by Core discovery and API documentation.
const string=nonemptySchema,zone={...string,description:'IANA time zone, for example Asia/Shanghai; never a floating browser local time'}
const clock={type:'string',pattern:'^([01][0-9]|2[0-3]):[0-5][0-9]$'}
export const SCHEDULE_RULE_SCHEMA={oneOf:[
 objectSchema({kind:{const:'once'},at:{...string,description:'Absolute ISO 8601 instant with Z or numeric UTC offset'}},['kind','at']),
 objectSchema({kind:{const:'interval'},everySeconds:{type:'integer',minimum:1,maximum:31536000},anchor:{...string,description:'Absolute ISO instant; omitted means first occurrence one interval after acceptance'}},['kind','everySeconds']),
 objectSchema({kind:{const:'weekly'},time:clock,days:{type:'array',minItems:1,uniqueItems:true,items:{type:'integer',minimum:1,maximum:7},description:'1=Monday through 7=Sunday; all seven days means daily'},timezone:zone},['kind','time','days','timezone']),
 objectSchema({kind:{const:'monthly'},time:clock,day:{oneOf:[{type:'integer',minimum:1,maximum:31},{const:'last'}]},timezone:zone},['kind','time','day','timezone']),
 objectSchema({kind:{const:'event'},event:{enum:['signal','channel.posted']},channelId:{...string,description:'Required only for channel.posted; both the caller and target must have current channel access'},cooldownSeconds:{type:'integer',minimum:0,maximum:86400,default:60}},['kind','event'])
]}
export const SCHEDULE_SPEC_SCHEMA={type:'object',required:['name','action'],additionalProperties:false,properties:{
 name:{...string,maxLength:160},action:objectSchema({type:{const:'agent'},employeeId:{...string,description:'Stable employee ID; self resolves from authenticated Agent identity, not a display name'},engine:{enum:['codex','claude','cline','pi']},prompt:{...string,maxLength:64000},viewId:{...string,description:'Explicit company subview ID required for Governor targets'},channelId:{...string,description:'Employee-engine publishing channel; the target must remain a publisher'},model:string,effort:{enum:['low','medium','high','xhigh','max']},thinking:booleanSchema},['type','employeeId','prompt']),
 rule:SCHEDULE_RULE_SCHEMA,afterSeconds:{type:'integer',minimum:1,maximum:31536000,description:'One-time delay from Core acceptance; mutually exclusive with rule'},
 window:{type:['object','null'],required:['start','end','timezone'],additionalProperties:false,properties:{start:clock,end:clock,timezone:zone,days:{type:'array',minItems:1,items:{type:'integer',minimum:1,maximum:7}}}},
 until:{type:['string','null'],description:'Exclusive absolute end instant'},maxOccurrences:{type:['integer','null'],minimum:1,maximum:1000000,description:'Scheduled occurrences, including skips; manual runs do not consume this limit'},timeoutSeconds:{type:'integer',minimum:1,maximum:86400,default:1800},graceSeconds:{type:'integer',minimum:1,maximum:86400,default:60},enabled:{type:'boolean',default:true},source:string,
 plan:objectSchema({priority:{enum:['low','normal','high','urgent'],default:'normal'},tags:{type:'array',maxItems:20,uniqueItems:true,items:{type:'string',minLength:1,maxLength:40}},notes:{type:'string',maxLength:16000},durationMinutes:{type:'integer',minimum:1,maximum:43200,description:'Optional planned duration for timeline display; independent of timeout and actual run duration'}})
},oneOf:[{required:['rule'],not:{required:['afterSeconds']}},{required:['afterSeconds'],not:{required:['rule']}}]}
