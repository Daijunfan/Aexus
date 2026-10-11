# Agent 与 CLI 验收

## 2026-09-13 · 1.11.2 日历统一布局

复现了单日卡片按属性变高、跨日条独立排版，以及跨日条给整周单日事件增加顶部空白的问题。现在所有事件共用位置投影和 32px 事件条，日期格统一 200px 高；属性预览固定一行，空值和长文本都不改变几何尺寸。跨周事件在边缘标记接续。每日期最多显示四行，溢出通过当天明细查看；打印保留全部事件。

后台原生界面与实际 CLI 数据验收（没有运行脚本测试套件）：
- `.local-data/calendar-uniform-20260913/cases.json` 构造了 26 条真实数据库记录，包括 11 个实际选课节点、跨周、跨月、跨周跨月、午夜结束、十条同日事件、长标题和未排期记录。
- 9/17 单日事件与 9/19–20 跨日事件可同处第零行的不同日期列，不再给 9/17 增加五行空白。9/19 折叠一条，9/20 折叠两条；当天明细包含完整六条，含截止检查。
- 9/27–29 在周日和下一周周一/周二接续；9/30–10/3 连续跨月；9/28–10/5 在整周条和下一周周一接续。
- 9/30 20:00–10/1 00:00 只占 9/30。10/1 含两条跨日事件和十条单日事件，四条可见、八条折叠，明细返回完整十二条。
- 后台 AX 和截图检查了月视图、周视图、浅色、深色、统一属性摘要和当天明细；非法日期 2026-02-31 返回 INVALID_DATE。
- CLI `view.render` 新增 `weeks.events/totalSlotCount/visibleSlotCount/hiddenByDate`，与 UI 共用算法；原有跨日 `segments/slotCount` 语义保留。`ui.command calendar-day` 提供当天明细的开关，`close-dialog` 也可关闭。

参考交互说明：https://www.notion.com/help/calendars 。详细资料和提醒仍通过记录页查看；此次布局修改不改动实际选课日期与提醒。

## 2026-09-13 · 安装版恢复、真实选课任务与界面修正

安装版原为 1.10.0，直接 spawn claude，在 Finder 的 PATH 下报 ENOENT。官方 SDK 内置 CLI 已在实际安装版运行，原生版本 2.1.269，实际课程会话 7047181b-3241-4970-b591-cf04ad4ead52。另确认裸 `command: claude` 在 PATH 仅 /usr/bin:/bin 时可经登录 shell 解析为用户可执行文件。修复旧数据 pie 视图阻塞所有提交的问题，仅加载/备份恢复时迁移为 donut，新写入仍校验合法枚举。

实际“选课” Workspace 3688aa06-bdce-4384-8def-4464588c7d2d 的原图和两份 PDF 已由 Claude 读取并通过 CLI 写页。应用中用户补充“网安专硕”后，已处理该队列消息并定位 085412、专业方案 72–77 页。最终保留 11 个节点、24 条启用提醒、一个内联数据库的五种视图；法硕补充批和高年级提前批不进入有效日程。逐项核对北京时间，含 9/20 与 10/11 16:30 截止前提醒。10/10 09:00 是照片给出的学校时刻，9/24 和 10/12 09:00 是个人提醒。三个原文件 SHA-256 与修复前备份一致。证据：`.local-data/course-recovery-20260913/final-data-audit.json` 与 `completed-course.mininotion`。原始安装包和完整备份均保留。

本次采用逐条真实 CLI/原生引擎操作、持久化数据回读、后台 AX/截图目视检查；没有运行传统脚本测试套件。隐藏验收副本验证了封面与图标间距、无图标侧栏、日历跨日条目、看板分组；1.11.1 进一步验证周计划从周一完整排列、空栏紧凑、数据库页头收紧、时间线短条外置标签和深色对比。后台原生点击/滚动会被工具的焦点保护拒绝，因此使用应用自身公开 CLI 切换视图，再人工检查后台画面；不前置用户窗口。

队列/日志真实验收位于 `.local-data/queue-refinement-20260913`，Workspace 874fe182-f131-4e56-8528-b150a7674b63：
- FIRST_DONE 后 SECOND_AUTO 自动追加，队列清空。
- 已停止、queuePaused=true 后重新发送任务：RETRY_DONE 后 RETRY_QUEUE_AUTO 自动追加，无需手动运行队列。
- 运行中立即停止，保留排队的 PENDING_SURVIVES_STOP；重新发送后顺序为 RESUMED_WORK_AFTER_ACTIVE_STOP、PENDING_SURVIVES_STOP，取消任务的 CANCELLED_NOW_SHOULD_NOT_EXIST 未写入。
- 一次较早的 30 秒取消场景因操作晚于完成而未测到取消，不作为取消成功证据；其 SHOULD_BE_CANCELLED 历史段落保留。
- 原始日志存在 592 条 thinking_tokens，标准会话记录中为零；原始日志完整保留。实际课程旧日志有 16,475 条该事件，现从标准历史中过滤后再分页，避免吞没有效消息。CLI text 模式输出动作摘要，JSON/原始接口仍保留详情。

API 实际验收副本 `.local-data/course-api-acceptance-20260913`：中文属性名称经 record.create stdin JSON 落为 date/status ID；未知属性和 ID/名称重复赋值明确拒绝；record.bulk 中文名称更新成功，日历回读在 9/19、9/20 两天呈现同一跨日记录。

## 2026-09-13 · Codex 文件差异撤销（后台验收）

原生 thread/rollback 仅回退会话历史，明确不恢复文件。因此新增 agent.revert，使用当前会话实际记录的回合差异，在 Workspace OS 沙箱内执行 Git 反向检查/应用。默认预览，--apply 执行，可指定单个文件；UI 的每轮最终差异提供同一预览与撤销入口。逐次工具操作不显示这个按钮，避免把一次工具操作误当作整回合差异。当前仍保留会话和页面历史。

真实记录与落盘验证：
- 中文、空格、引号文件：预览不改文件。加入用户后续修改后，应用返回 canRevert=false，后续内容保留。恢复匹配内容后，成功还原为「旧行／保留行／末尾」，其他文件不变。
- 撤销原生新建文件的回合，文件和 UI 文件记录均被移除，旁边 parallel-a.txt 保持 ALPHA-17。
- 真实 Agent 在同一回合改动 revert-first.txt 和 revert-second.txt。给第二个文件加入后续修改后，整回合撤销失败，第一个文件也未被部分撤销；仅选第一个文件撤销成功，第二个仍为 USER_SECOND_EDIT。
- 其他会话访问该回合得到 TURN_NOT_FOUND；Plan 模式可预览但拒绝应用。执行模式已恢复。
- 修正 file.write-content 的响应时间戳：返回记录、持久化记录和真实文件 mtime 相同。
- 文件扫描、内容写入、文件恢复不再被当成可以只反转页面元数据的撤销操作。旧记录保留，但 history.operations 标记 reversible=false，UI 禁用按钮，显式请求返回 NON_REVERSIBLE_OPERATION；永久删除也不可通过页面历史伪恢复。

证据位于 `.local-data/parallel-acceptance-20260912/`：revert-unicode-preview.json、revert-conflict-readback.json、revert-success-readback.json、revert-created-readback.json、revert-pair-conflict-readback.json、revert-pair-selected-readback.json、file-write-accurate-readback.json、revert-history-flags.json。生产构建通过，未显示窗口或运行传统测试套件。

