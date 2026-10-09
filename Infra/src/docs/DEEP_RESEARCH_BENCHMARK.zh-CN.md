# Deep Research 对标与独立验收

访问日期：2026-10-08（Asia/Shanghai）。本文服务于 `Engine/deep-research/` 的动态研究升级，记录公开证据、采用理由和验收要求，不代表竞品已在本机实际运行，也不代表 Aexus 已通过这些要求。

## 证据范围

- **官方声明**：实际打开厂商文档、帮助页或产品页后确认的描述；没有登录付费服务或独立复现其效果。
- **源码核验**：实际打开开源仓库代码或架构文档；不等于部署、负载测试或完整运行。
- **本机实测**：必须有执行命令、代码版本、隔离数据目录、退出状态和结果工件；当前对标研究没有竞品实测结果。
- **Aexus 验收要求**：结合本次用户要求提出的产品标准，不冒充业界通用阈值或竞品能力。

2026-10-08 的前序对标由平台原生子 Agent 分工。后续按用户最新要求仅由主 Agent 工作，并使用 CLI 在隔离 Core 运行过一次严格限额的真实应用研究；[审查记录](DEEP_RESEARCH_REVIEW.zh-CN.md)区分该结果与未完成的竞品实跑。模型路由的账单归属仍未单独核对，记录中不输出凭据。

## 公开能力矩阵

下表各行访问日均为 2026-10-08；页面未提供明确发布日期的，按访问时文档记录，不推断上线时间。

