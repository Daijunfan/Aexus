# Deep Research 审查记录

日期：2026-10-09。本文记录实际阅读、代码验证和剩余约束，不代表全项目已通读，也不代表真实收费模型研究已验收。UI 验收记录由 UI 负责人补充。

## 后端实现与验证

本地分支 `codex/deep-research-dag-ui`，未推送。稳定提交：

- `c97798d`：动态研究团队、任意 DAG 执行、版本化重规划、证据与报告产物；修复暂停恢复、格式修复恢复、并发终止和核验输入范围。
- `0942193`：将退休引擎判别测试移回 Infra，消除 Engine 测试对 Infra 实现的导入。
- `7c738cf`：节点研究目标正式传给执行员工；已完成节点换目标必须使用新 ID，纯显示名称可更新。
- `fe58e82`：使用 Engine 私有锁定的 micromark/GFM 依赖生成安全 HTML 表格、列表与引用。
- `4e7a1cc`：删除未使用的固定 schema 模板与重复 source claim 状态；发现和来源视图使用统一论断数据。
- `b00c144`：最终 UI 阅读、圆形图聚焦和来源定位状态；`3b87553`、`383dad2` 为独立 QA 与文档提交。
- `fe21344`：引擎独立取得公开 HTML/文本，保存逐片段原文哈希、读取时间和最终 URL；假片段与不可读来源不能进入核验、综合或报告引用。旧运行态重新取证，已完成历史报告保留归档。
- `812cfe3`：恢复公开 PDF 文本层输入，真实页码和哈希进入同一证据链；取消后等待已开始的来源读取清理。公开投影使用逐片段数据，删除连接全文的重复别名。
- `ddb3ad4`：完成任务移除持久化 prompt，统一单回答体量限制，规划提示按回答体量分支核验；过大回答直接报告大小限制，不重复格式修复。

验证使用实际 `runtime.mjs`、`workflows.ts` 和公开 Contract 数据形状，原生传输、权限与资源发现按测试明确模拟。没有启动模型代理进程，没有使用用户生产数据：

- 稳定提交前：引擎、独立领域、Host 生命周期和退休清理共 48 项通过，命令退出码 0。
- 边界测试迁移后：引擎与退休清理 33 项通过，退出码 0。
- 目标语义修改后：引擎、独立领域和 Host 生命周期 39 项通过，退出码 0。
- 所有提交前 `git diff --check` 均退出 0。
- 独立 HTML/文本取证阶段，source-read 与 workflow 共 46 项通过；`812cfe3` 后 source-read 与 workflow 共 52 项通过，包括 PDF 原文页码、伪造片段、页数/字符限制、取消与整批清理。独立领域测试 13 项与实际 Host 生命周期 2 项通过。
- `812cfe3` 候选已从源码重新构建，实际隐藏 Electron/ASAR 验收通过：四个锁定依赖从 Engine 私有目录解析，GFM 表格/列表正常导出，W3C 公开 PDF 的第 1 页文本和原文哈希正确，worker/字体/CMap/WASM 物理资源存在。该候选未安装；后续布局与提示优化需形成新的准确候选快照。
- 完整 `aexus-boundaries-test.mjs` 在根目录既有额外 Markdown 的检查处失败，尚未运行到静态依赖阶段；保留这些用户文件，未删除或移动。

覆盖的关键行为包括多父依赖、分叉汇合、跨层边、共享综合结果、短分支即时推进、报告重新生成、已完成调查复用、同 receipt 恢复、取消后新 attempt、迟到结果拒绝、多个 Manager 意见冲突和来源隔离。

## 实际阅读范围

以下文件已按段完整阅读；自动生成文件和持续编辑的 UI 另列，未用检索命中代替通读。

### Engine

- `Engine/deep-research/agents.mjs`、`model.mjs`、`runtime.mjs`、`schema.mjs`、`graph.mjs`、`evidence.mjs`、`reports.mjs`、`engine.json`、`cli.mjs`。
- `Engine/deep-research/test/workflow.test.mjs`、`test/projection-benchmark.mjs`。
- `Engine/workspace-audit/Page.tsx`、`cli.mjs`、`engine.json`、`workflow.mjs`。
- `Engine/profile-improvement/Page.tsx`、`cli.mjs`、`engine.json`、`runtime.mjs`、`workflow.mjs`、`Preview.tsx`、`layout.mjs`。
- `Engine/PPT-maker/Page.tsx`、`cli.mjs`、`engine.json`、`runtime.mjs`、`workflow.mjs`、`render.mjs`。

