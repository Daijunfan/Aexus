# Deep Research 审查结果

检查日期：2026-10-09（Asia/Shanghai）。动态研究引擎、证据链、界面和本机安装已分别验证；现已完成一次限定范围的真实 CLI 模型研究；复杂主题与竞品配对质量评测尚未完成，不能宣称“绝对完美”或“超越全部竞品”。前序实现、阅读由原生子 Agent 分工完成。2026-10-09 的最新修复按用户指示仅由主 Agent 执行；用户授权后，使用 CLI 在隔离 Core 中运行一个严格限额的小型真实研究任务，全部后台执行。

## 2026-10-09 输入与历史布局修复

- 删除左侧历史栏及其样式；研究记录统一放在输入区下方并按需分页，研究页提供返回首页入口。
- 研究主题不再要求至少十个字符；非空短问题即可提交，来源预算允许降到 1。快速模式未手动改预算时，最多 6 个来源、4 名员工、2 项并发、16 个计划节点和 1 次重规划；手动输入优先。
- CLI 启动隔离 Core，使用实际 Codex 模型，只研究 `https://example.com/` 一页，限制最多 2 名员工、1 个来源、4 个计划任务、0 次重规划、200 字报告。真实 scout → plan → verify → write → review 完成并交付五个文件。
- 重启 CLI Core 后，任务仍为 completed；CLI 下载 HTML 的 SHA256 与原交付一致，没有重复模型请求。真实证据记录：[verification.json](../../../.aexus/artifacts/deep-research-fix/live-1791509850839/verification.json)、[CLI 下载与恢复](../../../.aexus/artifacts/deep-research-fix/live-1791509850839/cli-delivery.json)。
- 相关领域/CLI 测试、后台浏览器交互和 TypeScript 检查通过。实际安装包检查输入点击、短问题按钮启用、无左侧历史栏，以及历史位于输入区下方。
- 本次小任务证明当前真实执行链可以完成研究与交付；不外推为复杂主题质量或所有提供商均通过，也不推断账单来源。

## 后续失败恢复修复

- 计划回复现在先验证完整 DAG、团队预算和修订规则，再保存为成功结果。不存在的依赖会进入原有一次格式纠错，不会缓存坏计划后在恢复时永久重复失败。
- 论断核验中的矛盾来源 ID 在写入结果前验证，避免一边报错一边保存部分成功证据。两项故障均由先失败、修复后通过的测试复现。
- 领域、独立证据、源读取和 Host 回归共 75 项通过；候选与安装路径后台检查均通过。后台恢复复核见[本轮生产状态验证](../../../.aexus/artifacts/deep-research-fix/validation-production.json)：80 员工、17 工作流 ID/状态及根数据哈希不变，窗口隐藏、无应用所属模型进程。原恢复脚本曾将另一 ChatGPT 进程计入“新增提供商”，已按 Aexus 子进程归属重新核验；没有重新启动或终止无关进程。
- 第二次真实 CLI 试验仅限定 HTML 与公开 PDF 两个来源、最多 2 名员工、4 个计划任务、250 字报告。提供商在初步调研阶段连续返回流中断，已通过 CLI 主动取消；持久状态为 `cancelled`、`controlPending=false`。这次不计成功，没有继续付费重试。前一次单来源真实研究与下载/恢复成功记录保持有效。

