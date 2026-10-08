# Deep Research 审查结果

检查日期：2026-10-09（Asia/Shanghai）。动态研究引擎、证据链、界面和本机安装已分别验证；应用内真实模型研究与竞品配对质量评测尚未完成，不能宣称“绝对完美”或“超越全部竞品”。所有实现、阅读和操作由平台原生子 Agent 完成，没有通过 CLI 启动收费模型任务。

## 用户要求与当前证据

| 要求 | 当前实现与实际验证 | 尚未建立的结论 |
| --- | --- | --- |
| 员工与 Manager 数量动态 | 初调研后由计划产生团队、分支责任及管理关系；并发上限独立于团队人数。真实 runtime fixture 验证多个 Manager、意见冲突和变更后重新审核。 | 真实模型对不同复杂度主题的扩编决策质量。 |
| 先调研再规划，不虚构初始进度 | scout/plan 没有固定百分比或 ETA；计划形成后，DAG、任务状态与进度来自同一持久状态。失败与停止不计作成功。 | 开放式真实任务的时间预测，本轮不提供此承诺。 |
| 任意 DAG 与中途重规划 | 支持分叉汇合、多父、跨层、共享综合结果和 ready 节点并行；慢独立分支不阻塞无关工作。修订保留已完成任务、证据、旧计划及原因，目标变化使用新节点 ID。 | 所有可能拓扑和真实提供商恢复情形均已覆盖。 |
| 丰富且简单的可视化 | 圆形节点、LR/TB 方向、适配、缩放、邻域聚焦、详情与历史；支持审批、调整方向、暂停、继续、取消与必要重试。19 项 Chromium 检查覆盖 48 节点、36 同层/36 深层、1440/768/390、长报告、暗主题和停止状态。 | 主观“最佳视觉”；48 节点验收不冒充全部规模无性能限制。 |
| 广泛来源与可信引用 | 引擎独立读取公开 HTML/文本/PDF，逐片段匹配原文，保存真实 URL、时间、原文 SHA256 和 locator；拒绝虚构片段、未知来源和仅搜索摘要。冲突论断在来源页优先展示，可分别定位双方原文。 | 原文匹配不自动证明语义蕴涵；未运行真实应用研究，不能承诺每个主题的来源广度。 |
| 内容详实与真实交付 | 报告、来源和论断互相定位；Host 发布 HTML、Markdown、来源 CSV、证据 JSON、计划 JSON 五份真实文件。独立研究语料通过当前证据门槛，含 17 来源、28 论断、10 章；键盘引用、定位及返回报告通过。 | 该语料是原生 Agent 成果经引擎验证，非应用自动研究输出；当前没有 PDF/Word 导出、OCR 或报告 Mermaid 渲染。 |
| 清晰边界、精简与性能 | Host 负责权限、身份、生命周期、持久化与发布；Engine 经公开 Contract 调用 Host，UI 消费 canonical 投影。删除固定模板、重复 claim 存储、完整提示和产物正文副本；完成检查点可重新发布相同字节及哈希而不重做研究。 | 不以模拟数据或不含 fsync 的计时宣称生产性能已“极致”。 |
| 全项目阅读、竞品、构建与安装 | 2,202 个 tracked 文件逐路径审计：1,985 份文本完整实读，19 份生成文件核生成源，198 份图像/音视频/上游归档核清单；当前哈希全部匹配。公开厂商与开源方案已对标；最新源码已构建、安装和隐藏重开。 | 未登录竞品实跑、未做同任务盲评；macOS 结果不外推 Windows/Linux。 |

UI 默认自动批准计划，用户可关闭；API 创建默认等待批准。自动批准仍先初调研、规划和 Manager 审核，不跳过这些职责。多个 Manager 中任一要求修订都会阻止计划自动批准。

## 可复核验收

[最终审计](../../../.aexus/artifacts/deep-research-independent/final-audit.json)核对全部 tracked 路径与 SHA256：无重复、遗漏、孤立、过期或未完成项。[阅读账本](../../../.aexus/artifacts/deep-research-independent/reading-coverage.json)保存逐文件证据，其他 Agent 记录只在当前哈希匹配时计入。曾发生的动态批次误登记已对原 20 文件补齐实际全文；资源目录和生成目录的误分类也已补读并纠正，说明见[阅读审计记录](../../../.aexus/artifacts/deep-research-independent/reading-notes.md)。SVG、手写 Manager 文档、资源来源清单及 MiniNotion 数据目录均已实读。

生成文件没有冒充全文阅读：Contract 与 Manager 的 `--check` 分别验证 302 能力/243 schema 和 348 CLI 项；emoji 与 Margin Reader API 的当前生成器在截获写入的 VM 中逐字复现，未改源文件；七份 npm 锁核对所属 package 版本和每个直接生产依赖的锁定条目，不声称逐字审阅第三方传递依赖。

