import fs from 'node:fs'
import path from 'node:path'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const root=path.resolve(import.meta.dirname,'../..'),run=promisify(execFile),dir=import.meta.dirname,scene=JSON.parse(fs.readFileSync(path.join(dir,'scene.json')))
const cli=async(...args)=>{const {stdout}=await run(process.execPath,[root+'/bin/agents',...args,'--json'],{timeout:90000,maxBuffer:8e6});const r=JSON.parse(stdout);if(!r.ok)throw Error(r.error);return r.data}
const gov=scene.employees.find(c=>c.role==='governor'),dev=scene.employees.find(c=>c.title==='阿蓝'),content=scene.employees.find(c=>c.title==='橘子')
const prompt=`请组织 AI 公司第一次开工。只使用现有团队和员工，不新建、不删除。
请通过公司 API 向研发经理阿蓝（${dev.id}）和创作经理橘子（${content.id}）分别派发以下简单任务，由经理再指派给自己的员工，你和经理不能代做。
研发组：开发员工在自己的工作目录编写一个可以打开的“启动页.html”，只需标题“AI 公司，开工了”及“分工、协作、交付”三项，页面简洁，内联样式，无外部依赖。测试员工读取开发员工交付的 HTML，检查标题和三项内容，然后在自己的工作目录保存“测试结果.txt”，用不超过30个字报告结果。经理负责把开发的实际文件路径告诉测试。
创作组：写作员工把以下三行写入自己工作目录的“开工宣言.txt”：一个人，也能带队。\n让 AI 各司其职，\n把想法做成结果。 校对员工读取写作员工交付的文件，核对这三行和标点，然后在自己的工作目录保存“校对结果.txt”，用不超过30个字报告结果。经理负责传递实际文件路径。
等待两位经理完成后，你核对实际结果，在自己工作目录保存“交付清单.txt”：仅4行，分别列出启动页、测试结果、开工宣言、校对结果的完成状态。最后只回复不超过40个字的完成总结，不加表格，不输出执行过程的长解释。`
const sent=await cli('session','send','--employee',gov.id,'--view',scene.viewId,'--text',prompt)
fs.writeFileSync(path.join(dir,'work.json'),JSON.stringify({messageId:sent.messageId,prompt,startedAt:new Date().toISOString()},null,2));console.log('Real Governor task dispatched')
let captures=0,last=0
const deadline=Date.now()+480000
while(Date.now()<deadline){
 const statuses=(await cli('session','status')).filter(c=>scene.employees.some(e=>e.id===c.id)),busy=statuses.filter(c=>c.busy)
 if(statuses.some(c=>c.waitingApproval))throw Error('Promotional task requires attention')
 if(busy.length>=3&&captures<6&&Date.now()-last>4000){captures++;last=Date.now();await cli('ui','screenshot',path.join(dir,`01-工作实拍-${captures}.png`));console.log('Captured live '+captures+' / busy '+busy.length)}
 if(!busy.length){const transcript=await cli('session','transcript',gov.id);fs.writeFileSync(path.join(dir,'真实协作记录.json'),JSON.stringify(transcript,null,2));console.log('All actual tasks finished');break}
 await new Promise(r=>setTimeout(r,1500))
}
for(const c of scene.employees){const status=(await cli('session','status','--employee',c.id))[0];if(status.busy)throw Error('Still working: '+c.title);if(status.lastReply?.id)await cli('session','acknowledge','--employee',c.id,'--reply-id',status.lastReply.id)}
const expected=[['开发','启动页.html'],['测试','测试结果.txt'],['写作','开工宣言.txt'],['校对','校对结果.txt'],['星火','交付清单.txt']]
const results=[];for(const [title,file] of expected){const c=scene.employees.find(c=>c.title===title),result=await cli('workspace','read',file,'--employee',c.id);results.push({employee:title,file,content:result.content})}
fs.writeFileSync(path.join(dir,'交付验证.json'),JSON.stringify(results,null,2));console.log('Verified 5 real files')
