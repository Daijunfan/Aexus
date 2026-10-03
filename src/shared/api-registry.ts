import {CONVERSATION_CONTROL_COMMANDS} from './conversation-control-schema.ts'
import {ASSET_COMMANDS} from './asset-schema.ts'
import {SOURCE_VIEW_SCHEMA} from './message-source.ts'
import {READ_ONLY_APIS,RETIRED_APIS} from './api-effects.ts'
import {booleanSchema,nonemptySchema,objectSchema,textSchema} from './api-schema.ts'
import type {CliSpec} from './cli-contract'
import {QUOTE_SCHEMA} from './message-quotes.ts'
import {CONVERSATION_WORKSPACE_COMMANDS} from './conversation-workspaces.ts'
import {MESSENGER_COMMANDS} from './messenger.ts'
import {PLAN_COMMANDS} from './plan-schema.ts'
import {CHANNEL_COMMANDS} from './channel-schema.ts'
import {SCHEDULE_SPEC_SCHEMA} from './schedule-schema.ts'
import {PREFERENCES_PATCH_SCHEMA} from './preferences.ts'
const sessionMessageSchema={type:'object',properties:{id:textSchema,employee:textSchema,text:textSchema,images:{type:'array',items:textSchema,maxItems:16},files:{type:'array',items:textSchema,maxItems:16},viewId:textSchema,sourceView:SOURCE_VIEW_SCHEMA,clientMessageId:{type:'string',minLength:1,maxLength:160,description:'Optional stable identity for a regular message (not a slash command), shared by send and enqueue for the same authenticated sender and employee. Reuse unchanged attempts after transport loss; never automatically replay uncertain work.'},replyTo:{type:'string',minLength:1,description:'Public message ID in the destination or explicit source conversation; Core resolves the excerpt'},replyQuote:QUOTE_SCHEMA,replyConversation:textSchema,replyTextOnly:booleanSchema},anyOf:[{required:['id']},{required:['employee']}]}
/** Every command the CLI can send. Kept as data so `agents help` can list it. */
const DEFINITIONS: {
  name: string
  args: string
  summary: string
  gui: string
  cli?:CliSpec
  inputSchema?:Record<string,unknown>
}[] = [
  ...PLAN_COMMANDS,
  ...CHANNEL_COMMANDS,
  ...MESSENGER_COMMANDS,
  ...ASSET_COMMANDS,
  ...CONVERSATION_WORKSPACE_COMMANDS,
  ...CONVERSATION_CONTROL_COMMANDS,
  {name:'card.profile',args:'ID [--offset N] [--limit N]',summary:'Read employee identity, authorized memberships, named workspaces and paged Plan tasks without opening an engine or changing read receipts',gui:'Employee profile',cli:{positionals:['id']},inputSchema:objectSchema({id:nonemptySchema,offset:{type:'integer',minimum:0},limit:{type:'integer',minimum:1,maximum:100}},['id'])},
  {cli:[],"name": "view.list", "args": "", "summary": "List application views and their shared data contracts", "gui": "Shared views / group conversations", "inputSchema": objectSchema({},[])},
  {"name": "view.select", "args": "company|messages|plan [--team-view ID]", "summary": "Select a presentation mode; Company defaults to All Team", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": {"type": "string", "enum": ["company", "messages", "plan"]}, "teamViewId": nonemptySchema},["id"])},
  {cli:{},"name": "chat.list", "args": "", "summary": "List groups for the current authenticated member", "gui": "Shared views / group conversations", "inputSchema": objectSchema({},[])},
  {cli:{},"name": "chat.create", "args": "--name NAME [--team TEAM] [--members JSON] [--owner-id ID]", "summary": "Create a group with an Agent Owner; Agent creators own their group, user selects ownerId (defaults to first selected member)", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"name": {"type": "string", "minLength": 1, "maxLength": 80}, "ownerId": nonemptySchema, "team": nonemptySchema, "members": {"type": "array", "items": nonemptySchema, "maxItems": 200}},["name"])},
  {"name": "chat.update", "args": "ID --patch JSON", "summary": "Conversation Owner/Admin: edit group name and membership; Company role does not confer access", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "name": {"type": "string", "minLength": 1, "maxLength": 80}, "members": {"type": "array", "items": nonemptySchema, "maxItems": 200}, "addTeams": {"type": "array", "items": nonemptySchema}, "expectedRevision": {"type": "integer", "minimum": 1}},["id"])},
  {cli:{"positionals":["id"],"rawPositionals":true},"name": "chat.delete", "args": "ID", "summary": "Conversation Owner (or the human user) removes a group; Admin cannot dissolve it; employees and private history are retained", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema},["id"])},
  {"name": "chat.mute", "args": "ID --member EMPLOYEE_ID|all [--for SECONDS | --off]", "summary": "Conversation Owner/Admin: mute visible posts; Company rank grants no moderation; reading and work remain available", "gui": "Group member moderation", "inputSchema": objectSchema({"id": nonemptySchema, "member": {"type": "string", "minLength": 1, "description": "Employee ID in this group, or all (including future members)"}, "muted": booleanSchema, "durationSeconds": {"type": "integer", "minimum": 1, "description": "Omit for an indefinite mute; only valid when muted is true"}},["id", "member", "muted"])},
  {cli:{"positionals":["id"],"rawPositionals":true},"name": "chat.get", "args": "ID", "summary": "Read group metadata and member identities", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema},["id"])},
  {cli:{"positionals":["id"]},"name": "chat.history", "args": "ID [--before SEQUENCE | --around MESSAGE_ID] [--limit 50]", "summary": "Read published group messages with pagination", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "around": nonemptySchema, "before": {"type": "integer", "minimum": 1}, "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 50}},["id"])},
  {name:"chat.file",args:"ID --path PATH [--operation info|image|read|chunk] [--offset N]",summary:"Read a published group attachment as an authenticated member",gui:"Group attachments"},
  {cli:{"positionals":["id"],"aliases":{"messageId":"message"}},"name": "chat.context", "args": "ID [--message ID]", "summary": "Read published group context and concise reporting policy", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "messageId": nonemptySchema},["id"])},
  {"name": "chat.send", "args": "ID [--text TEXT] [--images JSON] [--files JSON] [--mentions JSON|all] [--client-message-id ID] [--view ID] [--reply-to ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]", "summary": "Deliver to current members; mentions and user replies select work, other recipients receive context", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "text": {"type": "string", "minLength": 0, "maxLength": 16000}, "images": {"type":"array","items":textSchema,"maxItems":16}, "files": {"type":"array","items":textSchema,"maxItems":16}, "mentions": {"oneOf": [{"type": "array", "items": nonemptySchema, "maxItems": 200}, {"const": "all"}], "description": "All current members receive the message. Mentions select work targets; user replies also address a current same-group Agent author. Employee work targets still require existing control authority."}, "clientMessageId": {"type": "string", "maxLength": 160, "description": "Stable retry key; duplicate payloads are not dispatched again"}, "viewId": nonemptySchema, "replyTo": nonemptySchema, "replyQuote": QUOTE_SCHEMA, "replyConversation": textSchema, "replyTextOnly": booleanSchema},["id"])},
  {"name": "chat.edit", "args": "ID --message MESSAGE_ID --text TEXT [--file PATH] --expected-revision N", "summary": "User-only: correct own published group text or caption without changing accepted tasks or receipts", "gui": "Group message editing", "inputSchema": objectSchema({"id": nonemptySchema, "messageId": nonemptySchema, "text": {"type": "string", "maxLength": 16000, "description": "Already-trimmed text; empty only when the message has attachments. Does not change dispatched work."}, "expectedRevision": {"type": "integer", "minimum": 0, "description": "Current editRevision, or 0 for an unedited message. Same-text retries are idempotent."}},["id", "messageId", "text", "expectedRevision"])},
  {"name": "chat.post", "args": "ID [--text TEXT] [--images JSON] [--files JSON] [--kind summary|decision|blocker|question|result|message] [--reply-to ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only] [--client-message-id ID]", "summary": "Deliberately publish a nonempty public reply; silence requires no API call", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "text": {"type": "string", "minLength": 0, "maxLength": 16000, "description": "Explicit public text only. Agents require nonempty content (max 2000 Unicode characters); null/undefined placeholder strings are rejected. Operators allow attachment-only posts and max 16000 characters. Receipt is automatic; do not call to remain silent. Muted employees cannot publish."}, "images": {"type":"array","items":textSchema,"maxItems":16}, "files": {"type":"array","items":textSchema,"maxItems":16}, "kind": {"enum": ["summary", "decision", "blocker", "question", "result", "message"], "default": "summary", "description": "message is operator-only publication; every recipient receives context rather than a formal work task"}, "replyTo": nonemptySchema, "replyQuote": QUOTE_SCHEMA, "replyConversation": textSchema, "replyTextOnly": booleanSchema, "clientMessageId": {"type": "string", "maxLength": 160}},["id"])},
  {cli:{"positionals":["id"],"aliases":{"messageId":"message"}},"name": "chat.acknowledge", "args": "ID --message ID", "summary": "User-only: mark group messages read; private receipts remain separate", "gui": "Shared views / group conversations", "inputSchema": objectSchema({"id": nonemptySchema, "messageId": nonemptySchema},["id", "messageId"])},
  {cli:[],"name": "system.info", "args": "", "summary": "Read Core host OS, architecture and deployment capabilities", "gui": "后端信息"},
  {"name": "system.directories", "args": "[--path PATH]", "summary": "Browse directories on the Core host (user or Secretary)", "gui": "后端目录选择"},
  {name:'engine.capabilities',args:'--engine codex|claude|cline|pi',summary:'Read adapter capabilities, workspace modes and employee kinds before hiring; no credentials or inference',gui:'创建员工能力检查'},
  {cli:[],"name": "engine.list", "args": "", "summary": "List registered Coding Agent adapters and public configuration", "gui": "引擎管理"},
  {"name": "engine.check", "args": "--engine ID [--team NAME] [--force]", "summary": "Check executable, protocol and authentication without inference", "gui": "引擎检测"},
  {name:'engine.probe',args:'--engine ID --confirm [--model ID]',summary:'Explicit, potentially billed OK-only inference on the Core host; temporary workspace and 45s timeout',gui:'引擎测试调用'},
  {"name": "engine.configure", "args": "--engine ID --data JSON|@file", "summary": "Set an executable path, encrypted key, or Cline/Pi compatible baseUrl and exact model ID (user or Secretary)", "gui": "引擎配置"},
  {"name": "engine.install-plan", "args": "--engine ID", "summary": "Read the pinned official package and Core-host install destination", "gui": "引擎安装"},
  {"name": "engine.install", "args": "--engine ID --confirm", "summary": "Install a pinned engine into application storage, never global PATH", "gui": "引擎安装"},
  {cli:["id"],"name": "engine.install-status", "args": "ID", "summary": "Read bounded installation progress without credentials", "gui": "引擎安装"},
  {cli:["id"],"name": "engine.cancel-install", "args": "ID", "summary": "Cancel an application-owned installation", "gui": "引擎安装"},
  {"name": "engine.login", "args": "--engine codex", "summary": "Start official Codex device authorization on the Core host", "gui": "Codex 登录"},
  {cli:["id"],"name": "engine.login-status", "args": "ID", "summary": "Read device authorization progress", "gui": "Codex 登录"},
  {cli:["id"],"name": "engine.cancel-login", "args": "ID", "summary": "Cancel a pending device authorization", "gui": "Codex 登录"},
  {"name": "transfer.upload-begin", "args": "--to JSON|@file --name NAME --bytes N", "summary": "Begin a scoped upload with a hidden staging file", "gui": "浏览器文件上传"},
  {"name": "transfer.upload-chunk", "args": "ID --offset N --data BASE64|--data-file FILE", "summary": "Write the next bounded upload chunk", "gui": "浏览器文件上传"},
  {cli:["id"],"name": "transfer.upload-commit", "args": "ID", "summary": "Atomically publish a completed upload without overwriting existing files", "gui": "浏览器文件上传"},
  {cli:["id"],"name": "transfer.upload-abort", "args": "ID", "summary": "Cancel and clean an upload owned by this client", "gui": "浏览器文件上传"},
  {name:"transfer.download-save",args:"--from JSON --path PATH [--overwrite]",summary:"User-only: stream a scoped download to a Core-host file, or choose a destination in the desktop",gui:"Save attachment"},
  {"name": "transfer.download-info", "args": "--from JSON|@file", "summary": "Read download size and version", "gui": "浏览器文件下载"},
  {"name": "transfer.download-chunk", "args": "--from JSON|@file --offset N [--modified-at N]", "summary": "Read a bounded file chunk and reject a changed version", "gui": "浏览器文件下载"},
  {cli:[], name: 'auth.whoami', args: '', summary: 'Read authenticated caller and management role', gui: '管理与协同' },
  {cli:["id"], name: 'auth.agent-token', args: 'ID', summary: 'Issue or read an employee API credential (user only)', gui: '管理与协同' },
  {cli:["id"], name: 'auth.revoke', args: 'ID', summary: 'Revoke employee API credentials (user only)', gui: '管理与协同' },
  { name: 'api.list', args: '[--prefix DOMAIN --search TEXT --all]', summary: 'Discover callable APIs by domain or keyword; all includes retired and permission-restricted metadata, never authority', gui: '管理与协同',inputSchema:objectSchema({all:booleanSchema,prefix:{type:'string',maxLength:120},search:{type:'string',maxLength:200}}) },
  { name: 'api.describe', args: 'COMMAND [--all]', summary: 'Read an API schema; --all includes commands outside the caller execution authority', gui: '管理与协同',inputSchema:objectSchema({command:textSchema,all:booleanSchema},['command']) },
  { name: 'api.docs', args: '[DOCUMENT | --document DOCUMENT]', summary: 'Read the shared documentation index or a Core/plugin document; no execution authority is granted', gui: '管理与协同',inputSchema:objectSchema({document:{type:'string',description:'index, core/api, core/permissions, core/plan, core/scheduler, core/architecture, or plugin/ID/api|schema'}}) },
  {name:'avatar.list',args:'[--query NAME] [--style default|anime|chibi] [--all]',summary:'Discover exact avatar IDs, character names, styles and aliases from the live picker catalog; no inference',gui:'人物形象目录',inputSchema:{type:'object',properties:{query:{type:'string',description:'人物名称、别名或 ID；例如英雄王、吉尔伽美什、Saber'},style:{type:'string',enum:['default','anime','chibi']},all:{type:'boolean',description:'Include retired appearances retained for compatibility'}}}},
  { name: 'connector.get',args:'--manager ID --employee ID',summary:'Read endpoint anchors and 24 availablePoints, including all four corners of the uniform employee frame',gui:'连线端点'},
  { name: 'connector.set',args:'--manager ID --employee ID [--source auto|top|right|bottom|left --source-offset 0.5] [--target auto|top|right|bottom|left --target-offset 0.5] [--points JSON|@file | --auto-route]',summary:'Persist endpoint sides and offsets; does not create management authority or a relation',gui:'点击人物周围点位 / 拖动端点吸附'},
  { name: 'connector.segment',args:'--manager ID --employee ID --index N --x X --y Y',summary:'Move an orthogonal segment in source-Team coordinates; preserve attached employees',gui:'拖动任意折线段'},
  { name: 'connector.reset',args:'--manager ID --employee ID',summary:'Restore automatic source and head-top target routing',gui:'恢复自动连接点'},
  { name: 'office.layout', args: '[--team NAME] [--view VIEW_ID]', summary: 'Read authorized Team bounds, employee coordinates and permitted layout actions; no filesystem access', gui: 'Agent 布局工具' },
  { name: 'session.acknowledge', args: '--employee ID --reply-id ID', summary: 'User-only acknowledgement of the exact displayed reply; stale acknowledgements do not clear newer replies', gui: '可见回复已读' },
  { name: 'management.relayout', args: '--team NAME', summary: 'Group related employees and fit this Team without changing the viewport', gui: '整理团队拓扑' },
  { name: 'management.topology', args: '[--team NAME] [--teams-only] [--creator self|others|operator|unknown|EMPLOYEE_ID]', summary: 'Read teams with isOwnTeam, employeeCount, governorIds, allowedActions and deleteBlockedReason; employee nodes include creation provenance and allowedActions', gui: '管理与协同' },
  { name: 'management.activity', args: '[--team NAME]', summary: 'Read live communication and delegated tasks; highlighted is a maximum 600ms visual cue, not task completion', gui: '管理交互连线' },
  {cli:[], name: 'management.roles', args: '', summary: 'List employee-owned role policies: Employee, Manager and Governor, scopes and protected lifecycle rules', gui: '职位权限' },
  {name:'management.bind',args:'--employee ID [--manager ID]',summary:'Add one persistent source-to-employee arrow; multiple managers allowed; permissions, true createdBy and positions unchanged',gui:'常驻有向连线',inputSchema:objectSchema({employee:{type:'string',minLength:1,description:'Target employee ID'},manager:{type:'string',minLength:1,description:'Source Manager/Governor ID; defaults to the calling Agent; required for user calls'}},['employee'])},
  {name:'management.unbind',args:'--employee ID [--manager ID] | RELATION_ID',summary:'Remove only the selected persistent arrow, including a creator line; does not revoke control or stop work; idempotent',gui:'取消常驻连线',inputSchema:{type:'object',additionalProperties:false,properties:{employee:nonemptySchema,manager:nonemptySchema,id:{type:'string',minLength:1,description:'Alternative relation ID from management.topology.edges'}},oneOf:[{required:['employee'],not:{required:['id']}},{required:['id'],not:{anyOf:[{required:['employee']},{required:['manager']}]}}]}},
  { name: 'management.request', args: '--employee ID [--manager ID]', summary: 'Deprecated permission request; use management.bind for a visual arrow without granting authority', gui: '已停用的管理关系操作' },
  {cli:["id","decision"], name: 'management.decide', args: 'ID approve|deny', summary: 'Deprecated permission approval; visual bindings need no approval workflow', gui: '已停用的管理关系操作' },
  { name: 'management.team', args: '', summary: 'Deprecated discovery only; Team and folder membership no longer grant authority', gui: '旧接口兼容' },
  { name: 'management.global', args: 'ID on|off', summary: 'User or Secretary compatibility alias: assign Governor or demote to Manager; Secretary lifecycle remains user-only', gui: '旧接口兼容' },
  {cli:["id","role"], name: 'card.management-role', args: 'ID employee|manager|governor|secretary', summary: 'Assign a role; Secretary administers the app and lower roles, only the user appoints or removes Secretaries', gui: '管理与协同' },
  {cli:["id","mode"], name: 'card.access-mode', args: 'ID trusted|isolated', summary: 'Set trusted or isolated engine execution', gui: '管理与协同' },
  { name: 'session.status', args: '[--employee ID]', summary: 'Read lightweight employee activity without full transcripts', gui: '管理与协同' },
  {cli:[], name: 'shared.info',args:'',summary:'Locate the checkout Shared directory',gui:'共享中转站物理目录'},
  { name: 'view.shared',args:'on|off',summary:'Show or hide the shared transfer drawer without closing the conversation',gui:'共享中转站侧栏'},
  { name: 'transfer.start',args:'--from JSON|@file --to JSON|@file',summary:'Copy a file or directory between local, shared and Team/employee workspaces',gui:'跨工作区拖放复制'},
  {cli:[], name: 'transfer.list',args:'',summary:'List transfer progress and results for this service run',gui:'传输列表'},
  {cli:["id"], name: 'transfer.get',args:'ID',summary:'Read a transfer result and byte progress',gui:'传输进度'},
  {cli:["id"], name: 'transfer.cancel',args:'ID',summary:'Cancel a queued or running copy; preserve source files',gui:'取消传输'},
  {cli:[], name: 'schedule.schema', args: '', summary: 'Describe the host scheduling contract', gui: 'CLI 调度基础，供插件复用' },
  {cli:[], name: 'schedule.status', args: '', summary: 'Read scheduler health and active runs', gui: 'CLI 调度基础，供插件复用' },
  {name:'schedule.list',args:'[--employee ID --source NAMESPACE]',summary:'Read raw saved schedules, including orphan records for application administrators; prefer plan.query for people, times and capabilities',gui:'Plan database',inputSchema:objectSchema({employee:nonemptySchema,source:nonemptySchema})},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.get',args:'ID',summary:'Read the exact saved configuration and revision, even when its employee was removed; discover IDs through plan.query',gui:'Plan task editor',inputSchema:objectSchema({id:nonemptySchema},['id'])},
  {name:'schedule.create',args:'--spec @file.json | --name NAME --employee ID|self --prompt TEXT (--after-seconds N | --at ISO | --time HH:mm | --every-seconds N | --on-event signal|channel.posted) [--enabled true|false|on|off | --paused] [--view VIEW_ID --days 7 --timezone IANA --month-day last --max-occurrences N --client-request-id KEY --duration-minutes N --channel ID --event-channel ID --cooldown-seconds N]',summary:'Schedule an existing employee or yourself; enabled by default; --paused or --enabled false disables automatic runs; Governor requires --view; retry-safe clientRequestId',gui:'Plan task editor',inputSchema:objectSchema({spec:SCHEDULE_SPEC_SCHEMA,clientRequestId:{type:'string',minLength:1,maxLength:160}},['spec'])},
  {name:'schedule.update',args:'ID --patch @file.json [--expected-revision N]',summary:'Update an idle schedule; full action/rule replacement, optional revision; retains execution count',gui:'Plan task editor',inputSchema:objectSchema({id:textSchema,expectedRevision:{type:'integer',minimum:0},patch:objectSchema(SCHEDULE_SPEC_SCHEMA.properties)},['id','patch'])},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.pause',args:'ID [--expected-revision N]',summary:'Pause future triggers without stopping the current run',gui:'Plan task editor',inputSchema:objectSchema({id:nonemptySchema,expectedRevision:{type:'integer',minimum:0}},['id'])},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.resume',args:'ID [--expected-revision N]',summary:'Resume future triggers after rechecking the current target and original delegation',gui:'Plan task editor',inputSchema:objectSchema({id:nonemptySchema,expectedRevision:{type:'integer',minimum:0}},['id'])},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.delete',args:'[ID | --ids JSON] [--expected-revision N | --expected-revisions JSON]',summary:'Delete selected schedules, including orphaned records for Secretary; preflight all IDs and revisions before any cancellation; retain run history',gui:'Plan task editor',inputSchema:{type:'object',additionalProperties:false,properties:{id:nonemptySchema,ids:{type:'array',minItems:1,maxItems:100,uniqueItems:true,items:nonemptySchema},expectedRevision:{type:'integer',minimum:0},expectedRevisions:{type:'object',additionalProperties:{type:'integer',minimum:0}}},oneOf:[{required:['id'],not:{required:['ids']}},{required:['ids'],not:{required:['id']}}]}},
  {name:'schedule.preview',args:'[ID [--patch JSON|@file] | --spec @file.json] [--after ISO --count N]',summary:'Preview saved or draft occurrences without executing; a saved job retains its consumed quota',gui:'Plan preview',inputSchema:{type:'object',additionalProperties:false,properties:{id:nonemptySchema,spec:SCHEDULE_SPEC_SCHEMA,patch:objectSchema(SCHEDULE_SPEC_SCHEMA.properties),after:{type:'string',description:'Exclusive ISO instant; saved-job forecasts do not replenish remaining occurrences when the cursor advances'},count:{type:'integer',minimum:1,maximum:100,default:5}},oneOf:[{required:['id'],not:{required:['spec']}},{required:['spec'],not:{anyOf:[{required:['id']},{required:['patch']}]}}]}},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.run',args:'ID [--expected-revision N]',summary:'Run once now; may use a model, does not consume the next occurrence',gui:'Plan task editor',inputSchema:objectSchema({id:nonemptySchema,expectedRevision:{type:'integer',minimum:0}},['id'])},
  { name: 'schedule.history', args: '[ID] [--employee ID --limit N]', summary: 'Read durable run and job IDs, exact execution times and outcomes; deletion preserves authorized history', gui: 'Plan execution history',inputSchema:objectSchema({id:nonemptySchema,employee:nonemptySchema,limit:{type:'integer',minimum:1,maximum:1000}}) },
  {cli:{positionals:['id'],required:['eventId']},name:'schedule.trigger',args:'ID --event-id KEY',summary:'Submit a deduplicated signal to an event schedule; current caller and original scheduling authority are checked; native channel events cannot be forged',gui:'Plan event rule',inputSchema:objectSchema({id:textSchema,eventId:{type:'string',minLength:1,maxLength:160}},['id','eventId'])},
  {cli:{positionals:['id'],rawPositionals:true},name:'schedule.cancel',args:'ID',summary:'Cancel an active run, preserving its history',gui:'Plan task editor',inputSchema:objectSchema({id:nonemptySchema},['id'])},
  {cli:[], name: 'settings.get', args: '', summary: 'Read independent Company, Messages and Plan appearances, shared controls and default employee models', gui: '应用设置' },
  { name: 'engine.models', args: '--engine codex|claude|cline|pi [--kind worker|cloud-native-worker] [--team NAME]', summary: 'List available models before employee creation, without inference; Cloud Native reads the selected host', gui: '创建员工和默认模型设置' },
  { name: 'settings.set', args: '[--view company|messages|plan | --view-appearance JSON|@file] [--message-wallpaper JSON|@file] [--language en|zh-CN] [--theme violet|blue|mint|teal|cyan|rose|coral|amber|indigo|graphite|custom|white|light|space|black|midnight|sage] [--theme-color #RRGGBB] [--default-permission default|acceptEdits|bypassPermissions] [--explorer-width N] [--terminal-height N] [--page-zoom N] [--zoom-sensitivity N] [--pan-sensitivity N] [--sidebar-width N] [--snap-employees on|off] [--team-overview on|off] [--default-codex-model ID] [--default-claude-model ID] [--default-cline-model ID] [--default-pi-model ID]', summary: 'Patch independent view appearances and shared settings; legacy theme flags target Messages only', gui: '背景、灵敏度和团队索引',inputSchema:PREFERENCES_PATCH_SCHEMA },
  {cli:[], name: 'view.get', args: '', summary: 'Read service-owned navigation, including without a window', gui: '当前面板' },
  { name: 'view.open', args: 'home|messages|plan|team|employee|workspace|conversation|initialization|plugin|settings [--name NAME] [--employee ID | --chat GROUP_ID | --channel CHANNEL_ID] [--source SOURCE_ID] [--plugin ID] [--plan-view ID]', summary: 'Open a form, workspace, news channel or employee conversation', gui: '打开资料或会话' },
  {cli:[], name: 'view.close', args: '', summary: 'Close the current panel after saving workspace edits; keep engines running', gui: '× / Escape / 收起面板' },
  { name: 'view.details', args: 'on|off', summary: 'Show or hide employee details inside a conversation', gui: '员工资料 / 返回会话' },
  { name: 'status', args: '', summary: 'Is the app running, and how many sessions are live', gui: 'The app window being open' },
  {cli:[],name:'session.inbox',args:'',summary:'Read bounded direct-message previews for authorized employees; no model calls, terminal startup or read acknowledgements',gui:'Messages conversation list'},
  { name: 'session.list', args: '[--live] [--summary]', summary: 'List stored cards (or live sessions with --live)', gui: 'The company floor' },
  { name: 'session.new', args: '[--engine claude|codex] [--group NAME] [--model M]', summary: 'Create a session', gui: '“+ Hire employee”' },
  {cli:["id","title"], name: 'session.rename', args: '<card-or-session-id> <title>', summary: 'Rename an employee and its one conversation without moving the folder', gui: '会话名称 / 员工名牌' },
  { name: 'session.open', args: '<cardId>', summary: 'Open a stored card (resumes its engine context)', gui: 'Clicking a card' },
  { name: 'session.send', args: '<id> <text> | --employee ID --text TEXT [--source-view company|messages|plan] [--view VIEW_ID] [--client-message-id ID] [--images JSON] [--files JSON] [--reply-to MESSAGE_ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]', inputSchema:sessionMessageSchema, summary: 'Send a message to a Worker session', gui: '对话输入框' },
  {cli:["id"], name: 'host.fingerprints', args: '<id>', summary: 'Read SSH host key fingerprints without trusting them', gui: '查看主机指纹' },
  { name: 'host.trust', args: '<id> --fingerprint SHA256:...', summary: 'Trust an explicitly confirmed and matching SSH host fingerprint', gui: '确认信任主机' },
  { name: 'host.terminal-open', args: '<id> [--directory PATH --cols N --rows N]', summary: 'Open a persistent SSH PTY without an employee', gui: 'Cloud Hosts 工作台' },
  { name: 'host.terminal-list', args: '<id>', summary: 'List host PTYs', gui: 'Cloud Hosts 工作台' },
  { name: 'host.terminal-read', args: '<id> --terminal ID [--cursor N --wait-ms N]', summary: 'Read incremental host PTY output, optionally waiting up to 15000ms for new data', gui: 'Cloud Hosts 工作台' },
  { name: 'host.terminal-input', args: '<id> --terminal ID --data TEXT|--file FILE [--enter]', summary: 'Send host PTY input and control keys', gui: 'Cloud Hosts 工作台' },
  { name: 'host.terminal-resize', args: '<id> --terminal ID --cols N --rows N', summary: 'Resize a host PTY', gui: 'Cloud Hosts 工作台' },
  { name: 'host.terminal-close', args: '<id> --terminal ID', summary: 'Close a host PTY', gui: 'Cloud Hosts 工作台' },
  { name: 'host.desktop-list', args: '<id>', summary: 'List active remote desktop transports', gui: 'Cloud Hosts 工作台' },
  { name: 'host.desktop-open', args: '<id>', summary: 'Open configured RDP or VNC transport; does not imply desktop login', gui: 'Cloud Hosts 工作台' },
  { name: 'host.desktop-launch', args: '<id> --session ID', summary: 'Launch native RDP client on the Core machine', gui: 'Cloud Hosts 工作台' },
  { name: 'host.desktop-close', args: '<id> --session ID', summary: 'Close desktop transport and SSH forward', gui: 'Cloud Hosts 工作台' },
  { name: 'host.exec', args: '<id> --command COMMAND|--command-file FILE [--directory PATH --timeout SECONDS]', summary: 'Execute a management command exclusively on the registered remote host', gui: '远端管理命令' },
  { name: 'host.list', args: '[--os linux|macos|windows] [--distribution ubuntu|kali|ID] [--summary] [--credentials]', summary: 'Discover the shared host registry; credentials optionally includes passwords and SSH files for authorized Manager/Governor hosts; no SSH probes', gui: 'Cloud Hosts 插件' },
  {cli:["id"], name: 'host.get', args: '<id>', summary: 'Read a cloud host connection record; Governor all hosts, Manager its Team host', gui: 'Cloud Hosts 插件' },
  { name: 'host.create', args: '--data @host.json', summary: 'Create a cloud host in the shared registry', gui: 'Cloud Hosts 插件' },
  { name: 'host.update', args: '<id> --data @patch.json', summary: 'Edit host connection and credentials', gui: 'Cloud Hosts 插件' },
  {cli:["id"], name: 'host.remove', args: '<id>', summary: 'Remove an unbound cloud host', gui: 'Cloud Hosts 插件' },
  {cli:["id"], name: 'host.check', args: '<id>', summary: 'Check SSH connectivity without requiring a Team working directory', gui: 'Cloud Hosts 插件与 Team 连接灯' },
  { name: 'host.directories', args: '<id> [--path PATH]', summary: 'Browse existing directories on a registered cloud host', gui: 'Cloud Hosts 插件' },
  {cli:["id"], name: 'host.credentials', args: '<id>', summary: 'Read authorized host password and registered private key, known_hosts and SSH config contents', gui: 'Cloud Hosts 插件' },
  { name: 'engine.remote-check', args: '--team NAME --engine codex|claude [--directory PATH]', summary: 'Check a Cloud Team native CLI, protocol, authentication and workspace before hiring', gui: 'Cloud Native Worker 创建前检查' },
  { name: 'engine.remote-sessions', args: '--team NAME --engine codex|claude', summary: 'List native sessions on the selected Cloud Team host', gui: '绑定已有云端会话' },
  {cli:["id","sessionId"], name: 'card.native-bind', args: '<employee-id> <native-session-id>', summary: 'Bind an existing remote native session without taking deletion ownership', gui: '绑定远端原生会话' },
  { name: 'session.follow', args: '<id> [--raw]', summary: 'Stream a session’s events until its turn ends', gui: 'Watching the transcript' },
  { name: 'session.transcript', args: '<id> | --employee ID [--limit N] [--thinking]', summary: 'Read the full conversation by default, or its last 1–1000 items with --limit; no read acknowledgment', gui: 'The transcript pane', inputSchema:{type:'object',properties:{id:{type:'string',minLength:1,description:'Employee or live session ID'},employee:{type:'string',minLength:1,description:'Alternative employee ID'},limit:{type:'integer',minimum:1,maximum:1000,description:'Last N items; omit to read the complete conversation'},thinking:{type:'boolean',description:'Include thinking blocks in formatted text and shown items'}},anyOf:[{required:['id']},{required:['employee']}]} },
  {cli:["id"], name: 'session.interrupt', args: '<id>', summary: 'Stop the current turn', gui: 'The “■ Stop” button' },
  {cli:["id"], name: 'session.close', args: '<id>', summary: 'Close a live engine while retaining the employee and history', gui: 'CLI 显式结束引擎' },
  { name: 'session.info', args: '<id>', summary: 'Show a live session’s engines, models, commands', gui: 'The toolbar dropdowns' },
  {cli:["id"], name: 'session.activity', args: '<id>', summary: 'Current speech, published thinking or tool preview; null when idle', gui: '员工活动气泡' },
  {cli:["id"], name: 'session.snapshot', args: '<id>', summary: 'Full frontend state', gui: 'The conversation and toolbar' },
  { name: 'session.search', args: '<query>', summary: 'Search employees and workspaces', gui: 'Office search' },
  {cli:["id"], name: 'approval.list', args: '<id>', summary: 'Pending tool permissions', gui: 'Permission requests' },
  { name: 'approval.respond', args: '<id> <requestId> allow|deny [--answers JSON] [--form JSON]', summary: 'Answer a tool permission', gui: 'Allow / Decline' },
  {cli:["id","engine"], name: 'config.engine', args: '<card-or-live-id> ENGINE', summary: 'Retired: always rejects; delete the employee and create a new one to choose another engine', gui: '创建后引擎固定' },
  {cli:["id","model"], name: 'config.model', args: '<id> <model>', summary: 'Change model', gui: 'Model dropdown' },
  { name: 'config.remote-admin', args: '<id> on|off', summary: 'Explicitly authorize SSH-user administration on a cloud Codex worker; never local execution', gui: '远端主机管理权限' },
  {cli:["id","mode"], name: 'config.permission', args: '<id> <mode>', summary: 'Change permission mode', gui: '🔒 dropdown' },
  {cli:["id","enabled"], name: 'config.thinking', args: '<id> on|off', summary: 'Toggle thinking', gui: '🧠 toggle' },
  { name: 'config.effort', args: '<id> <level|default>', summary: 'Change effort level', gui: '⚡ dropdown' },
  { name: 'config.plan', args: '<id> on|off', summary: 'Switch the official planning mode', gui: '计划模式' },
  {cli:["url"], name: 'external.open', args: '<https-url>', summary: 'Validate an external URL and open it when a desktop is attached', gui: '原生授权链接' },
  {cli:["id","section"], name: 'engine.inspect', args: '<id> [capabilities|skills|mcp|account|usage|config]', summary: 'Inspect native engine capabilities and configuration', gui: '引擎工具面板' },
  { name: 'engine.skill', args: '<id> <name> [prompt]', summary: 'Invoke a discovered engine skill', gui: '使用技能' },
  { name: 'session.steer', args: '<id> <text> [--source-view company|messages|plan]', summary: 'Append instructions to the active native turn with optional per-message presentation context', gui: '运行中追加', inputSchema:{type:'object',properties:{id:textSchema,employee:textSchema,text:textSchema,sourceView:SOURCE_VIEW_SCHEMA},anyOf:[{required:['id']},{required:['employee']}]} },
  {cli:["id"], name: 'session.background', args: '<id>', summary: 'List agent-owned background terminals', gui: '后台进程' },
  { name: 'session.background-stop', args: '<id> [--process ID]', summary: 'Stop one or all agent-owned background terminals', gui: '停止后台进程' },
  { name: 'session.review', args: '<id> [--base BRANCH|--commit SHA|--instructions TEXT]', summary: 'Run native Codex review for a chosen target', gui: '/review' },
  { name: 'session.enqueue', args: '<id> <text> | --employee ID --text TEXT [--source-view company|messages|plan] [--view VIEW_ID] [--client-message-id ID] [--images JSON] [--files JSON] [--reply-to MESSAGE_ID] [--reply-quote JSON] [--reply-conversation REF] [--reply-text-only]', inputSchema:sessionMessageSchema, summary: 'Queue a message after the active turn', gui: '排队发送' },
  {cli:["id"], name: 'session.queue', args: '<id>', summary: 'List queued messages', gui: '待发送消息' },
  {cli:["id","messageId"], name: 'session.dequeue', args: '<id> <messageId>', summary: 'Remove a queued message', gui: '取消排队' },
  { name: 'session.export', args: '<id> [--format markdown|json] [--path RELATIVE]', summary: 'Export conversation into the employee workspace', gui: '导出会话' },
  { name: 'view.tools', args: '<skills|mcp|account|usage|config|export|off>', summary: 'Open or close the engine tools panel', gui: '引擎工具面板' },
  { name: 'config.fast', args:'<id> on|off',summary:'Set the official Fast service tier',gui:'Fast 速度开关' },
  { name: 'commands.run', args:'<id> /command [args]',summary:'Execute a discovered slash command through shared Core',gui:'斜杠命令' },
  { name: 'commands.list', args: '<id> [--filter X] [--all]', summary: 'Slash commands available to a session', gui: 'The “/” menu' },
  { name: 'commands.complete', args: '<id> <name>', summary: 'What Tab would insert', gui: 'Tab/⏎ in the “/” menu' },
  { name: 'group.list', args: '', summary: 'List departments', gui: 'Department headings' },
  {cli:[], name: 'team-view.list', args: '', summary: 'List All Team and saved Team views with the active selection', gui: '顶部视图标签' },
  { name: 'team-view.create', args: '--name NAME [--teams @teams.json]', summary: 'Create and select a named view of existing Teams', gui: '＋ 添加视图' },
  { name: 'team-view.update', args: 'ID --patch @patch.json', summary: 'Rename, reorder, or change Team membership of a custom view', gui: '编辑或拖动视图' },
  {cli:["id"], name: 'team-view.remove', args: 'ID', summary: 'Delete a custom view without deleting Teams', gui: '删除视图' },
  {cli:["id"], name: 'team-view.select', args: 'all|ID', summary: 'Select a saved Team view and its canvas viewport', gui: '切换视图' },
  { name: 'group.add', args: '<name> [--mode work|build|cloud] [--plugin ID] [--host-id ID] [--directory-mode default|bind] [--remote-dir PATH] [--os linux|macos|windows] [--distribution ID]', summary: 'Create a real cloud Team with host-id; directory-mode default creates a new remote child folder; os/distribution assert actual host, never labels', gui: '“+ Department”' },
  { name: 'group.configure', args: '<name> --mode work|build|cloud [--plugin ID] [--host-id ID --remote-dir PATH]', summary: 'Configure a legacy unbound Team; created Team bindings are fixed', gui: '创建 Team 时配置工作方式' },
  { name: 'group.remove', args: '<name> [name ...] [--delete-workspace]', summary: 'Delete selected Teams and all their employees; optionally delete their employee folders after one batch preflight', gui: '侧栏编辑 · 多选团队 · 一次确认删除' },
  { name: 'room.place', args: '<name> --col N --row N [--w N --h N]', summary: 'Position a department’s room on the floor', gui: 'Dragging a room by its sign' },
  { name: 'card.rename', args: '<cardId> <title>', summary: 'Rename an employee without moving its working folder', gui: '员工资料中的名字' },
  { name: 'card.move', args: '<cardId> <same-group> [--before id]', summary: 'Reorder within the existing Team; group and directory are fixed', gui: '同 Team 内排序' },
  { name: 'card.remove', args: '<cardId> [cardId ...] [--delete-workspace]', summary: 'Remove selected employees and owned sessions; optionally delete all their folders after one batch preflight', gui: '侧栏编辑 · 多选员工 · 一次确认删除' },
  { name: 'card.clone', args: '<id> --title NAME [--directory-mode default|bind] [--cwd PATH]', summary: 'Clone an employee with an independent native conversation', gui: '克隆员工' },
  { name: 'card.initialize', args: '<employee-id> [--model ID] [--effort LEVEL]', summary: 'Retry read-only initialization: every role reads its identity and the shared documentation index', gui: '员工重试初始化' },
  { name: 'card.create', args: '--title NAME [--group TEAM] [--character NAME --avatar-style anime|chibi | --avatar ID] [--profession TEXT] [--management-role employee|manager|governor|secretary] [--kind worker|cloud-native-worker] [--work-environment team|local] [--engine E] [--model ID] [--thinking on|off] [--effort LEVEL]', summary: 'Create an employee: title=name, character/avatar=appearance, managementRole=rank, profession=duties; discover appearances with avatar.list and verify via session.status', gui: '添加员工',inputSchema:{type:'object',required:['title'],properties:{title:{type:'string',description:'Employee display name only; does not select appearance'},group:{type:'string',description:'Existing Team; Manager defaults to own Team and cannot hire elsewhere'},character:{type:'string',description:'Exact characterId/name/alias from avatar.list; e.g. 英雄王 or gilgamesh'},avatarStyle:{type:'string',enum:['default','anime','chibi'],description:'Original-series anime or cute chibi; explicit when character has multiple appearances'},avatar:{type:'string',description:'Exact avatar.list id, as an alternative to character + avatarStyle; e.g. fate-gilgamesh-chibi'},profession:{type:'string',description:'Occupation or responsibility; does not grant authority'},managementRole:{type:'string',enum:['employee','manager','governor','secretary'],description:'Manager creates own-Team employees; Governor creates employees/managers; Secretary also creates Governors and administers the app; only user creates Secretaries'},kind:{type:'string',enum:['worker','cloud-native-worker']},workEnvironment:{type:'string',enum:['team','local']},engine:{type:'string',enum:['codex','claude','cline','pi']},model:textSchema,thinking:booleanSchema,permissionMode:textSchema,cwd:textSchema,directoryMode:{type:'string',enum:['default','bind']}}}},
  {name:'card.avatar',args:'<employee-id> [--avatar ID | --character NAME --avatar-style anime|chibi]',summary:'Set only a controlled employee appearance and its default palette; Manager own Team, Governor across Teams; discover IDs with avatar.list',gui:'员工人物形象',inputSchema:{type:'object',required:['id'],properties:{id:textSchema,avatar:textSchema,character:textSchema,avatarStyle:{type:'string',enum:['default','anime','chibi']}}}},
  { name: 'card.update', args: '<cardId> [--title NAME] [--avatar ID | --character NAME --avatar-style STYLE] [--profession TEXT]', summary: 'Application-wide general profile editing; supervisors use card.avatar for appearance; Team and folder stay fixed', gui: '员工资料' },
  {cli:["name","nextName"], name: 'group.rename', args: '<name> <newName>', summary: 'Rename a Team without renaming or moving its workspace folder', gui: 'Team 名称' },
  { name: 'room.design', args: '<name> [--theme sage] [--wall windows] [--desk oak]', summary: 'Replace room surfaces and furnishings', gui: '空间设计' },
  {cli:["name"], name: 'group.migrate', args: '<name>', summary: 'Move a legacy Team into its managed directory, preserving files', gui: '修复旧工作目录' },
  { name: 'group.root', args: '<name> <absolute-folder>', summary: 'Bind a legacy unbound Team; an existing Team root cannot be changed', gui: '创建 Team 时选择文件夹' },
  { name: 'room.bounds', args: '<name> --x N --y N --width N --height N [--shape S] [--arrangement A]', summary: 'Move and resize a canvas room', gui: '拖动、缩放 Team' },
  {cli:["name"], name: 'room.layout', args: '<name>', summary: 'Computed bounds and full-size employee positions', gui: 'Team 画布布局' },
  { name: 'card.place', args: '<id> --x N --y N [--snap on|off] [--zoom N]', summary: 'Place an employee freely or snap to nearby seats', gui: '拖动员工' },
  { name: 'canvas.view', args: '[--view VIEW_ID]', summary: 'Read viewport position and zoom', gui: '画布视野' },
  { name: 'canvas.set', args: '--x N --y N --zoom N [--view VIEW_ID]', summary: 'Pan and zoom the canvas', gui: '平移、缩放画布' },
  {cli:[], name: 'plugin.list', args: '', summary: 'List installed software plugins', gui: 'Team 工作空间插件' },
  {cli:["id"], name: 'plugin.describe', args: '<id>', summary: 'Read a plugin manifest, API schema and Markdown guide', gui: '插件信息' },
  {cli:["path"], name: 'plugin.install', args: '<directory>', summary: 'Install a compatible local plugin package', gui: 'CLI 安装插件' },
  { name: 'plugin.call', args: '<id> <method> --team NAME [--params JSON] [--raw]', summary: 'Invoke the shared plugin runtime; raw preserves the JSON-RPC error/result envelope', gui: '插件中的操作' },
  { name: 'plugin.open', args: '<id> [--team NAME|--employee ID]', summary: 'Open or focus an independent plugin window', gui: '独立插件窗口' },
  {cli:[], name: 'plugin.windows', args: '', summary: 'List plugin window state, also in headless mode', gui: '独立插件窗口' },
  { name: 'plugin.place', args: '<windowId> --x N --y N --width N --height N', summary: 'Move and resize a plugin window', gui: '独立插件窗口' },
  {cli:["id","mode"], name: 'plugin.mode', args: '<windowId> normal|minimized|maximized|fullscreen', summary: 'Change native plugin window state', gui: '插件窗口最小化、还原与全屏' },
  {cli:["id"], name: 'plugin.dismiss', args: '<windowId>', summary: 'Save and close an independent plugin window', gui: '独立插件窗口' },
  { name: 'plugin.view', args: '<id> [--team NAME|--employee ID]', summary: 'Open a plugin view in its managed root or selected scope', gui: 'Team 工作空间' },
  {cli:["viewId"], name: 'plugin.close', args: '<viewId>', summary: 'Close an embedded plugin view', gui: '关闭工作空间' },
  { name: 'workspace.docs', args: '--team NAME | --employee ID', summary: 'Prepare shared documentation and authorized CLI entry points without copying handbooks into the workspace', gui: '自动准备 Agent 文档' },
  { name: 'workspace.suggest', args: '--team NAME [--work-environment team|local]', summary: 'Suggest an external workspace directory without changing files', gui: '默认工作目录' },
  { name: 'workspace.choose', args: '[--path PATH]', summary: 'Choose a folder in the desktop directory picker', gui: '选择文件夹' },
  { name: 'remote.check', args: '--team NAME | --employee ID | --remote-host HOST --remote-dir PATH', summary: 'Check SSH and the target working directory; return remote OS details', gui: '云端工作目录诊断'},
  { name: 'terminal.open', args: '--employee ID [--cols N --rows N]', summary: 'Open a PTY in the employee working directory', gui: '新建终端'},
  { name: 'terminal.list', args: '[--employee ID]', summary: 'List employee terminals', gui: '终端标签'},
  { name: 'terminal.read', args: 'ID [--cursor N]', summary: 'Read terminal output since an offset', gui: '终端输出'},
  { name: 'terminal.input', args: 'ID --data TEXT [--enter]', summary: 'Send terminal input, including control keys', gui: '终端输入'},
  { name: 'terminal.resize', args: 'ID --cols N --rows N', summary: 'Resize the PTY', gui: '终端尺寸'},
  {cli:["id"], name: 'terminal.close', args: 'ID', summary: 'Close a terminal and its shell', gui: '关闭终端'},
  { name: 'workspace.list', args: '[path] [--shared|--team NAME|--employee ID]', summary: 'List real workspace files', gui: '文件目录' },
  { name: 'workspace.image', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Read a scoped image for preview or model input', gui: '图片预览和附件' },
  { name: 'workspace.read', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Read a workspace file', gui: '文件预览' },
  { name: 'workspace.write', args: '<path> [--shared|--team NAME|--employee ID] --content TEXT|--base64-file IMAGE_B64 [--hash HASH]', summary: 'Save text or a PNG/JPEG/GIF/WebP image in a workspace', gui: '保存文件或粘贴截图' },
  { name: 'workspace.mkdir', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Create a folder', gui: '新建文件夹' },
  { name: 'workspace.move', args: '<path> --to PATH [--shared|--team NAME|--employee ID]', summary: 'Rename or move a file', gui: '重命名文件' },
  { name: 'workspace.trash', args: '<path> [--shared|--team NAME|--employee ID]', summary: 'Move a file to recoverable workspace trash', gui: '移到回收站' },
  { name: 'workspace.restore', args: '--id ID [--shared|--team NAME|--employee ID]', summary: 'Restore a trashed file', gui: '撤销删除' },

  // UI inspection. These read what is actually on screen, so a test can assert
  // the interface rendered rather than only that the store changed.
  { name: 'ui.view', args: '', summary: 'Which view is showing (home or a session)', gui: 'The screen itself' },
  { name: 'ui.dom', args: '[--sel CSS]', summary: 'Query the live interface', gui: 'The screen itself' },
  { name: 'ui.text', args: '', summary: 'All visible text, as rendered', gui: 'The screen itself' },
  { name: 'ui.click', args: '<selector>', summary: 'Click an element in the interface', gui: 'That click' },
  { name: 'ui.type', args: '<selector> <text>', summary: 'Type into an input', gui: 'That typing' },
  { name: 'ui.wait', args: '<selector> [--timeout ms]', summary: 'Wait for an element to appear', gui: 'Waiting for the UI to catch up' },
  { name: 'ui.style', args: '<selector>', summary: 'Computed styles of an element', gui: 'How it actually looks' },
  { name: 'ui.screenshot', args: '<path> [--privacy]', summary: 'Capture a fresh desktop frame; privacy hides Team paths, activity bubbles and dimensions only during export', gui: 'Rendered interface' },
  { name: 'ui.drag', args: '<selector> --dx N --dy N', summary: 'Drag a rendered component', gui: '拖动控件' },
  { name: 'ui.wheel', args: '<selector> --dx N --dy N [--zoom]', summary: 'Pan or zoom with the mouse wheel', gui: '画布滚轮' }
]

/** The shape a UI query returns. */
export type UiElement = {
  tag: string
  cls: string
  text: string
  visible: boolean
}

export type UiSnapshot = {
  view: 'home' | 'session'
  departments: string[]
  cards: { title: string; engine: string; group: string }[]
  /** Present only in the session view. */
  session?: {
    title: string
    engine: string
    model: string
    permission: string
    thinking: string
    thinkingEnabled: boolean
    busy: boolean
    turns: number
    hasBackButton: boolean
  }
  counts: Record<string, number>
}

export type ApiPermission='chat'|'layout.read'|'layout.write'|'operator'|'host.read'|'identity'|'topology'|'relation'|'employee.read'|'employee.message'|'employee.configure'|'employee.create'|'employee.delete'|'workspace'|'plugin'|'schedule';
const permissions:Record<string,ApiPermission>={};
for(const [permission,names] of Object.entries({'layout.read':['connector.get','office.layout','room.layout'],'layout.write':['connector.segment','connector.set','connector.reset','room.bounds','room.place','card.place','management.relayout'],'host.read':['host.get','host.credentials'],identity:['avatar.list','engine.capabilities','system.info','auth.whoami','api.list','api.describe','api.docs','management.roles'],topology:['management.topology','management.activity','host.list'],relation:['management.request','management.bind','management.unbind'], 'employee.read':['card.profile','session.status','session.info','session.snapshot','session.activity','session.transcript','session.follow','session.queue','session.list','session.inbox'], 'employee.message':['card.initialize','session.open','session.send','session.enqueue','session.dequeue','session.interrupt'], 'employee.configure':['card.avatar','config.model','config.effort','config.thinking','config.fast','config.plan'], 'employee.create':['card.create'],'employee.delete':['card.remove'],workspace:['assets.tree','assets.children','assets.search','assets.file','workspace.list','workspace.read','workspace.write','workspace.mkdir','workspace.move','workspace.trash','workspace.restore','workspace.image','workspace.docs'],plugin:['plugin.call','plugin.describe','plugin.list'],schedule:[...PLAN_COMMANDS.map(command=>command.name),'schedule.schema','schedule.status','schedule.list','schedule.get','schedule.create','schedule.update','schedule.pause','schedule.resume','schedule.delete','schedule.preview','schedule.run','schedule.history','schedule.cancel','schedule.trigger']}))for(const name of names)permissions[name]=permission as ApiPermission;
for(const name of [...CONVERSATION_WORKSPACE_COMMANDS.map(command=>command.name),...CONVERSATION_CONTROL_COMMANDS.map(command=>command.name),'chat.create','chat.update','chat.delete','chat.mute','chat.list','chat.get','chat.history','chat.context','chat.file','chat.send','chat.post','channel.list','channel.get','channel.history','channel.timeline','channel.context','channel.message-post','channel.publish','channel.media-put'])permissions[name]='chat';
export const CLI_COMMANDS=DEFINITIONS
export const COMMANDS=DEFINITIONS.map(({cli,...command})=>({...command,readOnly:READ_ONLY_APIS.has(command.name),...(RETIRED_APIS[command.name]?{replacement:RETIRED_APIS[command.name]}:{}),permission:permissions[command.name]??'operator' as ApiPermission,target:command.name.startsWith('schedule.')?'schedule':command.name.startsWith('session.')||command.name.startsWith('config.')||command.name.startsWith('card.')?'session-or-employee':'request'}));