- 只在隔离进程中尝试现有本机代理和 [OpenAI 官方文档](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)支持的 HTTP 传输开关。WebSocket 错误消失，但提供商仍在初步调研阶段断流；任务经 CLI 取消，`controlPending=false`，没有来源或交付。本次没有更改全局 Codex、Clash 配置，也没有把该实验计作完成。
- HTML 来源标题曾直接沿用员工提交值。现在只在独立取得的页面中提取真实 `<title>`，同 URL 的后续片段沿用核对结果；PDF/纯文本不伪称具有独立标题。一次公开网页实读和 20 项来源测试、77 项领域/Host 相关测试通过。取证时只解析一次 HTML，PDF 原始字节不再做无用的 UTF-8 解码。
- 确认停止后，Host 刷新任务与 DAG 摘要：已停止任务不再显示“进行中”，进度的运行数归零；暂停仍保留可继续的待执行节点。实际 Host 取消及重启用例、70 项相关回归与 TypeScript 检查通过。
- 原生执行失败会进入会话状态，研究任务优先显示实际错误，避免将提供商断流误当 JSON 格式错误而自动发送纠错请求。错误通知在 Core 重启后仍可读取；用户显式恢复时使用新任务编号。[真实 Core 与假 Codex 协议测试](../../../Infra/src/test/deep-research-native-error-test.mjs)及 73 项相关回归、TypeScript 检查通过，均未调用收费模型。
- 报告章节的每个来源 ID 都必须有该来源的已核验论断和独立取得的原文片段；一条有效引用不能让同章节另一条空引用通过。来源预算在网络读取前筛除超额新候选，已占名额的来源仍可追加已核对片段；单来源预算的初调研只下载一页。两项修复由先失败后通过的回归用例覆盖。
- 来源 CSV 将可能被电子表格解释为公式的网页标题、原文等单元格转为文本；证据 JSON 仍保存精确原文。先失败后通过的导出回归用例覆盖此行为。
- 重规划对已完成节点按实际任务内容与依赖集合比较；JSON 字段顺序或依赖书写顺序变化不再误判为改写。研究目标改变仍必须使用新节点 ID。
- 来源名额已满时，预算筛选也按现有的规范化 URL 识别旧任务来源；旧 ID 与新 ID 不同的同一网页仍可更新证据，避免前置读取优化破坏历史任务恢复。
- 已核验的同网址片段也按规范化 URL 复用，即使来源 ID 属于旧版格式也不会无意义地再次下载。原文片段变更时仍需重新独立读取。
- 隔离 Core 的原生 Pi 双来源小任务实际取得了指定 HTML 和 PDF 原文；首次规划回复超过 2 人预算，修正未在 6 分钟限时内完成，另一次试验因跨任务配置切换而主动取消。规划提示与超预算错误现已明确 coordinator 计入人数及跨节点复用角色。[共享 Pi 配置下的后续试验](../../../.aexus/artifacts/deep-research-fix/pi-real-uMVRv3/failure.json)完成了两人计划、核验和写作，但 10 分钟总限时在最终审阅仍运行时到达，任务按预设取消；没有最终五文件交付，不计完整成功。该试验使用临时原生 Pi 配置与会话目录，退出后已清理。
- 再次限定同两来源的试验中，Pi 在已取得 PDF 首页正文与哈希后仍多次请求无关字体/对象流分析；[本次失败记录](../../../.aexus/artifacts/deep-research-fix/pi-real-zIEyar/failure.json)与[停止证明](../../../.aexus/artifacts/deep-research-fix/pi-real-zIEyar/stop.json)显示任务在初调研主动取消、清理确认完成。Engine 的 scout 提示已补充“限定网址和候选片段时只检查必要正文，立即返回结构化结果”，但尚无新付费运行证明模型必然遵守，不能把提示当硬工具预算。
- 共享 Cline 的两来源、两员工、四任务上限隔离实测中，初调研和计划完成、HTML/PDF 均由引擎独立读取；16 分钟期限到达时仍在第一个核验节点，已确认取消并移除隔离目录。[失败记录](../../../.aexus/artifacts/deep-research-fix/cline-real-Jh8fXZ/failure.json)、[停止证明](../../../.aexus/artifacts/deep-research-fix/cline-real-Jh8fXZ/stop.json)与[最后公开投影](../../../.aexus/artifacts/deep-research-fix/cline-real-Jh8fXZ/last-public-view.json)分别记录期限、控制状态和未交付的 DAG。规划目标要求重复 GET 与 PDF 内部结构检查，暴露了阶段边界问题；现在提示 scout/search 按需使用原生浏览工具，要求 verify/write/review/plan 根据引擎已独立取得的证据作判断，证据不足时提出缺口。`session.send` 公共协议没有逐消息工具开关，因此这是模型指令而非权限隔离；该修改通过协议回归，本次超时试验不计成功，也不能证明 Cline 必然遵从新提示。
- [原生 Cline 隔离单步核验](../../../.aexus/artifacts/deep-research-fix/cline-verify-real-6xaPtq/verification.json)用已取证片段的测试输入，在约两分钟内返回 2 个来源、2 条论断，未出现工具审批；临时原生配置和进程已清理。该验证使用测试证明元数据，不是新的独立网页取证，也未跑完整 DAG；没有观察逐项工具调用，不能据此断言模型绝对不使用工具。

