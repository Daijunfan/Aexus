# Secretary：Plan 与 GUI/API 对齐

## 任务处理入口

员工通过两个原生工具完成发现与操作：

- `agents_company_documentation`：真实身份、共享索引、Core 单命令 schema、插件单方法 schema。
- `agents_company_api {command,args?}`：以本人已绑定凭据调用现有 Core dispatcher。与 UI、CLI 使用同一业务实现和目标权限检查，无需 shell。

共享场景中的 `agents_company_discussion_post` 保留其窄范围发布用途；不把它作为通用任务工具。初始化仅允许读取身份和索引；静默阅读阶段不开放通用操作。查询不触发模型、任务或已读确认。修改遵循 Ask/Full access 和原生 planning 设置，批准后复核当前轮次与身份。

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

来源为已删除员工的旧任务仍是可管理记录。Secretary 可列出、读详情、看保留历史、暂停、删除或编辑停用记录；改派时必须提交当前合法目标。记录访问和清理不放宽执行资格。其他在职 Secretary 的任务仍受同级排期限制；不可运行的任务不会因为能查询到而获得运行权限。

## 其他界面对照

| 区域 | 规范入口与边界 |
| --- | --- |
| Company：Team、员工、形象、位置、关系、资料 | `group.*`、`card.*`、`office.*`、`room.*`、`connector.*`、`management.*`、`team-view.*`；保留职级与生命周期限制 |
| 私聊：发现、正文、排队、停止、设置 | `session.*`、`config.*`；使用真实稳定员工身份 |
| 群组、成员、禁言和固定通知 | `chat.*` / `conversation.policy/role/mute/silence/notice-*`；要求实际会话 Owner/Admin，Company Secretary 无豁免；解散要求 Owner；公开发言继续检查成员及委派 |
| 频道、发布引擎、来源、头像、管理员、订阅、文章 | `channel.*`；不冒充用户/其他作者，不绕过成员或发布身份 |
| 分类、排序、归档与偏好 | `messenger.*`；保留本人阅读与跨会话分享的用户专属边界 |
| 个人/共享/会话工作区 | `workspace.*`、`conversation.*`、`transfer.*`；不绕过本人目录、共享原件与其他成员目录的权限 |
| 设置、主机、后台终端 | `settings.*`、`host.*`、`terminal.*`；主机和原生引擎权限独立生效 |
| 插件 | 文档工具读 `plugin/ID/command/METHOD`，执行 `plugin.call {id,method,employee?/team?/workspace?,params}`，使用当前授权工作区 |

浏览器文件选择、麦克风、剪贴板、临时悬停和弹窗开关属于当前设备交互。持久化业务效果必须有 Core API；上传下载许可仍绑定客户端。Secretary 无法从未上传的浏览器文件取得字节，也不会模拟用户点击来绕过身份。

## 保留的用户专属边界

人类阅读确认、修改用户作者消息、跨会话引用/转发授权、用户/员工凭据签发与撤销、客户端上传下载/媒体许可、频道根目录原件导入（channel.file-download）、模拟用户点击以及 Secretary 任免保留既有限制。Secretary作为实际成员可以通过conversation.file维护会话根直属文件，仍不能修改他人成员目录；conversation.download可将已发布附件复制到本人选定工作区，区别于旧channel.file-download的共享根导入。权限、引擎执行许可、工作目录和成员资格不能通过通用工具自报；无权限时返回真实拒绝。

## 接口精简与兼容

不新增第二套 `plan.task-*` CRUD，不新增重复的逐按钮 MCP 工具。通用 CLI `agents api call COMMAND --args JSON|@file --json` 原样传输规范参数，涵盖未设置短标志的参数；Core 不存在嵌套 api.call 接口。

`management.request/decide/team/global` 与 `config.engine` 从默认 API 发现中移除，`--all` 返回替代指引。保留必要的旧协议兼容/明确拒绝，不偷偷改变旧调用含义。规范关系操作使用 bind/unbind，任免使用 card.management-role，已有员工编码引擎固定。

## 可重复检查

`test/secretary-api-parity-test.mjs` 对照 renderer 的注册命令引用、Secretary 能力、逐项例外、原始 CLI 参数以及插件目录。生成 `artifacts/secretary-plan-api/gui-api-inventory.json`，包含每条命令对应的源码文件和行号；没有解释的权限缺口使测试失败。

`test/coverage-test.mjs` 独立检查 UI→CLI→Core 分发覆盖，通用 api.call 仅按真实转发语义识别。`secretary-plan-api-test`、`secretary-plan-ui-test`、`api-tool-boundary-test` 和两组 `secretary-api-*-test` 验证运行行为、三项缺失目标记录的复现、实际原生工具调用、审批及并发修订边界。

静态可达性不等于每个外部服务已执行。所有开发测试使用临时状态；原生 Codex/Claude 测试连接本机确定性 HTTP 响应，Cline/Pi 使用注册协议夹具，不调用收费模型。安装结果和实际运行项目单独记录在 progress/Agents-company2.md 与 artifacts/secretary-plan-api/。
