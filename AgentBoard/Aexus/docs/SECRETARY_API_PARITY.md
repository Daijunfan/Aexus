# Secretary：Company / Messages / Plan 的完整管理 API

Secretary 是最高应用管理员。三个视图共享同一员工、工作区、会话、任务和认证 Core；秘书使用自己的 Agent key 执行管理，不把自身 key 换成用户身份。它管理软件与组织委派，不直接编辑 Aexus 自身项目源码。

## 任务处理入口

1. `auth.whoami` 确认真实身份；`api.capabilities` 获取全部注册命令、可调用状态、限制与替代入口。
2. `api.list {prefix,search}` 缩小目录；`api.describe {command}` 读取确切参数 schema。不要根据按钮文字猜参数。
3. 调用规范业务 API；使用查询返回的 ID、revision、文件 hash 和幂等键。
4. 通过同一查询回读结果；接受任务、上传开始、模型排队均不等于完成。

原生 `agents_company_documentation` 用于发现，`agents_company_api {command,args}` 用于执行。CLI 的 `agents api call COMMAND --args JSON|@file --json` 原样传输同一命令，没有第二套权限或 CRUD。原生写入遵循 Ask/Full access，planning 只读；审批等待后复核身份和当前任务。查询不运行模型、不伪造已读。

```sh
agents api capabilities --json
agents api list --prefix config. --json
agents api describe config.effort --json
agents api call config.get --args '{"id":"EMPLOYEE_ID"}' --json
```

## 三个视图的逐域操作对照

| 用户操作 | 规范 API | Secretary 实际边界 |
| --- | --- | --- |
| Company 切换视图、Team、搜索、画布与位置 | `view.*`、`team-view.*`、`group.*`、`office.*`、`room.*`、`canvas.*`、`card.place` | 全局应用范围；导航按客户端保存 |
| 创建、改名、资料、形象、克隆、删除员工 | `card.*`、`avatar.list`、`management.topology` | 所有职级；稳定 ID/引擎/工作区身份不靠更名改变 |
| 任命、降级、删除 Secretary/Governor 与管理关系 | `card.management-role`、`card.remove`、`management.bind/unbind` | 可管理全部职级；批量预检，必须保留一个 ready Secretary |
| 私聊、排队、停止、背景任务、审批、会话设置 | `session.*`、`approval.*`、`config.*` | 所有职级；busy/调度占用和原生执行模式仍检查 |
| Messages 全局群组/频道发现与历史 | `chat.list/get/history/context`、`channel.list/get/history/context/timeline`、`messenger.directory/search/gallery` | 无须先加入每个会话；读取不确认用户已读 |
| 群名、成员、Owner/Admin、禁言、静音、解散群组 | `chat.update/delete`、`conversation.policy/member/role/mute/silence` | 全局；actorRole 如实是 secretary，不伪装会话 Owner |
| 发送、附件、跨会话引用和转发 | `chat.send/post`、`channel.message-send`、`session.send/enqueue`、`messenger.reference/forward/forward-*` | 保留本人作者；转发幂等回执按 actor 隔离 |
| 修正已发布用户文字/标题 | `chat.edit` | 保留原作者、原任务；记录 editedBy 并校验 editRevision |
| 草稿、头像、分类、排序、收藏、归档与未读提醒 | `messenger.*` | 可管理共享应用偏好；不冒充用户亲自阅读 |
| 频道引擎、来源、订阅、头像、文章、保存、删除、导出、collector key | `channel.*` | 明确管理入口与来源范围；普通发布仍有真实来源/发布者 |
| 固定正文通知与每 N 篇文章触发成员提示词 | `conversation.notice-*`、`channel.post-trigger-*` | 全局治理；通知发布者必须是合法身份，创建者保持秘书；不混入 Plan |
| 全局文件库、预览、元信息、命名迁移、Finder | `assets.*`、`workspace.reveal` | 应用管理范围；路径/版本/软链接检查继续生效 |
| 所有员工/团队/会话根与成员目录的文件编辑、复制、恢复 | `workspace.*`、`conversation.workspace/workspaces/file/copy/transfer`、`transfer.*` | 管理所有工作区；固定成员目录身份保护、原件/同名保护仍生效 |
| 上传、下载与媒体预览 | `messenger.upload-begin`、`transfer.upload-*`、`transfer.download-*`、`messenger.media-*`、`channel.file-download` | principal/客户端绑定，不接管其他身份的进行中能力 |
| 为指定员工发现工作目录、下载发布附件 | `workspace.catalog`、`conversation.entry/download/download-status` | 可选择其他员工；目标仍须是真实成员/工作区，源文件保留 |
| 全局默认模型、思考、界面、引擎、主机、终端与插件 | `settings.*`、`engine.*`、`host.*`、`terminal.*`、`plugin.*` | 同一管理权限；外部登录/安装/连接必须真实成功 |
| 签发/撤销员工 key 与管理审计 | `auth.agent-token/revoke`、`administration.audit` | 签发只返回元信息给秘书；不返回别人明文key；最后ready管理员受保护 |
| Plan 全部任务、视图、规则、运行、历史与清理 | 下表的 `plan.*` / `schedule.*` | 所有职级含其他Secretary；孤立记录可管理，缺失目标不能运行 |