Deep Research 的 `Page.tsx`、`ResearchGraph.tsx`、`ui.ts` 持续迭代，已核对具体字段流和操作状态；新增 `SourcePanel.tsx`、`ReportView.tsx` 已阅读。其最终版本、CSS 和浏览器验收由 UI 负责人维护记录。未通读各 Engine 的所有文档、旧调试脚本与测试，未通读大插件目录。

### Contract

- `Contract/protocol.ts`、`workflow.ts`、`engine.ts`、`policy.ts`、`node-client.mjs`。
- `Contract/engine.schema.json`、`request.schema.json`。
- `Contract/README.md`、`PROTOCOL.md`、`WORKFLOWS.md`、`ENGINE_GUIDE.md`。

`Contract/commands.v1.json` 只读取相关 session/workflow 能力段。已确认 `Infra/src/tooling/sync-contract.mjs` 从 `api-registry.ts`、`api-effects.ts` 和 `Contract/policy.ts` 生成该目录，并由 `--check` 校验逐字一致；审查以这些源定义为主，不声称通读 12,965 行生成 JSON。

### Infra

- `Infra/src/main/server.ts`、`workflows.ts`、`retired-research.ts`、`contract.ts`。
- `Infra/src/main/engine-scope.ts`、`engine-scope-api.ts`、`authorization.ts`、`request-context.ts`、`core-events.ts`。
- `Infra/src/main/atomic-file.ts`、`resources.ts`、`store.ts`、`client-state.ts`。
- `Infra/src/main/native-sessions.ts`、`codex-native.ts`、`claude-provider.ts`。
- `Infra/src/shared/activity.ts`、`api-effects.ts`、`infra-contracts.ts`、`workflow-schema.ts`、`presentation-events.ts`、`api-registry.ts`。
- `Infra/src/tooling/sync-contract.mjs`。

另核对 `Infra/src/shared/types.ts` 的消息、任务和活动预览类型，以及独立研究测试的测试边界。有效路由检查仅输出配置分类、认证模式和键是否存在，不输出凭据值；没有运行 provider 或收费探针。Infra renderer 的全面阅读归 UI 负责人。

## 边界与删减判断

生产 Deep Research 通过 `context.client.invoke` 使用 Infra，未直接导入 Infra 实现或写入 Infra 数据库。Host 负责身份、权限、版本、持久化、生命周期和最终文件发布；Engine 负责领域任务、证据、审查和报告。并发节点的串行 checkpoint 队列用于保留快照顺序，有明确用途。

搜索任务已删去重复来源正文、完整报告和计划，仅保留问题、目标、URL 去重、依赖摘要和必要发现。实际 run 生成的 48 节点、80 来源、50 任务基准中，最大检查点从 18,594,753 字节降至 8,136,162 字节，提示词从 12,505,693 字节降至 2,488,785 字节。该基准不计磁盘 fsync；1000 来源样例在 20 MiB 处停止测量，不能作不同执行进度的性能同比。

重复公开投影已在 `b8324ea` 收敛：图节点只由 canonical `graph` 返回，完整报告由 `deliverable` 返回，历史由 `planRevisions` 返回，`plan` 和 `report` 保留必要元数据。`812cfe3` 又移除连接原文的别名，新 UI 直接读取逐片段 proof。未使用的固定 schema 常量已在 `4e7a1cc` 删除；不能继续把它们列为当前未解决问题。

`ddb3ad4` 后，真实 run 的模拟 128 节点、1000 来源、8 核验分支样例完成：最大 checkpoint 64,629,618 字节，clone/describe/JSON 测量中位 32.22 ms、p95 54.49 ms；已完成任务的持久化 prompt 为 0 字节。这不等于调用提示或结果正文为零，也不计磁盘 fsync。48 节点/80 来源样例最大 checkpoint 约 4.597 MB。1000 来源单分支聚合回答仍超过 500 KB 限制，失败保留；通过的是明确分支结构，不能宣称全部拓扑或生产性能已达到极致。

## 剩余约束

