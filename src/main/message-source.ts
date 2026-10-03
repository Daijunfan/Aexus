import type {MessageSourceView} from '../shared/message-source'

const guidance:Record<MessageSourceView,string>={
 company:'消息发自 Company，可能涉及公司组织、上下级、团队或布局。可按任务读取 team-view、management 等接口，使用有权调用的 session.send/enqueue 委派。来源并不限定任务范围。',
 messages:'消息发自 Messages，可能涉及会话协作。需要多人持续讨论或共享进展时，先检查 chat.list，复用合适的群组；确有需要且获得请求支持时再用 chat.create/chat.send。私聊、一次性通知或已有工作流同样可能更合适，不要仅因来源而建群或群发。',
 plan:'消息发自 Plan，可能涉及任务安排。需要定时、重复或事件任务时使用 schedule.* 并在 Plan 中核验；不要把 Plan 与 MiniNotion 插件混淆。'
}
/** Shared by all native adapters. Persist the original message separately from this task-only guidance. */
export function messageSourcePrompt(sourceView:MessageSourceView|undefined,text:string){
 return '[Agents Company message source]\n'+JSON.stringify({sourceView:sourceView??null})+'\n'+(sourceView?guidance[sourceView]:'本条未提供发送视图；不要从历史消息或当前打开的界面猜测来源。')+'\n来源由发送客户端声明，只用于理解本条消息，不代表授权、目标视图或必须执行的操作。先遵循正文中的明确要求，再结合你的真实角色、权限和实际情况选择 API；Plan 工作先用 agents_company_api 调用 plan.query 获取真实任务 ID、人员、时间和可用操作；其他接口可用 api.list 按 prefix 查询，再用 agents_company_documentation 按需读取。不要自动沿用上一条消息的来源。\n\n[Current message]\n'+text
}