每条注册命令的完整参数和界面来源见 `api.describe` 与生成索引。`api.capabilities.callable` 是入口能力；文件、成员、修订、运行状态及外部服务在实际调用时仍重新验证。

## Coding Agent 思考与默认值

`config.get/effort/thinking` 接受稳定员工 ID 或 live session ID。关闭会话也可管理，不为了改配置开启模型轮次。非默认 effort 使用实际目标引擎模型目录，异步查询后重查配置和角色。忙碌或调度占用时拒绝变更。

```sh
agents config get EMPLOYEE_ID --json
agents config effort EMPLOYEE_ID default --json
agents config thinking CLAUDE_EMPLOYEE_ID off --json
agents api call settings.set --args '{"defaultCodexEffort":"default","defaultClaudeEffort":"default","defaultOpenCodeEffort":"default","defaultClaudeThinking":false}' --json
```

| 范围 | 行为 |
| --- | --- |
| 已有员工 | 配置保存到原员工；重开保持，`default` 明确清除覆盖 |
| 之后创建的全部职级 | 使用 defaultCodex/Claude/OpenCodeEffort 与 defaultClaudeThinking；显式创建参数优先，包括 false/default |
| 模型能力 | `engine.models` 的 supportedEffortLevels 是依据；支持时包含 none/minimal/low/medium/high/xhigh/max/ultra，不把所有档位假装适用于所有模型 |
| Claude | effort + thinking；实际兼容provider继续决定合法档位 |
| Codex/OpenCode | effort；无独立 thinking 开关 |
| Cline/Pi | 当前适配器未暴露 effort/thinking；请求不支持能力会明确失败 |
| 单次 Plan 任务 | action.effort/thinking 临时覆盖，结束恢复员工设置；省略是继承员工，effort:default 是该模型原生默认 |

Employee可配置自己，Manager可配置自己与本Team下属，Governor保留自己的管理范围，Secretary可配置全部角色。Settings的Employee defaults与Plan编辑器读取同一模型目录，不能从静态标签推断能力。升级不改已有员工的模型、思考或OS权限。

### Plan 最短闭环

先调用 `plan.query {}`，读取完整授权任务集，不因当前聊天对象而加上 `employee:self`。每行返回：

| 字段 | 含义 |
| --- | --- |
| `id`、`revision`、`name` | 真实任务 ID、当前修订和名称，可直接用于修改或删除 |
| `action` | 员工 ID、原引擎、任务正文、可选模型/思考覆盖、目标团队视图/发布频道 |
| `employee`、`target` | 当前员工姓名、职级、Team、引擎；目标删除时 `employee:null`、`target.exists:false`，未知旧姓名/职级为 null |
| `rule`、`timing` | 一次、间隔、按周、按月或事件规则、时区、工作窗口、截止时间及下一次运行 |
| `enabled`、`status`、`disabledReason` | 启用状态、计算状态及停用原因 |
| `allowedActions`、`blockedActions` | 当前调用者可用操作与拒绝原因；实际调用仍重新验证 |
| `lastRun`、`occurrences`、`maxOccurrences` | 最近保留执行记录、已领取次数和次数上限 |
| `plan` | 优先级、标签、备注与预计时长 |

顶层提供 `now`、`hostTimezone`、`total`、`offset`、`hasMore`、`counts` 和 `facets`。超过一页时继续增加 offset；默认100项，单页最多500项。`nextAt:null` 可以表示事件等待、暂停、完成或缺失目标，结合 status/rule/disabledReason 判断。

只查询用户明确指定的范围。引用当前已保存视图时，可先读取 `view.get`、`plan.views`，再把对应 filter/sort/direction 传给 plan.query；API 不假装知道另一客户端尚未保存的临时筛选。涉及未说明的筛选或同名任务时先列出候选。

```json
{"command":"plan.query","args":{"limit":100}}
```

拿到用户要求删除的确切任务后，调用原有批量入口，再查询确认。下面 ID 和修订只是参数示例，必须替换成实际查询结果。

```json
{"command":"schedule.delete","args":{"ids":["JOB_A","JOB_B","JOB_C"],"expectedRevisions":{"JOB_A":2,"JOB_B":1,"JOB_C":3}}}
```

