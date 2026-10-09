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

以下矩阵区分已完成的基础验收与尚未覆盖的复杂场景。阅读账本记录前序基线；本次修复文件另行完成差异审查。

## 用户要求与当前证据

| 要求 | 当前实现与实际验证 | 尚未建立的结论 |
| --- | --- | --- |
| 员工与 Manager 数量动态 | 初调研后由计划产生团队、分支责任及管理关系；并发上限独立于团队人数。真实 runtime fixture 验证多个 Manager、意见冲突和变更后重新审核。 | 真实模型对不同复杂度主题的扩编决策质量。 |
| 先调研再规划，不虚构初始进度 | scout/plan 没有固定百分比或 ETA；计划形成后，DAG、任务状态与进度来自同一持久状态。失败与停止不计作成功。 | 开放式真实任务的时间预测，本轮不提供此承诺。 |
| 任意 DAG 与中途重规划 | 支持分叉汇合、多父、跨层、共享综合结果和 ready 节点并行；慢独立分支不阻塞无关工作。修订保留已完成任务、证据、旧计划及原因，目标变化使用新节点 ID。 | 所有可能拓扑和真实提供商恢复情形均已覆盖。 |
| 丰富且简单的可视化 | 云形节点、LR/TB 方向、适配、缩放、邻域聚焦、详情与分页历史；连线接到云轮廓，运行、完成和失败状态仍可辨。支持审批、调整方向、暂停、继续、取消与必要重试。21 项 Chromium 检查覆盖 48 节点、36 同层/36 深层、1440/768/390、65 条历史、长报告、暗主题和停止状态。 | 主观“最佳视觉”；48 节点验收不冒充全部规模无性能限制。 |
| 广泛来源与可信引用 | 引擎独立读取公开 HTML/文本/PDF，逐片段匹配原文，保存真实 URL、时间、原文 SHA256 和 locator；拒绝虚构片段、未知来源和仅搜索摘要。冲突论断在发现页优先展示，可分别定位双方原文。 | 原文匹配不自动证明语义蕴涵；单来源真实任务已完成，不能据此承诺每个主题的来源广度。 |
| 内容详实与真实交付 | 报告、来源和论断互相定位；Host 发布 HTML、Markdown、来源 CSV、证据 JSON、计划 JSON 五份真实文件。独立研究语料通过当前证据门槛，含 17 来源、28 论断、10 章；键盘引用、定位及返回报告通过。 | 该语料是原生 Agent 成果经引擎验证，非应用自动研究输出；当前没有 PDF/Word 导出、OCR 或报告 Mermaid 渲染。 |
| 清晰边界、精简与性能 | Host 负责权限、身份、生命周期、持久化与发布；Engine 经公开 Contract 调用 Host，UI 消费 canonical 投影。计划只保存静态拓扑，执行结果只保留在 DAG；已删除固定模板、重复 claim 存储、完整提示和产物正文副本。完成检查点可重新发布相同字节及哈希而不重做研究。 | 不以模拟数据或不含 fsync 的计时宣称生产性能已“极致”。 |
| 全项目阅读、竞品、构建与安装 | 2,202 个 tracked 文件逐路径审计：1,985 份文本完整实读，19 份生成文件核生成源，198 份图像/音视频/上游归档核清单；当前哈希全部匹配。公开厂商与开源方案已对标；最新源码已构建、安装和隐藏重开。 | 未登录竞品实跑、未做同任务盲评；macOS 结果不外推 Windows/Linux。 |

UI 默认自动批准计划，用户可关闭；API 创建默认等待批准。自动批准仍先初调研、规划和 Manager 审核，不跳过这些职责。多个 Manager 中任一要求修订都会阻止计划自动批准。

## 可复核验收

[基线审计](../../../.aexus/artifacts/deep-research-independent/final-audit.json)核对当时全部 tracked 路径与 SHA256：无重复、遗漏、孤立、过期或未完成项。后续 Deep Research 改动另行复核，基线哈希不代表当前提交。[阅读账本](../../../.aexus/artifacts/deep-research-independent/reading-coverage.json)保存逐文件证据，其他 Agent 记录只在当时哈希匹配时计入。曾发生的动态批次误登记已对原 20 文件补齐实际全文；资源目录和生成目录的误分类也已补读并纠正，说明见[阅读审计记录](../../../.aexus/artifacts/deep-research-independent/reading-notes.md)。SVG、手写 Manager 文档、资源来源清单及 MiniNotion 数据目录均已实读。

生成文件没有冒充全文阅读：Contract 与 Manager 的 `--check` 分别验证 302 能力/243 schema 和 348 CLI 项；emoji 与 Margin Reader API 的当前生成器在截获写入的 VM 中逐字复现，未改源文件；七份 npm 锁核对所属 package 版本和每个直接生产依赖的锁定条目，不声称逐字审阅第三方传递依赖。