以下矩阵区分已完成的基础验收与尚未覆盖的复杂场景。阅读账本记录前序基线；本次修复文件另行完成差异审查。

## 用户要求与当前证据

| 要求 | 当前实现与实际验证 | 尚未建立的结论 |
| --- | --- | --- |
| 员工与 Manager 数量动态 | 初调研后由计划产生团队、分支责任及管理关系；并发上限独立于团队人数。真实 runtime fixture 验证多个 Manager、意见冲突和变更后重新审核。 | 真实模型对不同复杂度主题的扩编决策质量。 |
| 先调研再规划，不虚构初始进度 | scout/plan 没有固定百分比或 ETA；计划形成后，DAG、任务状态与进度来自同一持久状态。失败与停止不计作成功。 | 开放式真实任务的时间预测，本轮不提供此承诺。 |
| 任意 DAG 与中途重规划 | 支持分叉汇合、多父、跨层、共享综合结果和 ready 节点并行；慢独立分支不阻塞无关工作。修订保留已完成任务、证据、旧计划及原因，目标变化使用新节点 ID。 | 所有可能拓扑和真实提供商恢复情形均已覆盖。 |
| 丰富且简单的可视化 | 云形节点、LR/TB 方向、适配、缩放、邻域聚焦、详情与分页历史；来源可按已核验、待核验、未取得原文筛选。完成报告可从 UI 发起后续研究并返回父报告。支持审批、调整方向、暂停、继续、取消与必要重试。25 项 Chromium 检查覆盖 48 节点、36 同层/36 深层、1440/768/390、65 条历史、长报告、暗主题和停止状态。 | 主观“最佳视觉”；48 节点验收不冒充全部规模无性能限制。 |
| 原生引擎与额度选择 | 研究入口显式显示执行引擎；有共享密钥配置时优先选 Pi/Cline，无此类配置时不暗中选中 Codex。用户仍可显式选 Codex 当前账号或自动多引擎组合。隔离安装包在无凭据情况下验证按钮需先选引擎才启用，模型调用数为零。 | 配置分类和选择不证明中转站账单金额；实际费用仍由各提供商记录决定。 |
| 广泛来源与可信引用 | 引擎独立读取公开 HTML/文本/PDF，逐片段匹配原文，保存真实 URL、时间、原文 SHA256 和 locator；拒绝虚构片段、未知来源和仅搜索摘要。“实读网站”只计独立取得正文的域名，发现 URL 不会虚增覆盖。冲突论断在发现页优先展示，可分别定位双方原文。 | 原文匹配不自动证明语义蕴涵；单来源真实任务已完成，不能据此承诺每个主题的来源广度。 |
| 内容详实与真实交付 | 报告、来源和论断互相定位；Host 发布 HTML、Markdown、来源 CSV、证据 JSON、计划 JSON 五份文件。静态 HTML 采用桌面/窄屏/打印排版，三种文件都保留独立取证的最终网址、定位、时间与 SHA-256；长报告窄屏表格在正文内滚动。已完成报告的追问只把旧报告和引用 URL 作为历史背景，新任务重新取证与规划。独立语料含 17 来源、28 论断、10 章。 | 该语料是原生 Agent 成果经引擎验证，非应用自动研究输出；当前没有原生 PDF/Word 导出、OCR 或报告 Mermaid 渲染。 |
| 清晰边界、精简与性能 | Host 负责权限、身份、生命周期、持久化与发布；Engine 经公开 Contract 调用 Host，UI 消费 canonical 投影。计划只保存静态拓扑，执行结果只保留在 DAG；已删除固定模板、重复 claim 存储、完整提示和产物正文副本。完成检查点可重新发布相同字节及哈希而不重做研究。 | 不以模拟数据或不含 fsync 的计时宣称生产性能已“极致”。 |
| 全项目阅读、竞品、构建与安装 | 前序 2,202 个 tracked 文件逐路径审计：1,985 份文本完整实读，19 份生成文件核生成源，198 份图像/音视频/上游归档核清单；该基线不冒充后续改动的当前哈希。公开厂商与开源方案已对标；最新集成源码已构建、安装和隐藏重开。 | 未登录竞品实跑、未做同任务盲评；macOS 结果不外推 Windows/Linux。 |