此能力限于原生记录中可反向应用的差异。没有完整二进制内容或差异上下文不匹配时，不会伪造恢复成功；通用快照恢复、重做和新 UI 的手工验收仍需继续完成。

## 2026-09-13 · 原生目录分页

Codex 初始化模型目录、agent.capabilities 和 /mcp 现在通过共享 allPages 消费 nextCursor，直到原生服务明确结束，不再把第一页当成完整目录。底层 agent.control 的分页行为保持不变。

逐条调用真实 model/list（limit=1），第一页返回 gpt-5.6-sol/游标 1，第二页返回 gpt-5.6-terra/游标 2。完整能力查询返回当前五个模型；MCP 完整查询返回六个服务，nextCursor=null。证据在 `.local-data/parallel-acceptance-20260912/` 的 models-page-one.json、models-page-two.json、models-all-pages.json、mcp-all-pages.json。当前目录少于默认页大小，没有以这组数据声称已完成超过 100 条目录的 UI 验收。生产构建通过，未运行传统测试套件或显示窗口。

## 2026-09-13 · Codex MCP OAuth（后台协议验收）

新增服务器登录/重新授权界面，调用原生 mcpServer/oauth/login，正确绑定当前 threadId，展示 authorizationUrl 并监听 mcpServer/oauthLogin/completed；等待期间禁止重复启动，用户可停止会话来取消等待。链接仅在点击时打开。Codex 进程参数及线程配置固定 mcp_oauth_credentials_store=file，使用本 Workspace 的 CODEX_HOME，避免写入全局钥匙串。

用本机官方 MCP SDK 的 DemoInMemoryAuthProvider、授权路由、Bearer 验证和 HTTP MCP transport 构造本地服务。该服务只用于验收，不含真实账户。通过 HTTP API 完成动态注册、授权码、PKCE、令牌交换和本地回调，未打开浏览器。原生回调为 200，授权前 authStatus=notLoggedIn/零工具，授权后获得 oauth_proof。

真实试验发现并修复两点：授权后列表保留旧失败状态；正在使用的原生会话未刷新 MCP 连接，模型仍收到 Auth required。现在授权完成会清除相应状态并重载运行配置，后续查询和执行等待重载；同 Workspace 的其他已连接会话也同步刷新。

复验：
- 全新根 1b33bf07-587e-49a1-b7ca-1d6397d91387 完成授权后，不手动重载，真实 Agent 成功调用受保护工具，并通过自己的 CLI 写入主页面「自动 OAuth 验收：LOCAL_MCP_OAUTH_OK」，回复 AUTO_OAUTH_DONE。
- 并行根 dc2644c8-3b8d-4368-bb30-4b268415e273 的两个会话最初均未登录；在 A 授权后，B 自动变为 ready/oAuth 并可调用工具，返回 LOCAL_MCP_OAUTH_OK。
- 重启后仍从私有文件读取授权，服务为 ready/oAuth，工具保留。凭据位于各自 .mininotion-runtime/codex/.credentials.json，权限 600。
- 取消等待后，迟到的授权回调连接得到 ECONNREFUSED，证明会话停止已关闭回调监听。

证据位于 `.local-data/mcp-oauth-acceptance-20260913/`：effective-config.json、authorization-result.json、fresh-before-auth.json、final-readback.json、parallel-a-before.json、parallel-b-before.json、parallel-b-after.json、after-restart.json、cancelled-callback.json 与 calls.jsonl。首轮必须手动重载的失败也保留在 after-failed-tool.json，不能作为成功证据。验收 HTTP 服务已关闭；重跑 server.cjs 会生成新 endpoint.json，需更新验收配置中的 URL。

生产构建通过。这证明本地 OAuth 协议及真实 Agent 工具链，不代表浏览器登录界面已手工验收；Claude 专用 MCP 登录及其他剩余功能仍未完成。

## 2026-09-12 · MCP 补充信息表单（后台验收）

现有 SDK 转发已保留，新增专用 elicitation 界面：按 requestedSchema 显示日期、文本、数值、布尔和枚举字段；复杂 schema 保留 JSON 输入；URL 模式只显示用户可点击的验证链接，不自动打开。所有回答通过同一个 agent.respond，支持 accept/decline/cancel。取消记录显示 stopped；停止连接时也为 elicitation 返回正确的 cancel 格式。Claude SDK 的 AbortSignal 已接入，并在回答后移除监听。

通过官方 MCP SDK 的真实 confirm_plan 工具发送表单：date、sessions（整数 1–5）、reminder（布尔）、priority（枚举）。Codex approval=never 时原生自动 decline；改为 on-request 后才发出 mcpServer/elicitation/request，行为遵循原生审批配置。Claude 先请求工具审批，批准后发出 elicitation。

两种引擎接受同一回答 `{date:"2026-09-21",sessions:3,reminder:false,priority:"high"}`，MCP 端日志完整保留数值与 false 类型；Agent 经自己的 CLI 将该 JSON 追加到各自主页面。再次调用后，Codex 明确收到 cancel，模型报告取消，页面块前后相同。证据：`.local-data/parallel-acceptance-20260912/elicitation-accepted-pages.json`、`elicitation-cancel-timeout-readback.json` 及各 Workspace 的 mcp-form-responses.jsonl。

短超时反查：将测试服务的 elicitation 请求期限设为 1.5 秒，Claude 报告 MCP -32001 timeout，没有修改页面。但该原生 CLI 没有触发已接入的取消信号，表单仍待回复；已通过 agent.respond 显式取消并恢复正常测试配置。不能把此超时自动清理计为通过，也没有依据模型回合结束就自动取消可能独立存在的 MCP 请求。该项需继续解决或明确原生协议能力边界。

生产构建通过；真实表单填写、URL 验证和完整 OAuth UI 仍未手工验收。本批没有打开窗口、浏览器或运行传统测试套件。

## 2026-09-12 · MCP 配置与真实工具调用（后台验收）

新增 MCP 配置编辑入口，直接复用 agent.configure：Codex 使用 config.mcp_servers，Claude 使用 sdk.mcpServers。可新增/编辑/移除配置；Codex 可启停并重载配置，Claude 使用官方启停与重连接口。配置编辑保留 before 快照，使用已有三方合并机制避免覆盖 CLI 同期修改。连接中自动刷新，空闲时配置或运行状态变化会重新查询，停止状态不会被自动重连。

修复 Codex 服务列表范围：mcpServerStatus/list 现在绑定当前原生 threadId；启动状态和错误来自真实 mcpServer/startupStatus/updated，OAuth unsupported 不再被误作连接状态，显式 enabled=false 显示 disabled。重载保留未变化服务的已知状态，已移除服务器不再从旧事件重新添加。

使用本机官方 @modelcontextprotocol/sdk 1.30.0 构造实际 stdio MCP 工具 next_workdays。它计算工作日而不是返回硬编码 Agent 回复，并在执行目录记录调用参数。Codex 根 d5fe2827-2858-474a-a85f-39cd02bd43a0、Claude 根 35818559-db5b-453a-b05d-1028c2fba266 都实际调用 startDate=2026-09-18/count=3，得到 9 月 18、21、22 日，再经自己的 mininotion CLI 将三个日期写入主页面。原生工具记录、MCP 服务调用日志和数据库段落一致，分别返回 MCP_CODEX_DONE / MCP_CLAUDE_DONE。Claude 的 MCP 调用先停在真实审批，指定请求批准后才执行。