| 产品或项目 | 证据类型与日期 | 已核实能力 | Aexus 应采用的行为 | 核验边界 |
| --- | --- | --- | --- | --- |
| [ChatGPT Learn: Web search](https://learn.chatgpt.com/docs/web-search?surface=app) | 官方文档；访问时版本 | Work 的 Deep research 接受研究问题、范围、所需结果与文件或连接应用上下文；可检查报告来源并追问。 | 一个研究入口；报告、来源和后续研究保留同一上下文。 | 未实测网页端研究；未据此确认当前可编辑 DAG、多个 Manager 或精确进度算法。 |
| [OpenAI API: Deep research](https://developers.openai.com/api/docs/guides/deep-research) | 官方文档；含历史专用模型示例 | 说明澄清、输入重写、研究的职责区别；返回搜索或读取调用、内联引用与来源元数据；介绍后台执行、webhook 和工具调用预算。 | 主流程区分初调研、计划、执行和交付；保留真实工具活动和来源。 | 旧模型示例与退役提示见下节，不能直接作为当前模型可用性保证；不是网页端全部产品能力。 |
| [Gemini Apps 帮助](https://support.google.com/gemini/answer/15719111?hl=en) | 官方帮助；访问时版本 | 先生成计划，可 Edit plan，再 Start research；可选择 Search、上传文件和符合账户条件的连接来源；支持报告追问。 | 默认先初调研和规划；用户可用自然语言调整方向；来源范围明确。 | 帮助文档并未建立用户可编辑执行 DAG 或多 Manager 的证据；功能受账户与发布范围影响。 |
| [Gemini Deep Research API](https://ai.google.dev/gemini-api/docs/deep-research) | 官方开发文档；preview | `collaborative_planning` 支持多轮计划审阅，后台任务和流式更新；例子使用 interaction ID、last event ID 续接断开的流。 | 规划与执行分离；断开界面不丢任务；更新有可恢复的身份。 | 流恢复不是任意工作进程崩溃后的任务恢复；没有本机 API 实测。 |
| [Anthropic 多 Agent 研究系统](https://www.anthropic.com/engineering/multi-agent-research-system) | 官方工程文；2025-06-13 | lead 根据复杂度分配研究者；收集发现后可追加研究；独立 CitationAgent；描述持久化计划、检查点恢复和工件引用。 | 人数按实际任务产生；调研反馈修订计划；引用单独核验；结果持久化后传轻量引用。 | 文中架构为单 lead，且承认同步批次瓶颈；历史内部评测不等于当前竞品排名或所有 UI 行为。 |
| [Claude Research 帮助](https://support.claude.com/en/articles/11088861-use-research-on-claude) | 官方帮助；2026-06-02 | 连续搜索根据前一轮发现决定下一步调查，并给出可检查引用；会消耗更多额度。 | 不以固定阶段脚本冒充动态研究；显示真实预算消耗和证据。 | 不推断当前模型、Manager 数量或用户可见 DAG。 |
| [Perplexity Deep Research](https://www.perplexity.ai/en-GB/hub/products/deep-research) | 官方产品页；访问时版本 | 宣称研究计划、跨数百站点检索、文件与网页交叉分析、主来源引用，以及报告、幻灯片、表格、仪表盘交付。 | 广泛检索与详实交付是标准；数据、可视化和报告应相互引用。 | “数百站点”“每个 claim”是厂商承诺，不是本轮独立准确性或速度证明；不复制演示数字。 |
| [LangChain Open Deep Research](https://github.com/langchain-ai/open_deep_research) | README 与源码核验；固定提交见下节 | supervisor 动态发出 `ConductResearch`；研究者和工具分别并行执行；配置并发上限；研究、压缩、写作模型分工，搜索与 MCP 可替换。 | 动态任务数量与可配置资源上限分开；独立子任务并行；压缩摘要保留原始证据。 | 仓库已归档；代码中的 LangGraph 研究循环不自动等于用户可编辑执行 DAG；不是生产恢复保证。 |
| [GPT Researcher 多 Agent 文档](https://raw.githubusercontent.com/assafelovic/gpt-researcher/master/docs/docs/gpt-researcher/multi_agents/langgraph.md) | 项目文档核验；访问时 master | 初步浏览后生成大纲，各节并行研究、审查和修订，再写作并导出 PDF、DOCX、Markdown。 | 保留初调研、分支审核、修订和多格式工件的价值。 | 示例明示固定角色团队，本项目不能照搬固定员工数量或固定流水线；没有运行该示例。 |
| [DeerFlow 架构](https://raw.githubusercontent.com/bytedance/deer-flow/main/docs/ARCHITECTURE.md) | 项目架构文档核验；访问时 main | 单 lead；harness 与 app 单向依赖；subagent execution ID、SSE 更新、工件、线程隔离和持久化 MCP task。 | 复用同一运行生命周期；业务状态与界面分离；代理结果与工具结果有稳定身份。 | 架构文档不等于所有路径恢复测试已通过；不能把单 lead 宣称为多个 Manager。 |
| [STORM / Co-STORM](https://github.com/stanford-oval/storm) | 项目 README 核验；含 2024-09 Co-STORM 说明 | 多视角提问、资料收集后大纲与写作；用户可中途引导讨论；动态 mind map 整理概念。 | 研究过程中可引导，且可用知识视图浏览发现。 | mind map 是知识组织图，不是任务依赖 DAG；项目明确承认报告仍可能需要人工编辑。 |

## 时效与源码复核

### LangChain 归档

实际打开 [仓库主页](https://github.com/langchain-ai/open_deep_research) 时，GitHub 顶部原文为：

> This repository was archived by the owner on Aug 21, 2026. It is now read-only.

公开 GitHub API `repos/langchain-ai/open_deep_research/commits/main` 返回提交 `1b7d2e80db9faa586165c60e09096dbbfd483a64`，提交日期 2026-08-10。归档日期与最后提交日期是不同事实。

固定源码：[deep_researcher.py](https://github.com/langchain-ai/open_deep_research/blob/1b7d2e80db9faa586165c60e09096dbbfd483a64/src/open_deep_research/deep_researcher.py)。关键位置：`supervisor`（171 行起）绑定 `ConductResearch`；`supervisor_tools`（217 行起）处理动态研究委派；280-294 行限制并发并 `asyncio.gather`；`compress_research`（492 行起）保留摘要和 raw notes；`final_report_generation`（582 行起）单独合成报告。

这些代码支持“研究者按委派动态创建、存在资源上限”的判断，不支持“固定只能五个员工”的判断。归档后的代码仍可供借鉴，但不能把仓库当作持续维护承诺。

### OpenAI 旧专用模型示例

[Deep research guide](https://developers.openai.com/api/docs/guides/deep-research) 顶部提示把 `o3-deep-research` 与 `o4-mini-deep-research` 的 shutdown date 写为 July 23, 2026，并说明下面保留旧模型与工具配置作为参考。其短引文为：

> lists July 23, 2026 as the shutdown date for `o3-deep-research` and `o4-mini-deep-research`

[Deprecations](https://developers.openai.com/api/docs/deprecations) 的 `2026-04-22: Legacy GPT model snapshots (July 2026 shutdown)` 小节列出 July 23, 2026，表中同时出现 `o3-deep-research-2025-06-26` / `o3-deep-research` 和 `o4-mini-deep-research-2025-06-26` / `o4-mini-deep-research`，替代项写为 `gpt-5.6-sol`。

本轮没有对官方 API、特定账户或中转站别名做实际调用，因此只确认文档内容，不将其扩展为某个中转路由的实时可用性结论。工程上应保持模型可配置，不能复制旧示例硬编码，也不能擅自替换用户指定的 `gpt-6.1-sol xhigh`。

## Aexus 核心验收矩阵

| 能力 | 必须成立的行为 | 失败反例 |
| --- | --- | --- |
| 初调研与规划 | 起始只有正在调研或规划的状态、已耗时和实际活动；当前工作范围尚未形成时百分比和 ETA 为未知。 | 创建任务即显示 5%、固定 15 分钟或按轮询自动增加百分比。 |
| 动态团队 | 研究任务决定员工角色和人数；资源上限约束并发，不等于固定团队。支持一个简单问题和多个独立分支产生不同团队。 | 永远创建同一组五人，或只改界面头像数。 |
| 多 Manager | Manager 有明确分支责任、调度范围和汇合结果；一个或多个由计划决定；保持 Core 权限与员工引擎身份。 | UI 显示两个 Manager，实际所有任务仍固定由唯一隐藏协调员串行执行。 |
| 执行 DAG | 节点有稳定 ID、依赖和负责人；无依赖或依赖已满足的节点才能执行；独立 ready 节点可并行。 | 图只是固定流程装饰，后台仍顺序遍历阶段。 |
| 重规划 | 新发现或用户引导形成新 revision、原因及任务差异；保留旧计划与已完成工件；新增节点加入依赖图。 | 覆盖原数组使历史与引用丢失，或改变图后仍执行被取消任务。 |
| 进度一致 | DAG、任务列表、统计和进度条由同一持久状态派生；明确分母对应当前计划；范围增长时说明修订，不能捏造稳定 ETA。 | failed/skipped 计入成功，追加任务却始终保持旧百分比，或仍有必要工作时显示 100%。 |
| 研究覆盖 | 分开统计发现、实际读取、可用证据、独立来源和最终引用；来源预算与主题复杂度相关，允许说明无法获取。 | 搜索结果 URL、摘要或同文转载分别算成多份独立证据。 |
| 引用可信 | 重要事实有实际获取的正文依据；保存 URL、标题、获取时间和可定位片段；摘要压缩不丢来源；有支持不足或冲突标识。 | URL 可访问但正文不支持结论，只有搜索 snippet，或引用编号无对应条目。 |
| 详实交付 | 摘要、问题覆盖、方法、比较或数据、结论、局限和完整引用；按任务产生可下载工件；可视化的数据有来源。 | 只交付几段总结、空图、模板性建议或声称生成但不存在的文件。 |
| 中途操作 | 可查看节点与证据、修改方向、取消、重试必要分支并继续；关键状态有清晰反馈。 | 点击取消只停止动画，重试重新调查全部完成分支，或取消后迟到结果复活任务。 |
| 恢复 | 重新打开界面保留计划、任务、工件与引用；中断工作可明确恢复或重试，不能冒认运行中任务已成功。 | 重启后丢计划，重复创建员工，或仍引用旧失效工件。 |
| 性能与简洁性 | 批量合并状态更新；大图和长报告不会让操作停顿；模型与网络耗时、调度耗时、渲染耗时分别记录。 | 轮询重建全部图、把大证据全文重复塞入每个节点、用多层包装替代已有接口。 |

## 高价值端到端场景

这些用例先在隔离 workspace 和确定性模型协议中验证编排，再进行明确路由的真实研究。fixture 通过不等于真实模型质量通过。

1. **未知范围到动态规划**：输入一个没有明确维度的比较题。第一轮只产生初调研与未知进度；证据形成后出现 DAG。简答题与复杂比较题必须产生不同任务数或明确的不扩编理由。
2. **依赖、并行与多个 Manager**：一个 Manager 管政策证据，另一个管技术与成本；分别产生分支，最终比较依赖两支。让一个分支变慢，验证不依赖它的 ready 节点仍继续；最终写作必须等待必要分支。
3. **证据导致重规划**：初调研发现产品已退役或法规适用日期改变。新增核验分支，保留旧计划 revision 和完成成果，说明原因；报告不能继续把已失效假设当事实。
4. **失败、重试与部分成果**：一个必要节点首次 fetch 或代理执行失败。明确失败与已完成部分；重试只重复该必要节点及确需更新的下游；未满足依赖不得显示全部成功。
5. **取消与迟到响应**：执行中取消，确认实际相关代理进入停止路径，停止派新工作；再注入迟到结果，任务不能恢复 running 或完成，完成工件保持可审计。
6. **中断恢复**：保存计划后断开界面，再在节点运行时中断执行进程。分别验证流续接与工作恢复；无重复员工、无丢失引用、无重复发布；两种恢复不能混为同一结果。
7. **复杂报告与引用反例**：比较题包含近期版本、价格、限制、适用场景与推荐。注入同文转载、无法读取页面、错误日期、互相矛盾的一手来源、引用错配。报告必须覆盖所有问题，暴露矛盾与未知，不通过字数堆积伪造深度。
8. **大图与窄屏**：构造至少 50 个节点、多个层级 Manager 与长中文标题，在桌面和窄屏检查框选、缩放或适配、选择详情、状态更新、长来源标题与报告表格；任何必要文字或操作不得被覆盖。

面向开放式复杂比较题，可以把“至少 20 个实际读取且相关的来源、8 个独立域、一手资料优先”作为专项压力场景，而非所有题目的硬规则。权威单一原文足以回答的问题不应被迫凑网站。验收指标应记录有效引用、事实支持率、需求覆盖率和实际资源消耗。

## 质量对比方法

- [DeepResearch Bench](https://github.com/Ayanami0730/deep_research_bench) 提供研究报告质量 RACE 和引用支持 FACT 两轴，支持用任务相关标准评审覆盖、深度、指令遵循、可读性与有效引用。访问日 README 已包含 2026-09-22 评测模型变更，不能混合不同 judge 版本的成绩。
- [Google DeepSearchQA 说明](https://blog.google/innovation-and-ai/technology/developers-tools/deep-research-agent-gemini-api/) 描述 900 个多步、17 领域任务，关注完整答案集合的 precision 与 recall。适合验证“找到所有对象”，不能替代长报告评估。
- 先以少量代表性任务形成原始报告和来源快照，再做固定 rubric 的盲评；配对记录模型、运行时间、工具调用、预算与可用来源。只报告本轮实际测得的结果，不能凭厂商宣传或单个截图宣称超越。
- 固定流程正确性、真实研究质量和视觉交互各自产生证据。报告截图不能证明引用正确，构建成功不能证明已安装，fixture 不能证明收费模型路由正确。

## 验证状态

| 范围 | 当前状态 | 说明 |
| --- | --- | --- |
| 公开竞品页面与上述关键源码 | 已核验 | 使用公开网页搜索与实际打开页面；未运行竞品。 |
| Aexus 域模型与调度 | 独立 fixture 16/16 通过（2026-10-09） | `Infra/src/test/deep-research-independent-test.mjs` 覆盖真 fork/join、多父、共享节点、跨层依赖、慢分支隔离、单最终稿、取消迟到、格式重试、逐来源引用，以及预算内的旧 URL 来源更新；不代表真实模型研究质量。 |
| 持久恢复与用户调整 | 独立 Host fixture 3/3 通过（2026-10-09） | `deep-research-host-test.mjs` 使用真实 workflows/runtime 与临时存储，传输及授权为 stub；覆盖恢复、pause/amend/resume、review revise 后重新规划、停止状态和交付文件校验。 |
| 真实公开资料与引用 | 当前独立取证门槛通过 | HTML/文本/PDF 独立取得原文、逐片段匹配并保存 locator、时间、最终 URL 与 SHA256；虚构片段不可进入核验或报告。原生研究语料经当前门槛保留 17 来源、28 论断、10 章，不是应用自动研究输出。 |
| 来源、DAG 与报告阅读 | 当前浏览器路径通过 | UI 19 项检查覆盖 48 节点、36 同层/36 深层、3 尺寸、来源矛盾及双方定位、精确论断和报告滚动返回；独立长语料使用实际 Page/describe 验证键盘引用和嵌入阅读。 |
| 真实多 Agent 应用研究 | 一个限定题目已完成 | 隔离 Core 经应用原生 Codex 传输完成 `example.com` 单页面研究：2 名员工、1 个来源、五份交付文件，重启后下载哈希一致；[原始验证](../../../.aexus/artifacts/deep-research-fix/live-1791509850839/verification.json)。随后两来源尝试遇提供商断流并主动取消，不计成功。尚无复杂主题、多站点及竞品同题实测，计费路由未独立核账。 |
| macOS 构建、安装与隐藏恢复 | 当前源码构建并已安装 | [最新安装记录](../../../.aexus/artifacts/deep-research-fix/latest-installed.json)的 `buildHead` 指明运行时代码版本及安装证据路径；候选与实际安装包私有依赖/GFM/PDF/3 尺寸验收通过。正常退出、项目安装器和隐藏恢复保留原 80 员工、17 workflow 与根状态哈希，窗口隐藏，安装验收没有发送模型任务。 |
| HTML 导出 Markdown 排版 | 实际安装路径通过 | 私有锁定 micromark/GFM 在实际 Electron/ASAR 内输出表格和列表；不受信 HTML 转义、危险链接限制已有领域回归。没有 PDF/Word 导出或 Mermaid 渲染的完成声明。 |
| 全库阅读与隔离回归 | 前序阅读审计闭合，当前相关回归 100/100 通过 | 前序基线共 2202 tracked 文件：1985 文本完整实读、19 生成文件核源、198 图像音视频/上游归档核清单；基线 SHA 不冒充后续改动的当前 SHA。最新[测试日志](../../../.aexus/artifacts/deep-research-fix/release-bbadb80/full-regression.log)仍使用 fixture 传输与权限，不代表真实研究质量。 |
| Windows / Linux 原生运行 | 未测试 | 本机 macOS 结果不能外推。 |
