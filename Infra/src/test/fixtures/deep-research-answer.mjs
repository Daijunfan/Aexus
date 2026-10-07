// Synthetic acceptance material only; never selected by production Engine code.
import fs from 'node:fs'
import path from 'node:path'
export const documents=[
 ['https://alpha.research.test/design','Fixture Atlas design','Atlas stores each committed record durably and supports concurrent readers with a single coordinated writer.'],
 ['https://alpha.research.test/backup','Fixture Atlas backup','Atlas backups preserve committed data, while restore time depends on the tested size of the archive.'],
 ['https://beta.research.test/design','Fixture Beacon design','Beacon distributes writes across independent nodes and requires explicit conflict resolution for concurrent updates.'],
 ['https://beta.research.test/cost','Fixture Beacon cost','Beacon adds operational coordination and network costs; deployment size alone does not establish a performance advantage.'],
 ['https://gamma.research.test/method','Fixture evaluation method','A fair comparison measures latency, failures, recovery time, and operational effort under the same workload.'],
 ['https://gamma.research.test/limits','Fixture evaluation limits','The evaluation uses synthetic inputs and cannot establish production reliability without independent representative workload tests.']
].map(([url,title,quote])=>({url,title,quote,sourceType:'primary'}))
export function material(url){const d=documents.find(d=>d.url===url);return d?'<html><head><title>'+d.title+'</title></head><body><h1>'+d.title+'</h1><p>'+d.quote+'</p><p>Deterministic test data. These fictional systems are not product recommendations.</p></body></html>':null}
export function taskFrom(text){const marker='[AEXUS_DEEP_RESEARCH_TASK]\n\n',raw=text.slice(text.lastIndexOf(marker)+marker.length).split('\n')[0];return JSON.parse(raw)}
export function reply(text,engine){
 const {taskId,kind,payload}=taskFrom(text),control=process.env.AC_INIT_FIXTURE
 if(control)fs.appendFileSync(path.join(control,'deep-research-wire.jsonl'),JSON.stringify({taskId,kind,engine,payload,at:Date.now()})+'\n')
 if(kind==='plan')return {taskId,plan:{title:'Atlas 与 Beacon：有证据的选择',objective:'为 '+payload.topic+' 形成可验证的决策建议。',tracks:['独立核对原始设计、备份与数据一致性','独立寻找成本、失效模式、反例与测试限制'],successCriteria:['真实来源摘录可以回查','关键结论明确对应证据，保留适用边界'],questions:[{prompt:'更关注单机易用性，还是跨节点写入能力？',recommended:'先满足单机可靠性，在确有跨节点需求时再比较分布式方案。'},{prompt:'是否已有可复现的代表性工作负载？',recommended:'尚无；报告应给出验证步骤，避免声称已证明生产性能。'}]}}
 if(kind==='research'){
  const selected=payload.role==='证据研究员'?documents.slice(0,3):documents.slice(3)
  return {taskId,sources:selected,findings:selected.map((s,i)=>({statement:s.title+'：'+s.quote,urls:[s.url],kind:'fact',limitation:'合成验收资料，不能作为现实产品结论。'})),gaps:['生产工作负载与恢复目标仍需由实际使用者确认。']}
 }
 if(kind==='review'){
  const revise=control&&fs.existsSync(path.join(control,'review-revise'))&&!fs.existsSync(path.join(control,'review-revised'))
  if(revise){fs.writeFileSync(path.join(control,'review-revised'),'');return {taskId,verdict:'revise',issues:[{severity:'blocking',reason:'补充同一负载下的验证方法并明确不能外推到生产环境。'}],disagreements:['单机与分布式的取舍取决于目标负载。']}}
  return {taskId,verdict:'pass',issues:[{severity:'note',reason:'材料是用于软件验收的合成示例，不能替代真实生产验证。'}],disagreements:['单机与分布式的取舍取决于负载与维护能力，不能仅凭架构名称判断优劣。']}
 }
 const sources=payload.sources??[],ids=sources.map(s=>s.id),paragraph=(n)=>({text:('在本次合成验收中，证据仅支持材料中明确写出的设计特征。研究员分别检查原始描述、失效边界和操作成本，再把结果交给独立审查者。这个流程不把来源数量当作正确率，也不把一段可查找的摘录当作完整证明。对于真实部署，应先记录目标工作负载、数据一致性要求、恢复时间目标和可以投入的维护资源，再执行可重复的测量。没有这些条件时，报告保留不确定性，明确区分已经观察到的信息与尚待验证的判断。决策也必须考虑退出与迁移成本，避免只依据方便展示的成功案例。第 '+n+' 项建议以用户确认过的研究范围为边界，后续证据出现时再修订判断。'),kind:'analysis',sourceIds:[ids[n%ids.length],ids[(n+1)%ids.length]]})
 const report={title:'Atlas 与 Beacon：可核对的研究报告（合成验收）',executiveSummary:[{text:'不同写入和协调方式对应不同约束，现有材料不足以直接推断真实生产性能。',kind:'analysis',sourceIds:ids.slice(0,3)},{text:'用同一代表性负载比较延迟、恢复与维护投入，并保留测试输入和结果。',kind:'analysis',sourceIds:ids.slice(-2)}],sections:['研究目标与范围','设计特征及使用条件','独立反证与成本分析','验证方案与决策路线'].map((title,i)=>({title,paragraphs:[paragraph(i*2),paragraph(i*2+1)]})),comparisons:[{option:'Atlas 路线',advantages:'结构集中，便于说明单写入者约束。',tradeoffs:'需要验证实际并发与恢复目标。',sourceIds:ids.slice(0,2)},{option:'Beacon 路线',advantages:'可讨论跨节点写入与冲突处理。',tradeoffs:'引入协调与网络成本。',sourceIds:ids.slice(2,4)}],recommendations:[{text:'先建立可重复的负载与恢复测试，再根据证据选择架构；不要将本合成示例当成现实产品建议。',kind:'analysis',sourceIds:ids.slice(-2)}],limitations:['所有网页与研究答复都是确定性测试材料。该报告只用于验收软件流程，不包含真实产品调研结论。','来源类型由研究员给出，网页摘录匹配不会自动证明结论。']}
 if(control&&fs.existsSync(path.join(control,'bad-citations')))report.executiveSummary[0].sourceIds=['S-NOT-VERIFIED']
 return {taskId,report}
}