进一步逐项验证：
- Claude 停用后 disabled/零工具；启用、重连后 connected/一个工具；停止整个 Agent 再连接，停用状态仍保留。
- 两种引擎移除配置后，工具服务不再出现在列表中。Codex enabled=false 明确显示 disabled/零工具。
- 同时加入不存在的 acceptance_broken 可执行文件，Codex 返回 failed 和 os error 2，Claude 返回 failed 和 ENOENT；正常服务仍可连接。故障配置已清理，正常配置已恢复。
- Codex 原生 config/mcpServer/reload 成功，重载前后正常服务均为 ready 且保留 next_workdays。原生查询较慢时等待原请求，没有因等待而重启。

证据在 `.local-data/parallel-acceptance-20260912/`：`mcp-tool-page-readback.json`、`mcp-codex-list.json`、`mcp-claude-disabled.json`、`mcp-claude-reconnected.json`、`mcp-codex-removed.json`、`mcp-claude-removed.json`、`mcp-codex-failure.json`、`mcp-claude-failure.json`、`mcp-codex-disabled-labelled.json`、`mcp-claude-disable-reconnect.json`、`mcp-final-before-reload.json` / `mcp-final-after-reload.json`。生产构建通过；没有显示测试窗口或运行传统测试套件。配置编辑、自动刷新和服务控件的实际 UI 手工验收，以及 MCP OAuth、插件安装/卸载等剩余功能仍未完成。

## 2026-09-12 · Codex 原生审查与文件定位（后台验收）

新增 `agent.review` 与 `/review` 目标选择界面：未提交修改、基准分支、指定提交、自定义要求；支持 inline 与 detached。独立审查使用独立运行连接，原生返回 reviewThreadId 后后续指令、控制与恢复均绑定审查线程。高级 `agent.control review/start` 也经过相同分发，避免覆盖原聊天身份。

在独立根 `02aadccd-a631-4170-8572-87aa4b8d99a1` 构造有明确语义的 Python 折扣函数：基准使用减法，故意将其改为加法。四种目标均完成真实审查并指出 discount.py 第 3 行 P1 错误。未提交审查、提交审查、分支比较各有独立原生线程；自定义审查在原聊天中执行。基准分支 acceptance-baseline；错误提交 7c886ffede10b3332316abea6d314da88e9f2f81。审查期间工作树未被修改。

随后选中原聊天，却向提交审查会话 `f41b0e7b-f3e8-4d54-9ec7-54041d19817e` 发送修复请求。它正确继承审查上下文，恢复减法，直接验证折扣结果，并用自己的 CLI 在主页面追加「审查修复验收：100打九折为90」。读回代码和页面块均正确；回复 REVIEW_FIX_DONE 未混入原聊天。原生 thread/read 返回的 ID 与 review/start 返回的 child ID 一致。证据：`review-four-targets.json`、`review-source-while-detached.json`、`review-child-native-read.json`、`review-fix-readback.json`、`review-source-after-fix.json`。

新增 `file.resolve` 同步并定位本 Workspace 文件及行号，UI 审查链接可打开文件预览并突出对应行。CLI 的统一 path 展开原先破坏 file:// URL，已为文件引用保留原始值。绝对路径、相对路径、file://、asset:// 及中文/空格/引号编码均定位成功；相邻 Workspace 路径被 SPACE_ACCESS_DENIED 拒绝，行号 0 被拒绝。证据：`review-file-resolution.json`、`review-unicode-file-link.json`。实际 UI 点击尚待验收。

停止审查时发现并修复真实 EPIPE 崩溃：原 stdin error 无监听会结束整个服务。现在将管道失败转为引擎失败、立即拒绝关闭连接的新 RPC，主动停止时保留 stopped 语义。复验停止返回 stopped=true，服务 PID 56244 保持存活，审查会话 stopped；随后恢复同一原生会话并返回 REVIEW_CANCEL_RESUME_OK。首次失败在 service.log，成功证据为 `review-interrupt-fixed-start.json`、`review-interrupt-fixed-state.json`、`review-service-after-stop.json`、`review-cancel-resume.json`。

以上均为后台真实引擎/CLI/落盘读回，未运行传统测试套件或显示测试窗口。生产构建通过；新增审查选择、文件行号跳转仍需手工 UI 验证。Codex 文件接受/拒绝和恢复等剩余能力没有因此计为完成。

## 2026-09-12 · 应用委托与进程边界（后台验收）