2026-10-09 再查官方/项目资料：[OpenAI Deep Research](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt)已有计划审阅、来源范围控制、过程引导、引用和 Markdown/Word/PDF 下载；[Gemini Deep Research](https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DDesktop&hl=en)支持编辑计划、选择包括个人资料在内的来源，并在部分套餐中生成图表等视觉内容；[Claude Research](https://support.anthropic.com/en/articles/11088861-using-research-on-claude)强调递进式检索与可核查引用；[LangChain Open Deep Research](https://github.com/langchain-ai/open_deep_research/blob/main/README.md)展示跨模型/搜索工具/MCP 的可配置研究。上述是公开功能对照，不是同题实测。Aexus 的差异在可见 DAG 节点、原文独立匹配及五件交付；当前明显短板仍是完整多来源真实验收、私有来源接入和直接 Word/PDF 导出，先补前者再扩展格式与接入。

UI 默认自动批准计划，用户可关闭；API 创建默认等待批准。自动批准仍先初调研、规划和 Manager 审核，不跳过这些职责。多个 Manager 中任一要求修订都会阻止计划自动批准。
后续研究使用 Host 原有 `workflow.fork`：父任务必须已完成且修订号一致；请求键重试返回同一子任务。隔离 Host 用例验证父报告哈希不变、子任务重新等待计划确认并交付五份文件、重启后保留父子关系且不重复派发 Agent。旧报告仅作背景材料，不能冒充新任务的已核验证据。

## 可复核验收

[基线审计](../../../.aexus/artifacts/deep-research-independent/final-audit.json)核对当时全部 tracked 路径与 SHA256：无重复、遗漏、孤立、过期或未完成项。后续 Deep Research 改动另行复核，基线哈希不代表当前提交。[阅读账本](../../../.aexus/artifacts/deep-research-independent/reading-coverage.json)保存逐文件证据，其他 Agent 记录只在当时哈希匹配时计入。曾发生的动态批次误登记已对原 20 文件补齐实际全文；资源目录和生成目录的误分类也已补读并纠正，说明见[阅读审计记录](../../../.aexus/artifacts/deep-research-independent/reading-notes.md)。SVG、手写 Manager 文档、资源来源清单及 MiniNotion 数据目录均已实读。

生成文件没有冒充全文阅读：Contract 与 Manager 的 `--check` 分别验证 302 能力/243 schema 和 348 CLI 项；emoji 与 Margin Reader API 的当前生成器在截获写入的 VM 中逐字复现，未改源文件；七份 npm 锁核对所属 package 版本和每个直接生产依赖的锁定条目，不声称逐字审阅第三方传递依赖。

当前[集成副本相关回归](../../../.aexus/artifacts/deep-research-fix/release-72e2869-integrated/deep-research-tests.log)为 109/109，通过命令：

```sh
node --test Engine/deep-research/test/workflow.test.mjs Engine/deep-research/test/source-read.test.mjs Engine/deep-research/test/cli.test.mjs Engine/deep-research/test/report-layout.test.mjs Infra/src/test/deep-research-independent-test.mjs Infra/src/test/deep-research-host-test.mjs Infra/src/test/retired-research-unit-test.mjs
```

测试使用真实领域/runtime/Host 模块，原生传输、授权和测试原文读取明确使用 fixture，无模型与生产数据。[Host 恢复证据](../../../.aexus/artifacts/deep-research-independent/host.json)包含 pause/amend/resume、重启保留审批、review 驱动重规划，以及最终文件重放不重复派发。退休 Web Demo 直接退出，不再监听或触发研究；诊断工具显示实际 DAG 和失败/暂停/取消状态。

[UI 25 项记录](../../../.aexus/artifacts/deep-research-ui/verification.json)和[独立长报告阅读](../../../.aexus/artifacts/deep-research-independent/reading-ui/corpus-verification.json)保留截图与交互证据；[独立语料验证](../../../.aexus/artifacts/deep-research-independent/research-corpus/independent-proof/validation.json)明确区分实际 GET 原文、匹配论断及历史工具摘录，不能把后者算成独立 HTTP 取证。[独立 HTML 排版测试](../../../Engine/deep-research/test/report-layout.test.mjs)用实际 Chromium 检查宽表、来源证明和打印视口。

原工作区 `aexus-boundaries-test.mjs` 因既有三份 tracked 根 Markdown 不符合目录白名单失败；用户文件与 package 修改已保留。在隔离副本只补 HEAD 的 build 元数据、排除这三份文档后，原脚本 7 项通过并扫描 93 个 Engine/Contract 源文件无跨层依赖。两种结果见[边界证据](../../../.aexus/artifacts/deep-research-independent/isolated-boundaries.json)；隔离通过不代表原工作区布局检查通过。

## 当前安装

截至 2026-10-09，[最新安装记录](../../../.aexus/artifacts/deep-research-fix/latest-installed.json)保存实际 `/Applications/Aexus.app` 的构建提交、ASAR SHA256 和共享配置覆盖文件指纹。Deep Research `2.0.0` 已包含显式原生引擎选择、云形 DAG、来源状态筛选、分页历史、可追溯后续研究、静态报告取证记录、快速研究预算、逐来源报告引用约束、停止状态同步和持久错误恢复。

最新安装记录的 `installationProof`、`packageProof`、`restorationProof` 和 `overlaysProof` 分别指向安装操作、实际安装包检查、隐藏恢复和未提交共享配置源码的哈希。候选与安装态的私有依赖、GFM、公开 PDF 文本层和隐藏界面检查均通过，没有启动测试模型进程；原 80 名员工和 17 条工作流的 ID 与状态、根 JSON 哈希保持不变，窗口未显示且无新增提供商进程。安装包中的 Deep Research 报告和来源组件与当前源码逐字节哈希一致；共享 Cline/Pi 配置保持启用。

## 剩余验收

当前应用 Codex 原生适配仍由安装的官方可执行程序承载；平台原生子 Agent 工具与应用自身传输不是同一个接口。只读配置认证分类、provider 标签或 `/models` 成功都不能证明使用用户的中转额度。前序验收没有提交模型任务；用户明确授权后，本次在隔离 Core 运行了上述 2 员工、1 来源的小型真实任务，正式研究数据未被用于测试。

用户已明确允许 CLI，并要求主 Agent 独立在后台测试。Codex 的单来源真实研究与恢复/下载已通过；共享 Pi 双来源试验只到最终审阅，共享 Cline 双来源试验只到首次核验，均未完成交付。更复杂主题及竞品同题质量评测仍未进行。共享 Pi/Cline 的自定义兼容路由配置已核对，实际费用未单独核账，不能凭 provider 名称推断。后续扩展实测应继续约束来源、团队、任务数和输出长度，避免无边界消耗。

PDF 输入限定公开带文本层资料，8 MiB、80 页、800,000 字符，扫描件需外部 OCR。单次回复上限为 500,000 字符（实现按 JavaScript 字符串长度），1000 来源单一核验分支曾明确超限，分成八个核验分支的样例完成。相同的 128 节点/1000 来源合成压力场景在[修改前](../../../.aexus/artifacts/deep-research-fix/release-09186d9/performance-before.log)与[修改后](../../../.aexus/artifacts/deep-research-fix/release-09186d9/performance-after.log)均完成；计划字段从 5,051,103 降到 42,284 字节，峰值检查点从 50,806,944 降到 40,536,082 字节，clone/describe/JSON 的本次 p95 从 52.57 降到 47.43 ms，不含磁盘 fsync。结果说明仍需合理分支，不能承诺任意聚合规模或生产性能已“极致”。`workflow.events` 通用统计与嵌套研究 progress 不同，当前 UI 读取 `workflow.get`；模型路由、跨平台和竞品实际质量均仍未验收。