- `fe21344` 后，来源必须通过引擎独立公开 HTTP(S) 读取及完整片段匹配。员工提交的摘要、时间或哈希不能建立取证证明；同 URL 的虚假片段保留拒绝原因，不污染已取得的真实片段。这是原文匹配门槛，不等于自动证明所有论断语义。
- PDF 输入限带文本层的公开资料，8 MiB、80 页、800,000 字符；扫描件需先 OCR，密码文件须提供无密码版本，当前不实现 OCR。真实公开 W3C PDF 的 GET、解析和伪造片段拒绝，以及 `812cfe3` 完整包内解析和资源路径已验证。
- HTML 表格、列表的源码显示已在 `fe58e82` 修复；`812cfe3` 的新候选已解决过期 renderer 和 Engine 私有依赖缺失。ASAR SHA-256 为 `470b083d7b283770e0bc2328d550eb011842a8211e33c9a5678584bbb09faa64`，构建和逐文件证据在 `package/verification.json`。实测宿主研究容器多出 60 px 高度，UI 正在修复；新候选验收尚未完成。报告 Mermaid 代码仍按代码展示，未引入额外图解框架。
- `workflow.events` 的通用统计字段与本引擎嵌套 `progress` 结构不同，事件统计会缺失；当前 UI 读取 `workflow.get`，不依赖该统计。
- Deep Research CLI 的 UTF-8 字符数与文件字节数问题已由 `71e1574` 修复，并用中文导出 fixture 验证真实字节计数。
- 2026-10-09 只读有效配置检查不能证明 Aexus 的模型调用使用中转额度：运行应用及可信 Codex 员工继承用户配置，未发现显式请求地址覆盖。认证模式与自定义提供商标签不能代替真实路由证据；未启动模型执行。

完整阅读进度记录在 `.aexus/artifacts/deep-research-independent/reading-coverage.json`，逐文件保存实际阅读状态和当前 SHA256；改写后的文件单列待复核，其他 Agent 阅读只在哈希匹配时计入。部分历史测试虽标注“无模型调用”，仍会初始化真实原生引擎；本轮只按实际执行路径选择隔离验收，不盲跑全套脚本。

运行态样例存于 `.aexus/artifacts/deep-research-runtime-fixtures/`，全部由 `create/run/describe` 生成并标注模拟数据，覆盖工具授权、部分失败和重规划。节点形状原型存于 `.aexus/artifacts/deep-research-node-shapes/`，只用于外观评审；其中固定时间、进度与详情是示例，不用于生产状态验收。

## UI 阅读与验收索引

UI 负责人实际阅读并持续复核了 `Engine/deep-research/Page.tsx`、`ResearchGraph.tsx`、`ui.ts`、`SourcePanel.tsx`、`ReportView.tsx`、`style.css` 及 `test/ui.mjs`；此外已全文阅读 250 个 renderer、插件 UI 和 Host 桥接文件，共约 1.39 MB，逐路径及哈希记录在 `ui-reading-coverage.json`。该数字不代表项目已全部读完，未读目录和改写版本继续按阅读台账推进。

UI 生产提交 `9617b4b`（运行页、证据报告职责拆分）和 `d489bde`（圆形 DAG、方向选择、邻域聚焦）以及后续 `b00c144`、`f2e58e0`（历史节点与停止状态可观察）、`be1e818`（独立获取记录和拒绝片段）均只包含 Deep Research UI/test。实际 Chromium fixture 回归覆盖真实 `create/describe` 资料链、3 个独立公开来源、20 条定位论断、6 章长报告、48 节点 DAG、36 同层/36 深层压力、390/768/1440 viewport、暗主题、来源定位返回、Manager 意见、暂停/取消 cleanup 重试、LR/TB 方向、历史节点和原生 `session.status` receipt 匹配；`be1e818` 阶段 `Engine/deep-research/test/ui.mjs` 16 项检查、TypeScript、`git diff --check` 均通过。独立 `Infra/src/test/deep-research-reading-ui-test.mjs --corpus --independent` 已用当前门槛的 17 来源、28 陈述、10 章语料验证键盘引用、真实 URL/locator 和 1440/768/390 嵌入阅读；原始 26 来源研究保留为独立注明 provenance 的历史原生 Agent 成果。截图与验证 JSON 在 `.aexus/artifacts/deep-research-ui/` 和 `.aexus/artifacts/deep-research-independent/reading-ui/`。

这些浏览器与独立阅读验证使用 deterministic Contract fixtures 和已保存公开资料，不启动模型代理、不使用收费模型或用户生产数据，因此不能宣称原生模型研究端到端已验收。圆形节点是可逆的当前设计假设；节点形状原型与生产数据分开保存，用户后续明确偏好时再调整。