当前[完整相关回归](../../../.aexus/artifacts/deep-research-fix/release-09186d9/full-regression.log)为 101/101，通过命令：

```sh
node --test Engine/deep-research/test/workflow.test.mjs Engine/deep-research/test/source-read.test.mjs Engine/deep-research/test/cli.test.mjs Infra/src/test/deep-research-independent-test.mjs Infra/src/test/deep-research-host-test.mjs Infra/src/test/retired-research-unit-test.mjs
```

测试使用真实领域/runtime/Host 模块，原生传输、授权和测试原文读取明确使用 fixture，无模型与生产数据。[Host 恢复证据](../../../.aexus/artifacts/deep-research-independent/host.json)包含 pause/amend/resume、重启保留审批、review 驱动重规划，以及最终文件重放不重复派发。退休 Web Demo 直接退出，不再监听或触发研究；诊断工具显示实际 DAG 和失败/暂停/取消状态。

[UI 21 项记录](../../../.aexus/artifacts/deep-research-ui/verification.json)和[独立长报告阅读](../../../.aexus/artifacts/deep-research-independent/reading-ui/corpus-verification.json)保留截图与交互证据；[独立语料验证](../../../.aexus/artifacts/deep-research-independent/research-corpus/independent-proof/validation.json)明确区分实际 GET 原文、匹配论断及历史工具摘录，不能把后者算成独立 HTTP 取证。

原工作区 `aexus-boundaries-test.mjs` 因既有三份 tracked 根 Markdown 不符合目录白名单失败；用户文件与 package 修改已保留。在隔离副本只补 HEAD 的 build 元数据、排除这三份文档后，原脚本 7 项通过并扫描 93 个 Engine/Contract 源文件无跨层依赖。两种结果见[边界证据](../../../.aexus/artifacts/deep-research-independent/isolated-boundaries.json)；隔离通过不代表原工作区布局检查通过。

## 当前安装

截至 2026-10-09，[最新安装记录](../../../.aexus/artifacts/deep-research-fix/latest-installed.json)保存实际 `/Applications/Aexus.app` 的构建提交和 ASAR SHA256。Deep Research `2.0.0` 已包含独立核对的 HTML 标题、快速研究预算、逐来源报告引用约束、超额来源读取筛选、停止后的状态同步和持久错误恢复。

最新安装记录的 `installationProof`、`packageProof` 和 `restorationProof` 分别指向当前安装操作、实际安装包检查与隐藏恢复证据。私有依赖、GFM、公开 PDF 文本层和隐藏界面检查均通过，没有启动测试模型进程；原 80 名员工和 17 条工作流的 ID 与状态、根 JSON 哈希保持不变，窗口未显示且无新增提供商进程。此前一次安装前曾因后台应用进程退出而安全中止；以隐藏模式恢复当时版本并确认空闲后才继续安装，没有强制结束工作。

## 剩余验收

当前应用 Codex 原生适配仍由安装的官方可执行程序承载；平台原生子 Agent 工具与应用自身传输不是同一个接口。只读配置认证分类、provider 标签或 `/models` 成功都不能证明使用用户的中转额度。前序验收没有提交模型任务；用户明确授权后，本次在隔离 Core 运行了上述 2 员工、1 来源的小型真实任务，正式研究数据未被用于测试。

用户已明确允许 CLI，并要求主 Agent 独立在后台测试。此次有限范围真实研究与恢复/下载已通过；更复杂主题、多个提供商及竞品同题质量评测仍未进行。模型费用所属路由未单独核账，不能凭 provider 名称推断。后续扩展实测应继续约束来源、团队、任务数和输出长度，避免无边界消耗。

PDF 输入限定公开带文本层资料，8 MiB、80 页、800,000 字符，扫描件需外部 OCR。单次回复上限为 500,000 字符（实现按 JavaScript 字符串长度），1000 来源单一核验分支曾明确超限，分成八个核验分支的样例完成。相同的 128 节点/1000 来源合成压力场景在[修改前](../../../.aexus/artifacts/deep-research-fix/release-09186d9/performance-before.log)与[修改后](../../../.aexus/artifacts/deep-research-fix/release-09186d9/performance-after.log)均完成；计划字段从 5,051,103 降到 42,284 字节，峰值检查点从 50,806,944 降到 40,536,082 字节，clone/describe/JSON 的本次 p95 从 52.57 降到 47.43 ms，不含磁盘 fsync。结果说明仍需合理分支，不能承诺任意聚合规模或生产性能已“极致”。`workflow.events` 通用统计与嵌套研究 progress 不同，当前 UI 读取 `workflow.get`；模型路由、跨平台和竞品实际质量均仍未验收。