最新[隔离测试记录](../../../.aexus/artifacts/deep-research-independent/final-tests.json)为 84/84，通过命令：

```sh
node --test Engine/deep-research/test/workflow.test.mjs Engine/deep-research/test/source-read.test.mjs Engine/deep-research/test/cli.test.mjs Infra/src/test/deep-research-independent-test.mjs Infra/src/test/deep-research-host-test.mjs Infra/src/test/retired-research-unit-test.mjs
```

测试使用真实领域/runtime/Host 模块，原生传输、授权和测试原文读取明确使用 fixture，无模型与生产数据。[Host 恢复证据](../../../.aexus/artifacts/deep-research-independent/host.json)包含 pause/amend/resume、重启保留审批、review 驱动重规划，以及最终文件重放不重复派发。退休 Web Demo 直接退出，不再监听或触发研究；诊断工具显示实际 DAG 和失败/暂停/取消状态。

[UI 19 项记录](../../../.aexus/artifacts/deep-research-ui/verification.json)和[独立长报告阅读](../../../.aexus/artifacts/deep-research-independent/reading-ui/corpus-verification.json)保留截图与交互证据；[独立语料验证](../../../.aexus/artifacts/deep-research-independent/research-corpus/independent-proof/validation.json)明确区分实际 GET 原文、匹配论断及历史工具摘录，不能把后者算成独立 HTTP 取证。

原工作区 `aexus-boundaries-test.mjs` 因既有三份 tracked 根 Markdown 不符合目录白名单失败；用户文件与 package 修改已保留。在隔离副本只补 HEAD 的 build 元数据、排除这三份文档后，原脚本 7 项通过并扫描 93 个 Engine/Contract 源文件无跨层依赖。两种结果见[边界证据](../../../.aexus/artifacts/deep-research-independent/isolated-boundaries.json)；隔离通过不代表原工作区布局检查通过。

## 当前安装

实际 `/Applications/Aexus.app` 为 `0.64.0`、Deep Research `2.0.0`，运行源码构建快照 `09cb020`，ASAR SHA256：

```text
2864de6755f90097be6b032185cfea9b40a7827caca3a6763f28704bf70291be
```

[候选](../../../.aexus/artifacts/deep-research-independent/package/verification.json)与[实际安装路径](../../../.aexus/artifacts/deep-research-independent/package/installed/verification.json)均通过私有锁定依赖解析、GFM 表格/列表、真实 PDF 文本层页码及原文哈希、物理 worker/字体/CMap/WASM、隐藏加载和三尺寸布局检查；模型执行 trap 未触发。构建后仅更新审查文档，运行源码指纹保持相同，不为文字变更反复打包。

[安装记录](../../../.aexus/artifacts/deep-research-independent/installation.json)验证员工活动、审批、队列、初始化、全部运行 workflow、自动计划、传输、插件窗口、news/post 触发均为零后，单次正常 SIGTERM 退出，使用项目安装器备份并替换。根 JSON 哈希未改变。[生产隐藏恢复](../../../.aexus/artifacts/deep-research-independent/production-restart.json)验证原 80 个员工 ID、17 个 workflow ID/状态完整保留、无忙碌或新 provider 进程；CoreGraphics 观察到真实主窗口 `onScreen=false`。第一次启动因调用环境继承 `ELECTRON_RUN_AS_NODE=1` 退出，清除此进程环境后恢复；失败证据保留，用户配置未改。

## 剩余验收

当前应用 Codex 原生适配仍由安装的官方可执行程序承载；平台原生子 Agent 工具与应用自身传输不是同一个接口。只读配置认证分类、provider 标签或 `/models` 成功都不能证明使用用户的中转额度。本轮没有提交应用内真实模型任务。

下一步必须先明确用户禁止 CLI 的范围，以及允许使用的中转 provider/模型配置标识；不需要提供密钥或密码。只有执行方式与计费路由明确后，才能进行隔离真实研究、来源语义抽审及与竞品的同题配对评测。不得凭空增加平台桥或把 fixture、原生 Agent 语料、包启动当成这项验收。

PDF 输入限定公开带文本层资料，8 MiB、80 页、800,000 字符，扫描件需外部 OCR。单回答预算为 500 KB，1000 来源单一核验分支曾明确超限，分成八个核验分支的样例完成；最新 `projection-benchmark.mjs --branch-only` 模拟 128 节点/1000 来源完成，峰值检查点 50,806,944 字节，clone/describe/JSON 中位 34.26 ms、p95 57.65 ms，不含磁盘 fsync。这说明需合理分支，不能承诺任意聚合规模。`workflow.events` 通用统计与嵌套研究 progress 不同，当前 UI 读取 `workflow.get`；模型路由、跨平台和竞品实际质量均仍未验收。