UI 连接重新尝试只读 `cua.getState`，10 秒超时；没有显示或切换窗口。继续核对沙箱时，依据官方 [sandbox-runtime 实现](https://github.com/anthropic-experimental/sandbox-runtime/blob/main/src/sandbox/macos-sandbox-utils.ts) 和本机 SDK 的 allowAppleEvents 说明，补上 appleevent-send、lsopen、相关 Mach 服务的拒绝规则，并将 signal、mach-priv-task-port 限定为 same-sandbox。应用委托会使新进程脱离原沙箱，不能只依赖 file-write 拒绝规则。

通过真实 Codex command/exec 运行只读原生权限检查器；它使用 WebKit 声明的 [sandbox_check SPI](https://github.com/WebKit/WebKit/blob/main/Source/WTF/wtf/spi/darwin/SandboxSPI.h)，并用 kill(pid, 0) 探测权限，不向其他进程发送实际信号，也不尝试打开应用。实际结果：appleevent-send、lsopen、两个相关 Mach 查询均为 1（拒绝）；Workspace read/write 为 0（允许），外部 write 为 1；同沙箱父进程零信号探测为 0，沙箱外服务进程为 -1 / EPERM。证据：`.local-data/parallel-acceptance-20260912/sandbox-runtime-probe.json`。

两种真实引擎在新规则下读取既有文件成功，分别返回 SANDBOX_CODEX_OK ALPHA-17、SANDBOX_CLAUDE_OK DELTA-43。Claude 原生 stopTask 也能停止同沙箱后台任务 b1w92wda7，收到 killed/stopped 通知。生产构建通过。权限查询不等同于实际 UI 打开尝试；本批刻意不做会打扰用户的应用启动验证。

## 2026-09-12 · 文件差异文本投影（后台验收）

新增共享 `projectAgentDiff` 和 `agent.diff` API，`/diff` 与 UI 使用同一输出。Codex 同一回合多次 turn/diff/updated 取最后一份，逐次工具操作保留在独立列表，不混合重复计数。统一差异提供增删类型、修改前后行号和原始文本；Claude Write 展示写入内容（不伪造未提供的原文件），Edit 展示替换片段。可按文件路径/修改内容搜索，界面可切换汇总和逐次操作并刷新。

真实 Codex 用 apply_patch 创建 `差异 空格"验收.txt`，写入「旧行／保留行／末尾」，下一轮替换第一行并删除第三行。CLI 投影返回原样文件名；最终差异依次为 -旧行（旧行号 1）、+新行（新行号 1）、保留行（2/2）、-末尾（旧行号 3），物理文件为「新行\n保留行\n」。17 个真实汇总通知折叠为 4 个回合记录。逐次操作保留真实 turnId 和新建/更新类型。

真实 Claude 用 Edit 将附件文件中的 ORIGINAL_CHECKPOINT_TEXT 替换为 EDITED_CHECKPOINT_TEXT；`agent.diff --query EDITED_CHECKPOINT_TEXT` 返回恰好对应操作、before/after 和 done 状态。`agent command --text /diff` 返回相同结构。

证据位于 `.local-data/parallel-acceptance-20260912/`：`diff-codex-projection.json`、`diff-unicode-created.json`、`diff-unicode-updated.json`、`diff-unicode-lines.json`、`diff-claude-edit.json`、`diff-claude-command.json`。生产构建与 diff 检查通过；新增差异界面的手工 UI 验收仍未完成。差异记录描述历史操作，不等同于当前磁盘净变化，也不代表接受/拒绝和 Codex 文件恢复已完成。

## 2026-09-12 · Claude 文件检查点恢复（后台验收）

- 将 UI 用户消息 ID 直接作为官方 SDK 的 user-message UUID 发送，并保存 engineId。新增 `agent.rewind PAGE_ID MESSAGE_ID`（默认 dryRun）和 `--apply`；`/rewind` 打开文件检查点列表，消息行提供预览和恢复入口。恢复调用官方 rewindFiles，成功后经 space.sync 更新 UI 文件记录。
- 在 Claude 根 `5eb43db2-74ae-4701-ad2e-e85117aa90d0` 创建原文文件和旁边的保留文件。文件 ID `173837fa-8c71-47f7-8dae-9c84d3b3fc14` 通过附件传入原生 Read/Write；真实 Agent 写入 CHANGED_BY_AGENT。消息/原生检查点 ID 均为 `078633b1-a6fc-4f22-9749-174ff5644ef1`。首次只给显示文件名的请求找不到 UUID 物理路径，未产生修改；随后附件传入正确路径，实际成功。
- dryRun 返回恰好一个文件、插入/删除各一行，预览后文件仍为修改后的内容。apply 返回 canRewind=true / skippedLinks=0；直接读回 ORIGINAL_CHECKPOINT_TEXT、bytes=24，保留文件为 KEEP_UNCHANGED，页面块前后相同。
- 指定另一个会话恢复该消息，得到 CHECKPOINT_NOT_FOUND。服务重启后检查点仍可预览并恢复 CLI 的后续改动。
- 另一会话主回复 idle、但后台任务 bguvtoc5i running 时，恢复返回 AGENT_BUSY，目标文件保持 MANUAL_AFTER_RESTART；停止后台会话后才恢复为原文。保护覆盖整个 Workspace，避免并行执行与恢复相互覆盖。

证据在 `.local-data/parallel-acceptance-20260912/`：`rewind-preview.json`、`rewind-applied.json`、`rewind-readback.json`、`rewind-after-restart-preview.json`、`rewind-concurrent-before.json`、`rewind-after-restart-applied.json` 和 `rewind-after-restart-readback.json`。构建通过；新控件尚未完成实际 UI 交互验收。此操作只恢复官方 CLI 跟踪的文件，不代表页面数据库撤销、Codex 文件恢复或完整修改审阅已完成；旧版没有保存原生消息 ID 的历史暂不提供此入口。

## 2026-09-12 · 账户与认证（后台验收）

新增账户面板和 `/account`：Codex 的账户、各模型额度窗口、重置时间、API Key、ChatGPT OAuth、设备码、取消登录和退出登录均调用现有 `agent.control` 原生 API。只有用户点击链接才打开浏览器。Claude 读取官方 SDK 的 accountInfo 与结构化 usage，显示认证来源、会话费用、工具改动和可用额度；独立 Claude OAuth 登录交互仍未实现，不能声称与插件完全齐平。

在独立根页面 `e862be87-681d-4d0f-be3d-d18973aca907` 逐条执行真实协议：

- 使用明确无效的验收 API Key 验证原生凭据写入和 account/read 的 apiKey 类型；没有用该 Key 发模型请求，不证明该 Key 可调用模型。
- logout → stop → 新连接 account/read 返回 account=null。修复了重连再次导入全局凭据的问题：`.auth-initialized` 使凭据只在空间首次使用时导入。
- OAuth 返回 auth.openai.com 登录地址，cancel 返回 canceled；设备码返回 verificationUrl、userCode、loginId，并已取消。没有打开浏览器，没有完成真实账号授权，因此 OAuth 完整登录成功与界面交互仍待验收。
- 发现并修复多连接认证缓存：一个会话退出时，另一个进程原先仍返回旧账户。登录切换/退出现在使本 Workspace 其他连接和执行失效，更新账户变更状态；复验另一个会话返回 account=null。
- 全局 `~/.codex/auth.json` 前后 SHA-256 相同。所有修改仅在验收 Workspace 的私有运行目录。真实现有 Codex 账户与额度查询、Claude apiKeyHelper 来源与会话用量读取均成功。

证据位于 `.local-data/parallel-acceptance-20260912/`：`account-after-reconnect.json`、`oauth-start.json` / `oauth-cancel.json`、`device-start.json` / `device-cancel.json`、`account-other-session-after-logout.json`（旧缓存问题）、`account-shared-before.json` / `account-shared-after-fixed.json`、`global-auth-after.json`、`account-codex-limits.json` / `account-claude-limits.json`。认证验收根保持未登录，无待处理登录流程。生产构建通过；账户面板尚未完成后台手工 UI 验收。

## 2026-09-12 · 后台多会话验收

本批在 `.local-data/parallel-acceptance-20260912/` 执行。全部为真实 CLI 引擎、逐条 CLI 操作和文件/数据库读回；遵守用户要求，没有打开、显示或切换测试窗口。以下不代表新增会话标签的视觉与手工交互已通过。

- Codex 根页面 `a92cff94-aac6-4510-b923-e56e94388df5`：A (`default`) 实际等待 90 秒；B (`01eaaca1-ce03-4143-8ad8-d7f41242dc73`) 同时写文件/页面。最终根页面分别包含 `BETA-29`、`ALPHA-17`，对应文件内容一致。A 的排队后续独立创建 `parallel-a-queued.txt = A_QUEUE_ONLY`。运行中来回切换不会断开连接；后台 A 修改 `focusView` 不改变 B 的配置。
- Claude 根页面 `5eb43db2-74ae-4701-ad2e-e85117aa90d0`：C (`default`) 与 D (`8d89a9b1-7eaa-43f3-9239-f9f849c6aa09`) 同时运行；最终文件和页面分别为 `GAMMA-31`、`DELTA-43`。逐个读取四份完整日志，各自只含自己的稳定 conversationId 和原生 sessionId。证据：`overlapping-state.json`、`data-readback.json`、`log-readback.json`。
- 独立权限：Plan 会话 `608d952c-e39f-4d62-aba3-92608b257f67` 在后台运行时，CLI 页面更新得到 READ_ONLY，文件写入得到 Operation not permitted；选中 Plan 后，后台 B 仍能写自己的文件和页面图标，更新 Claude 根页面被 PAGE_NOT_FOUND 拒绝。图标已恢复。证据：`background-plan-denied.json`、`background-agent-scope.json`。
- 关闭 C 时，其 `bmqxi94vk` 后台任务已经开始，排队消息仍未执行。关闭后任务 stopped、队列 paused，D 返回 `D_STILL_WORKS / DELTA-43`。97.689 秒后禁止写入文件仍不存在。重开 C 保留原生 ID，并返回 `C_REOPENED / GAMMA-31`；旧队列仍暂停。证据：`closed-c-sessions.json`、`closed-c-delayed-check.json`、`reopened-c-history.json`。
- 根页面移入回收站：C 与 D 的主回复均 idle，但 `bq01uesol`、`b1z2iudk7` 两个后台任务 running。移入回收站后两会话与任务均 stopped；132.478 秒后两个目标文件均不存在。已恢复根页面。证据：`two-background-tasks-before-trash.json`、`two-background-tasks-after-trash.json`、`two-background-tasks-delayed-check.json`。
- 重启和分支：服务重启后保留所有会话；从 A 建立的分支得到原生 ID `01a095b7-f465-7971-9f04-70880d312c00`，无工具调用即准确回答 `ALPHA-17 / A_QUEUE_ONLY / FORK_A_DONE`。恢复 A 后原生 ID 保持 `01a095ae-ff67-7a13-a74d-bfffd9f0e18f`，完整历史没有 FORK_A_DONE。旧 SDK 验收数据的 69 条历史成功迁移读取，末尾图片识别段落保留。证据：`fork-a.json`、`original-a-history-after-fork.json`、`legacy-sdk-history.json`。
- 审批：选中 D 时，C 的 Write 请求 `f13df309-8e66-480d-9b27-8ea728712b5e` 保持等待，文件不存在。指定 D 回答该请求得到 REQUEST_NOT_FOUND；指定 C 后才创建 `approval-c.txt = APPROVAL_C_ONLY`，返回 C_APPROVED。临时修改的验收 Workspace 权限配置已恢复，未修改全局配置。证据：`approval-c-before.json`、`approval-c-after.json`。
- 永久删除发现并修复实际缺陷：原清理可能与 CLI 退出写入竞争，错误又被吞掉，留下私有运行目录和日志。现在统一在数据提交中回收被删除 Workspace 的所有连接，终止引擎进程，再删除物理目录和全部会话日志；batch、workspace.patch 同样经过此处。清理错误不再静默忽略，`space.purge` 可重试清理已删除空间，拒绝清理仍存在的页面。复验根 `c29df231-adc2-484a-9cd4-746ec6deed33` 在两会话存在实际后台任务、一会话仍 running 时永久删除，目录和日志立即消失；117.719 秒后仍不存在。初次失败保留在 `purge-immediate.json`；成功证据为 `purge-fixed-before.json`、`purge-fixed-immediate.json`、`purge-fixed-delayed.json`。两个临时删除验收根均已清理。

- 主回复 idle 时中断后台任务：Claude 的 `bv56qpny0` 已实际启动 120 秒延迟写入，主回复为 BACKGROUND_READY。发送 `delivery=interrupt` 后任务 stopped，后续队列被消费并回复 IDLE_INTERRUPT_FOLLOWUP_OK；125.208 秒后禁止写入文件仍不存在。证据：`idle-interrupt-before.json`、`idle-interrupt-readback.json`。早先前台 sleep 被原生工具拒绝的尝试不作为停止通过证据。

新增会话标签、独立草稿、未读提示、关闭/重开控件，以及后台任务 idle 时保留停止按钮，均已通过生产构建；仍需在不打扰用户的条件下完成实际 UI 复验。此批尚未重新打包为最终 `.app`，不能用之前的打包验收代替。

## 2026-09-12 · 1.11 实际场景验收（进行中）

本轮以真实 Codex App Server、Claude Agent SDK、实际 CLI 命令、持久化数据检查和桌面交互验收为准。没有运行传统测试脚本替代用户要求的实际验收。下方 1.10 的脚本结果是历史记录，不能证明本轮功能通过。

验收数据与证据保存在 `.local-data/acceptance-20260912/`；Claude 连接排查使用 `.local-data/claude-diagnostic-20260912/`。未使用正式笔记数据。

| 场景 | 已观察到的结果 |
| --- | --- |
| Codex 原生文件编辑 + CLI 主页面编辑 | 写入 `验收证明.md` 并追加主页面段落；分别读回物理文件和页面块，内容一致。 |
| Claude 原生 Write/Read + CLI 页面编辑 | `claude验收.md` 与主页面段落均成功；实际读取确认。修复了系统 DNS socket 及 Claude 专用临时目录造成的运行失败。 |
| 附件生成计划 | `evidence/秋季发布计划.md` 定义五项任务、具体时间、跨午夜、全天、未排期、两条提醒和五种视图。真实 Codex 创建后，直接读取 `workspace.json` 核对五条记录、正文和 UTC 提醒时间。 |
| 视图精确性 | 发现旧 API 静默接受 `planBy`、`timelineBy`。新增完整字段说明、未知字段拒绝与 `view.update --unset`。Agent 已修正为 `calendarBy=date`；五种视图、五条任务、两个提醒保留，读取投影确认日期字段。 |
| 综合页面 | CLI 显示今日任务、未来事项和提醒；跨日回归落在 9 月 14、15 日两个日期格。首次手动打开桌面主页，确认综合日程控件和源页面待办可见。 |
| 提醒真实投递 | 使用正式 `scheduler.run --at` 分别推进到 `2026-09-13T00:45Z`、`2026-09-14T06:30Z`；收件箱写入正确事项、文字及来源页面。相同时刻再次执行，新增通知为零。 |
| 模型切换 | 共享斜杠命令切换为 `gpt-5.6-terra`、low；真实短请求及原生 `thread/settings/updated` 确认实际模型和强度。 |
| 分支与恢复 | 分支获得新原生 thread ID，准确复述此前内容；恢复原会话后只出现原用户消息和回答，分支消息没有混入。 |
| 精确 CLI 修改 | 页面包含加粗、红色、链接、嵌套待办和代码块；修改嵌套段落、勾选、字体/宽度并添加块评论。直接读取数据库确认目标变化及其他富文本保留。 |
| 失败事务 | batch 先修改标题块，再修改不存在的块；返回 BLOCK_NOT_FOUND，持久化标题仍为原文。 |
| 文件边界 | 真实 Codex `command/exec` 尝试写入 Workspace 之外，返回 Operation not permitted，目标文件不存在；连接无范围主 socket 失败。 |
| 页面边界 | 固定空间 gateway 收到无 token 的跨空间更新，返回 PAGE_NOT_FOUND，另一主页面未改变。错误响应附带全库的旧问题已修复；再次发送同一越界请求，响应只有 JSON-RPC 错误和修订号，没有 workspace 数据。 |
| 停止执行 | `sleep 60; 写入文件` 首次暴露独立终端进程遗留。改为先终止工具/终端进程树，再中断关闭引擎；第二轮在工具确实开始 sleep 后停止，120.5 秒后物理目标文件仍不存在，状态为 stopped。 |
| Plan 只读 | 切换 /plan 后，原生 command/exec 在本 Workspace 内创建文件也被系统拒绝；固定身份 gateway 的 block.append 返回 READ_ONLY。随后恢复 Agent 模式。 |
| 真实审批 | Claude 设置 permissions.ask=[Write] 后请求停在审批，目标文件不存在；agent.respond 批准后才创建，读回为「人工审批成功」。 |
| Thinking 关闭 | 恢复会话时补上 IDE 使用的 setMaxThinkingTokens(0) 控制；短请求复验返回目标文字，原生事件没有非空 thinking 内容。 |
| 配置精确性 | `/config` 的 JSON 字符串保留连续空格；`agent.configure --replace` 清除了被省略的旧字段。`view.update --unset` 移除了列宽与换行配置，同时保留视图 ID。 |
| 构建 | 1.11.0 的 TypeScript、后端/CLI 和 Vite 生产构建通过，git diff --check 通过。现有前端大包体积提示仍存在。 |
| 原生能力发现 | 本机 Codex 0.145.0 导出 126 个方法及参数 Schema；Claude SDK 0.3.269 连接本机 Claude Code 2.1.233，读取真实模型和技能。高级控制面板读取原生协议定义。 |

桌面控制曾恢复并完成下方交互检查，之后再次超时。整体仍在验收：尚需检查图库、列表、图表、动态、表单，图片附件预览、选区引用交互、非空 MCP/插件列表与管理入口、新增会话许可按钮，以及两种引擎与本机 IDE 插件的逐项功能对照。不能把原生方法数量或构建通过当成插件功能全部通过。

### 后续真实验收

本阶段依然没有运行传统测试套件。桌面操作使用 CUA，CLI 创建真实资料和调用正式 API，再直接检查 JSON 数据、原生会话文件、物理文件与进程。

| 场景 | 观察与证据 |
| --- | --- |
| SDK 配套引擎 | 默认路径切换为官方 SDK 捆绑 Claude Code 2.1.269；原生 `get_binary_version` 验证版本。旧 wrapper 仍可显式选择。证据在 `.local-data/sdk-acceptance-20260912/`。 |
| Claude 原生配置 | `/config --help` 由真实 CLI 返回帮助；`/config thinking=false outputStyle=Concise` 成功。`get_settings` 和空间 `.claude/settings.local.json` 同时确认 Concise。修复外层 Git 仓库让配置写到错误根目录的问题。 |
| 原生命令与控制 | Claude 真实 init 返回 48 个命令；公开 SDK 类型导出 59 个控制方法，包含 `get_settings`、`rename_session`；Codex 导出 126 个方法。数量只证明发现能力，不代表每个交互都已验收。 |
| 持久化队列 | `.local-data/queue-acceptance-20260912/`：第一条真实任务后，带附件的第二条编辑后执行；第三条排队后移除。`queue-order.txt` 精确为 FIRST、SECOND 两行，取消任务文件不存在，队列清空。 |
| 中断后发送 | 工具实际启动 sleep90 后发送 interrupt；201.4 秒后 `interrupted-old-2.txt` 不存在，`interrupted-new.txt` 为 NEW，队列为空。较早的 old.txt 是未及时中断的旧夹具，不能混为本次结果。 |
| SDK 队列双写 | 真实 SDK 引擎写出 FIRST_SDK、SECOND_SDK 两行，并修改主页面段落。 |
| 精确选区引用 API | SDK 验收中的 `context-target` 被修改为「选区引用精确修改成功」，`context-keep` 保持原文；跨空间引用返回 SPACE_ACCESS_DENIED。 |
| 桌面模型与快捷键 | CUA 在模型菜单选择 GPT-5.6-Sol，CLI 保存值一致。实际按钮发送回复「UI发送链路通过」；Cmd+Enter 发送回复「快捷键验收通过」，均在真实 UI 和日志中确认。Enter 在 cmdAlways 模式插入换行。 |
| 配置并发保存 | UI JSON 草稿添加 followUpQueueMode=steer，再从下拉框把 effort 改为 medium；点击保存，两项都保留。`evidence/ui-config-merge.json` 读回一致。未编辑的 JSON 也会跟随下拉框实时更新。 |
| UI 引用已有文件 | 从 @ 菜单筛选并选择「秋季发布计划.md」，发送后真实 Codex 通过 file.read 读取相同文件 ID，精确回复五项任务名。无需重复上传。 |
| 原生会话命名 | CLI 改名后 UI 显示相同名称；UI 再改为「桌面会话命名验收」，原生 thread/read 返回相同 name。证据 `evidence/ui-renamed-native-thread.json`。Claude 的原生 JSONL 同样写入 custom-title。 |
| 综合视图目视检查 | 手工打开议程、日历、看板、表格、时间线。日历在 9 月 14、15 日显示跨日回归；时间线跨两个日期；看板按状态分列。点击时间线条目跳转「跨日回归」子页面，源日期为 23:00 至次日 01:00。 |
| 完整日期显示 | 发现综合表格省略结束时刻，补上 dateLabel。新版 UI 和 `evidence/overview-exact-dates.json` 均显示完整起止时间与 Asia/Shanghai。 |
| 综合页完成联动 | CUA 勾选「需求冻结」，今天数量 2→1，记录隐藏；page.get 显示 status=已完成，原日期、优先级和正文保留。CLI 恢复进行中后，UI 数量与记录同步恢复。 |
| 富文本目视检查 | 手动查看 cli-rich-20260912：衬线字体、红色「关键说明」、原型评审链接、已勾选待办、嵌套段落、JSON 代码块均正确。 |
| 桌面 Claude 审批 | Main 数据目录中的 Claude 空间使用 SDK 配套引擎。审批前 UI审批通过.txt 不存在；CUA 点击允许后才写入「用户在图形界面批准后才写入」。请求记录 answered=true，原生工具结果成功。 |
| 后台任务完成 | SDK 空间真实后台 Bash sleep120，任务 bsx6srtut 合并为同一条开始/更新/完成卡片，文件为「后台任务完成」。证据 `.local-data/sdk-acceptance-20260912/background-task-result.json`。 |
| 桌面停止后台任务 | 主数据目录 Claude 任务 bvic2vabx 执行 sleep300；CUA 点击任务卡片「停止任务」，原生状态 stopped，shell 进程消失。启动 503.157 秒后 UI停止后不得出现.txt 仍不存在。证据 `evidence/ui-background-task.json`。 |
| 静态符号链接边界 | `.local-data/boundary-acceptance-20260912/`：folder.path 指向空间外链接下不存在的子目录，file.create 返回「空间路径越界」，外部目录未被创建。启动器路径替换为外部哨兵文件的链接，capabilities 拒绝，哨兵内容与长度不变。 |

### 再次复验与新增发现

- 真实 AskUserQuestion：在 UI 选择「下午15:00」并提交，Claude 通过 CLI 创建唯一提醒 `83a1d1cb-23d3-49dd-84d0-5603f3939fd1`，存储 `2026-09-18T07:00:00.000Z`、时区 Asia/Shanghai，正文追加「人工选择：下午15:00」。综合页显示 9 月 18 日 15:00，真实点击跳回 Claude 主页面，提醒窗口显示相同时间。完整数据在 `evidence/ui-question-result.json`。
- 原生 null：发现 Commander 会把参数解析器返回的 null 改为字符串空值，实际 `config/mcpServer/reload` 失败。JSON 改为在收集选项后解析，并在控制适配器中保留 null。修正后 `agent control --method config/mcpServer/reload --params null` 返回成功；普通 JSON 对象的 view.update 仍正常。
- 服务重连：实测 service.stop 后 ui.launch 返回 GUI_START_FAILED。修复现有窗口在 second-instance / activate 时恢复订阅。重试后 ui.launch 成功，guiClients=1、desktopClients=1；CLI 将视图改名「表格 · 重连验收」，UI 标签和侧栏都同步更新，随后恢复原名。
- 数据库手工视图：表格含五条记录；看板为待办3、进行中1、已完成1；日历显示具体起止时间、9月14–15日跨日条、9月16日全天事项；周计划显示本周两项与未排期已完成一项。发现周计划卡片列过窄，已调整最小列宽并定位今天，新版截图复验通过：名称可读，当前周自动定位到今天所在列。
- 时间线默认起点：原先从上月尾部开始，打开后屏幕看不到当天任务；改为从参考日期开始。CLI period 已读回 2026-09-12 至 2026-12-20，新版 UI 已目视确认打开即可看到 9 月 12 日起的任务条。证据 `evidence/timeline-current-period.json`。
- 命令结果新增可搜索的技能/命令、MCP 工具列表、插件详情与状态展示，完整原生响应保留。手工执行 /mcp 显示与原生结果一致的空服务状态；/skills 列出真实动态命令，点击 /config 后准确预填输入框，再发送可打开配置。Codex 插件和 MCP 非空列表仍待目视检查。
- 断连后未完成工具会标记结束，不继续显示转圈；恢复连接从持久化消息初始化工具状态，保留后台任务名称。真实后台任务 bo1dkisc4 在服务断开后被终止，恢复会话后保留「重连后任务标题保留验收」名称并显示已停止；105.229 秒后原定 90 秒写入的文件仍不存在。证据 reconnect-task-before.json / reconnect-task-after.json。
- 本机最新 Claude 扩展已更新到 2.1.269，与 SDK 配套 CLI 一致。实际 init 含 fast_mode_disabled_reason=sdk_opt_in_required；不能把 SDK 明确不开放的能力冒充为已通过。继续核对原生能力与宿主界面范围。

### SDK 参数与配置隔离

- 新增 `options.sdk`，转交官方 SDK 的可 JSON 化运行参数，宿主继续固定 Workspace、会话和审批边界。真实设置 tools=[Read] 后，原生 init.tools 精确只有 Read，短请求成功；尝试传 sdk.cwd=/tmp 时原生 cwd 仍为绑定 Workspace。证据 `.local-data/sdk-acceptance-20260912/sdk-options-result.json`。测试后已恢复 sdk={}。
- 手工在 Claude JSON 编辑器输入未保存的草稿模型，再切换到 Codex Workspace；新编辑器显示原有 gpt-5.6-sol / medium，没有混入另一个空间的草稿。AgentControls 按 Workspace 重建，异步命令返回也检查当前空间。
- 多图片输入已用当前 Codex 与 SDK 配套 Claude 重新验证：两张实际 PNG 分别为 RED 17、BLUE 29，两种引擎都读出数字、计算 46，并通过 CLI 追加主页面段落、读回确认。证据 evidence/codex-images-result.json 与 SDK 数据目录 images-result.json。图片来源沿用已人工查看的夹具，执行结果是本轮新生成。

### 许可协议完整性

- 原适配器只返回 behavior / updatedInput，遗漏 SDK 的 updatedPermissions 等字段。现保留完整结果，传递原生建议规则、提示名称和原因；Codex UI 按 availableDecisions 提供本次、会话、规则变更与拒绝并停止等选项。
- 首次两文件试验继承用户已有 allow=[Write, Edit, ...]，自动写入，不能作为记住规则通过的证据。随后只修改测试 Workspace 的配置副本，移除 Write/Edit 自动许可，正式复验后已恢复原文件及 acceptEdits 默认模式。
- 正式请求 e71bed25-7c91-4a7d-8d46-aad2fc7119da 等待 Write 审批，两个目标文件此前均不存在；真实 CLI 建议为 setMode=acceptEdits、destination=session。通过 agent.respond 传回完整 updatedPermissions 后，两文件精确为 FIRST、SECOND，只出现一个审批请求，原生 reinitialize 显示 current_permission_mode=acceptEdits。证据 permission-suggestion-request.json / permission-suggestion-result.json / permission-suggestion-native-state.json。
- 无效响应：在另一个实际 Write 请求中传入 {}，适配器拒绝而不是默认为 allow。工具结果为「未获得有效许可」，无效审批响应不得写入.txt 不存在，Agent 按要求停止而未换工具重试。证据 invalid-permission-request.json / invalid-permission-result.json。
- 原生 status.permissionMode 用于更新会话的实际审批显示，与空间默认设置区分，避免把会话许可写成永久默认。另修复了重新连接时沿用旧审批显示的问题：初始化握手 current_permission_mode 与持久化 runtime.permissionMode 已同时读回 acceptEdits。证据 permission-restored-native.json。新增审批按钮和该显示还需桌面复验。
- CUA 抓图发生 120 秒超时，重置后 getState 也在 10 秒超时；CLI 与桌面进程仍正常。该工具中断不等于 UI 验收通过。剩余图片预览、非空 MCP/插件列表、选区引用、审批新按钮和完整插件功能对照继续保留为未完成。

### 打包应用与公开插件对照

- 已生成本地 `.app`，从包内 CLI 创建新数据目录与两个 Workspace。真实 Claude 2.1.269 从 app.asar.unpacked 启动，真实 Codex 使用本机 App Server；二者均创建物理文件并通过包内 CLI 修改各自主页面，读回一致。
- 打包 Codex 的同一条 command/exec 成功写入本空间文件 INSIDE，空间外目标返回 Operation not permitted 且不存在；其固定 gateway 修改另一主页面返回 PAGE_NOT_FOUND，页面名称不变。证据 `.local-data/package-acceptance-20260912/`，包含 app.asar 的 SHA-256。
- 按本机 Codex 26.901.22334 与 Claude Code 2.1.269 的公开 manifest 建立 [AGENT_PARITY.md](AGENT_PARITY.md)。没有把“原生方法可调用”当成完整 UI 已完成；并行会话、审阅回退、认证及插件管理等仍有明确缺口。
- 静态盘点了 UI 的 52 个直接方法调用，均有 CLI 命令定义；动态调用和原生桥另存清单继续检查。该源码盘点不代替运行验收。
- 新增专注视图：focusView、/focus、Ctrl+Alt+F 和面板按钮；折叠工具，保留正在运行的名称、错误、停止状态和待回答请求。CLI 开启后读回 true，字符串错误值被拒绝；仍需手工 UI 验收。
- 发送/追加任务、斜杠命令与继续队列前等待当前页面保存；保存失败不启动读取旧内容的 Agent。这条 UI 顺序约束需要桌面复验。

### 主回复结束后的停止

- 真实后台任务 bg6g08qqm 运行时主状态已为 idle，旧 agent.stop 返回 stopped=false。随后用原生 stopTask 清理了该任务。
- 修复为主回合 idle 时也关闭仍存在的引擎连接与所有后台子进程；活动条目使用 stopped 状态，避免显示为已完成或执行失败。
- 第一次复验 idle-stop-after.txt 没有及时执行停止，任务已完成；该次不计为停止通过。第二次 bv25b0hnp 的主状态明确 idle、任务明确 running，agent.stop 返回 true，任务状态变为 stopped。证据 idle-stop-fixed.json / idle-stop-fixed-history.json。
- 回收站场景 bv401bagi 在主状态 idle、后台仍 running 时，通过 page.trash 删除绑定主页面；任务和 Agent 都立即标记 stopped，物理目录保留。161.406 秒和 112.074 秒的延迟反查分别确认两次目标文件不存在，原目录存在；随后恢复 Workspace，状态为 stopped。证据 idle-trash-delayed-check.json / trash-restored.json。

### 更新后的打包复验

- 已重新打包，包含专注视图和后台停止修复；初始包哈希保存在 app-sha256-initial.txt，新包哈希为 app-sha256.txt。
- 首次 packaged-idle-stop.txt 的 30 秒任务在停止前已完成，不计为停止验收。第二次任务 bg2jwvldz 设置 600 秒，在主状态 idle、后台 running 时用包内 CLI 停止，返回 true，任务和主状态均为 stopped；随后确认原生 Claude 进程退出。105.176 秒时目标 packaged-idle-stop-2.txt 不存在，仍需在原定 600 秒之后再记录一次反查。开始时间为 1789216465011。
- 包内 CLI、双引擎文件/页面双写、物理和页面边界均已验证；打包界面的完整手工检查仍被 CUA 超时阻断，不能因此算通过。

### 继续验收的位置

- 主验收空间：`606e1f54-c2b7-46e2-aeef-16adc9d45fff`。
- 秋季发布数据库：`b969d881-701d-4f5a-9c82-dc2c306da1dc`。
- 精确富文本页面：`cli-rich-20260912`。
- Claude 独立验收空间：`b83d248e-f9f0-4fa9-99cd-18f7c912aa62`（位于 claude-diagnostic-20260912 数据目录）。
- 主数据目录中的两个提醒已经用调度推进方式投递，查看收件箱可验证；`evidence/综合日程.json` 保存了投递前的待提醒投影。
- 启动当前桌面构建：`MINI_NOTION_DATA_DIR="$PWD/.local-data/acceptance-20260912" npm start`。继续检查上方列出的未完成项目，不能以本文件或构建替代手动检查。

## 1.10 历史验收记录

日期：2026-09-11。依据相邻 `Agents-OS/Docs/requirements.md` 和本轮追加的 Notion 页面、Workspace、Agent 一一对应要求，验收当前 Mini Notion 项目的 CLI、会话、文件与界面链路。

## 功能与边界

| 需求                              | 实现与证据                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| UI 是 CLI/API 子集                | 公共命令目录生成 CLI；扫描 UI 的命令调用并检查命令发现；逐项读取全部方法 schema。十种视图均验证筛选、排序、复制、删除和记录投影。        |
| 主页面、Workspace、Agent 固定对应 | 主页面不能移成子页面或移除绑定；引擎固定；子页面继承所属空间的 Agent；同一原生 Session 不得绑定多个空间。复制空间使用独立文件和新会话。  |
| 多文件、多图片、纯附件            | 上传先持久化并登记，再发送文件 ID；支持文本混合、纯附件、Enter、箭头、拖入、粘贴和移除待发送附件；中文输入法确认不会误发。               |
| 文件联动                          | 主页面自动列出空间文件；聊天附件和 Agent 的结果链接定位同一个预览。移动、重命名保留文件地址；旧 URL 迁移；备份保留根文件、子目录与会话。 |
| Agent 实际操作 CLI                | 专用启动器绑定当前构建和空间身份；操作在空间投影执行，复用差异合并与单写入服务。已验证页面编辑、数据库、视图、文件以及循环模板执行记录。 |
| 会话与运行状态                    | 长期 Session 续接；停止保存已接收文本；重启标记中断；错误退出、失败事件、无完成事件不会当成正常结束。恢复提示和真正失败分别处理。        |
| CLI 工作渲染                      | 用户消息、Markdown、附件、页面／文件链接、工具输入输出与原始事件；工具开始和结束合并；130 条消息验收确认不受 50 条工作空间缓存限制。     |
| Notion 风格                       | 纸面底色、灰色消息、紧凑图标、细边框和可折叠操作；浅色／深色截图检查；浮窗与文件预览可同时使用。                                         |

空间约束由应用 API 执行；本机 Coding Agent 仍使用用户已有的模型配置和原生工具。引擎／服务不可用时返回真实错误。确定性引擎协议测试与真实模型测试分别执行，不以模拟输出证明模型能力。

## 程序化验证

- `npm test`：145 项通过。新增验证集中于 `tests/agent-runtime.test.cjs`、`tests/agent.test.ts`、`tests/cli-parity.test.cjs` 和 `tests/spaces.test.ts`。
- `npm run build`：TypeScript、后台、CLI 和生产界面构建通过。现有编辑器主包仍有体积提示。
- 现有桌面主流程 38 项，加上新增 Agent 桌面用例 7 项；45 项全部通过，最后一轮使用隐藏窗口执行。窗口生命周期用例此前已通过普通模式验收。
- 新增 Agent 桌面用例明确断言测试窗口不可见，不依赖用户的系统剪贴板。

后台桌面验收：

```sh
npm run build
MINI_NOTION_BACKGROUND_TEST=1 npx playwright test tests/agent.e2e.ts tests/app.e2e.ts
```

真实引擎验收：

```sh
npm run test:agent:live
# 可单独复测某个引擎或场景
MINI_NOTION_LIVE_ENGINES=claude MINI_NOTION_LIVE_CASE=多文档 npm run test:agent:live
```

真实验收会调用本机引擎和已配置模型，结果保存在独立的 `.local-data/agent-live-时间戳/`，包括 `acceptance.json`、页面、文件、会话和原始事件。

## 手工设计的真实 Agent 场景

| 引擎        | 场景                   | 检查结果                                                                       |
| ----------- | ---------------------- | ------------------------------------------------------------------------------ |
| Claude Code | 新建会议纪要并回读     | 子页面、正文与页面链接正确                                                     |
| Claude Code | 同一会话继续编辑       | 原页面负责人改为小周，追加待办，没有重复页面                                   |
| Claude Code | 两份文档转数据库       | 两条任务；负责人、日期和预算正确；表格／看板／日历；总预算 200；摘要文件可回读 |
| Claude Code | 不输入文本，仅上传 CSV | 文件先持久化；回复正确读取预算内容                                             |
| Claude Code | 尝试编辑锁定页面       | 正文不变，明确说明无法编辑                                                     |
| Codex       | 新建会议纪要并回读     | 子页面、正文与页面链接正确                                                     |
| Codex       | 同一会话继续编辑       | 保留同一 Session，在既有页面上修改并追加待办                                   |
| Codex       | 两张图片与文本联合处理 | 识别 RED 17、BLUE 29，计算 46，创建并回读结果文件                              |
| Codex       | 尝试编辑锁定页面       | 正文不变，明确说明无法编辑                                                     |

9 个场景均已通过。复杂数据库场景首次验收脚本误把 `database.get` 返回值当作 Page 对象；修正为直接读取 `views` 后，已单独重新执行真实任务并通过。

本轮证据目录：

- `.local-data/agent-live-1789138861606/acceptance.json`：首次完整运行及各场景记录。
- `.local-data/agent-live-1789139156332/acceptance.json`：复杂资料任务的修正后复测。
- `test-results/agent-conversation-light.png`、`agent-conversation-dark.png`：会话视觉验收。
- `test-results/agent-empty-light.png`、`agent-file-links.png`：浮窗及文件联动。

## 真实测试中修复的问题

- Agent 提示词中的错误 CLI 参数与缺失的 Codex 操作说明。
- 登录 Shell 误用旧版已安装 CLI，以及 Codex 沙箱无法访问本地 socket。
- 空间文件 URL 指向普通附件目录，导致预览／打开失败。
- 同一输出包内工具开始与结束产生重复记录；未换行尾包、停止前文本和长会话丢失。
- Codex 的可恢复 item 提示被误当作回合失败。
- 文件预览关闭按钮被聊天浮窗遮挡。
- 空间复制共享文件、空间重命名不同步、服务重启残留运行中状态。