批量删除最多100项；所有目标、权限、修订先整批校验。拒绝时不会先删除前几项。活动执行先取消；保留员工、工作文件及执行审计。接口不接受按名字模糊删除或隐式全部删除。响应丢失后先回查，不能把网络错误等同于操作未执行。

## Plan 操作对照

| 用户操作 | 规范 API |
| --- | --- |
| 列出任务、搜索、人员/Team/频道/状态/优先级/标签筛选、排序及分页 | `plan.query` |
| 查询合法目标、职级和调度参数 | `plan.schema`、`schedule.schema` |
| 查看完整编辑配置与修订 | `schedule.get` |
| 新建、表单创建、复制成新任务 | `schedule.create {spec,clientRequestId?}`；复制只复制可写 spec，不复制 ID/委派/运行次数 |
| 名字、任务正文、目标员工、模型/思考、发布频道、Governor 目标视图 | `schedule.update {id,patch,expectedRevision}`；提供 action 时传完整 action |
| 一次/间隔/周/月/事件规则、时区、窗口、截止、次数、超时和宽限 | 同一 `schedule.update`；移除可空的窗口/截止/次数使用 null |
| 优先级、标签、备注和预计时长 | `schedule.update` 的完整 `plan` 字段 |
| 日历/时间线一次性任务拖动改期 | `schedule.update` 修改 once rule；不把周期的单次预测伪造成独立任务 |
| 暂停、恢复、立即运行、取消一次运行、发出显式事件信号 | `schedule.pause/resume/run/cancel/trigger`；cancel 使用 run ID |
| 删除一个或多个确切任务 | `schedule.delete` 的 id/ids |
| 预览新规则或已有任务的草稿规则 | `schedule.preview {spec}` 或 `{id,patch?}` |
| 状态和历史 | `schedule.status/history` |
| Table/Board/List/Gallery 记录 | `plan.query`，布局由视图配置决定 |
| Calendar/Timeline/Planner、图表、活动流 | `plan.calendar/timeline/analytics/feed` |
| 保存、命名、布局/分组/筛选/排序/时区选项、删除用户数据库视图 | `plan.views/view-create/view-update/view-delete` |

来源为已删除员工的旧任务仍是可管理记录。Secretary 可列出、读详情、看保留历史、暂停、删除或编辑停用记录；改派时必须提交当前合法目标。记录访问和清理不放宽执行资格。Secretary 可给其他在职 Secretary 排期；缺失目标、无合法发布权限或运行条件不满足时仍拒绝执行。

## 保留的真实身份与设备语义

只有七条注册操作保留人类身份：`session.acknowledge`、`chat.acknowledge`、`channel.acknowledge` 是用户实际阅读确认；`ui.click/type/drag/wheel` 会从用户renderer产生身份行为。秘书以规范业务API完成相应管理，不能制造人类阅读或借设备事件伪装用户。文件选择、麦克风、剪贴板依赖设备提供字节/许可；API不虚构尚未上传的文件。

`auth.agent-token` 对Secretary返回签发元信息，不返回operator token或别人明文凭据。目标员工原生环境获取自己的受限key。`chat.edit.editedBy`、消息作者、conversation.audit与administration.audit保持真实actor。审计不保存token、正文或文件内容。

## 接口精简与兼容

不新增第二套 plan.task CRUD，不新增逐按钮 MCP。`management.request/decide/team/global` 与 `config.engine` 从默认发现移除，`--all` 返回替代入口。规范关系操作用bind/unbind，任免用card.management-role，已有员工编码引擎保持固定。

## 可重复验证与实际限制

`test/secretary-api-parity-test.mjs` 扫描renderer真实注册命令引用，逐条对照Secretary可调用集合；只允许上面七条有解释的例外和明确退休接口。生成 `artifacts/secretary-plan-api/gui-api-inventory.json`，记录源码文件和行号。所有payload必须可由通用CLI原样表示。

`test/secretary-administration-test.mjs` 使用临时状态和真实Core dispatcher验证真实身份、跨视图能力、关闭会话配置、默认值、非成员治理、资产、员工key元信息、任免及整批最后管理员保护、脱敏审计。`reasoning-defaults-unit-test` 验证默认和显式覆盖。`api-tool-boundary-test` 覆盖原生工作轮次、审批、planning及撤销。`secretary-plan-api-test` 连接确定性原生协议夹具，验证查询→修改→运行/删除→回读、peer任务与孤立记录，不调用收费模型。

静态可达性与模拟协议通过，不证明所有外部provider、云主机或真实浏览器设备都已实测。发布记录必须分别列出typecheck、行为测试、打包、安装和Git推送结果，不能把代码实现称作实际安装或保证绝对无缺陷。
