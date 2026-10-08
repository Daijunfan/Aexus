# Deep Research 审查记录

日期：2026-10-09。本文记录实际阅读、代码验证和剩余约束，不代表全项目已通读，也不代表真实收费模型研究已验收。UI 验收记录由 UI 负责人补充。

## 后端实现与验证

本地分支 `codex/deep-research-dag-ui`，未推送。稳定提交：

- `c97798d`：动态研究团队、任意 DAG 执行、版本化重规划、证据与报告产物；修复暂停恢复、格式修复恢复、并发终止和核验输入范围。
- `0942193`：将退休引擎判别测试移回 Infra，消除 Engine 测试对 Infra 实现的导入。
- `7c738cf`：节点研究目标正式传给执行员工；已完成节点换目标必须使用新 ID，纯显示名称可更新。

验证使用实际 `runtime.mjs`、`workflows.ts` 和公开 Contract 数据形状，原生传输、权限与资源发现按测试明确模拟。没有启动模型代理进程，没有使用用户生产数据：

- 稳定提交前：引擎、独立领域、Host 生命周期和退休清理共 48 项通过，命令退出码 0。
- 边界测试迁移后：引擎与退休清理 33 项通过，退出码 0。
- 目标语义修改后：引擎、独立领域和 Host 生命周期 39 项通过，退出码 0。
- 所有提交前 `git diff --check` 均退出 0。
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

另核对 `Infra/src/shared/types.ts` 的消息、任务和活动预览类型，以及独立研究测试的测试边界。没有读取用户凭据文件，没有运行 provider 或收费探针。Infra renderer 的全面阅读归 UI 负责人。

## 边界与删减判断

生产 Deep Research 通过 `context.client.invoke` 使用 Infra，未直接导入 Infra 实现或写入 Infra 数据库。Host 负责身份、权限、版本、持久化、生命周期和最终文件发布；Engine 负责领域任务、证据、审查和报告。并发节点的串行 checkpoint 队列用于保留快照顺序，有明确用途。

搜索任务已删去重复来源正文、完整报告和计划，仅保留问题、目标、URL 去重、依赖摘要和必要发现。实际 run 生成的 48 节点、80 来源、50 任务基准中，最大检查点从 18,594,753 字节降至 8,136,162 字节，提示词从 12,505,693 字节降至 2,488,785 字节。该基准不计磁盘 fsync；1000 来源样例在 20 MiB 处停止测量，不能作不同执行进度的性能同比。

可后续确认的冗余包括 `plan` 与 `graph` 节点、`deliverable` 与 `report.content`、`planHistory` 与 `planRevisions` 的重复公开投影。现 UI 使用这些兼容 fallback，未擅自删除。旧 schema 常量与辅助导出仅被旧调试或测试引用，需要先清点这些使用方。

## 剩余约束

- `acquisition.status=read` 仍来自原生研究员工的结果。原文片段与引用结构被校验，但不构成引擎独立抓取证明。
- HTML 导出目前把 Markdown 表格、列表当文本转义。UI 使用现有 ReactMarkdown 正确呈现；其他 Engine 没有可直接复用且符合边界的 Markdown HTML 运行时渲染器，暂未新增依赖。
- `workflow.events` 的通用统计字段与本引擎嵌套 `progress` 结构不同，事件统计会缺失；当前 UI 读取 `workflow.get`，不依赖该统计。
- Deep Research CLI 的 UTF-8 字符数与文件字节数校验待另行修复，不影响浏览器现有文件下载。

运行态样例存于 `.aexus/artifacts/deep-research-runtime-fixtures/`，全部由 `create/run/describe` 生成并标注模拟数据，覆盖工具授权、部分失败和重规划。节点形状原型存于 `.aexus/artifacts/deep-research-node-shapes/`，只用于外观评审；其中固定时间、进度与详情是示例，不用于生产状态验收。

## UI 阅读与验收索引

UI 负责人实际阅读并持续复核了 `Engine/deep-research/Page.tsx`、`ResearchGraph.tsx`、`ui.ts`、`SourcePanel.tsx`、`ReportView.tsx`、`style.css` 及 `test/ui.mjs`；本索引不代表其余约 2,180 个 tracked 文件已枚举或通读。Infra renderer 入口与共享入口按功能抽样阅读：`Infra/src/renderer/src/App.tsx`、`api.ts`、`components/EngineWorkspace.tsx`、`EngineLibrary.tsx`、`Icon.tsx`、`main.tsx`、`styles/application-layers.css`；插件目录及其他 renderer 组件待读。

UI 生产提交 `9617b4b`（运行页、证据报告职责拆分）和 `d489bde`（圆形 DAG、方向选择、邻域聚焦）以及后续 UI 稳定提交 `b00c144` 均只包含 Deep Research UI/test。实际 Chromium fixture 回归覆盖真实 `create/describe` 资料链、3 个独立公开来源、20 条定位论断、6 章长报告、48 节点 DAG、36 同层/36 深层压力、390/768/1440 viewport、暗主题、来源定位返回、Manager 意见、暂停/取消 cleanup 重试、LR/TB 方向和原生 `session.status` receipt 匹配；当前 `Engine/deep-research/test/ui.mjs` 13 项检查、TypeScript、`git diff --check` 均通过。独立 `Infra/src/test/deep-research-reading-ui-test.mjs` 通过键盘引用、真实 URL/locator、1440/768/390 嵌入阅读检查；截图与验证 JSON 在 `.aexus/artifacts/deep-research-ui/` 和 `.aexus/artifacts/deep-research-independent/reading-ui/`。

这些浏览器与独立阅读验证使用 deterministic Contract fixtures 和已保存公开资料，不启动模型代理、不使用收费模型或用户生产数据，因此不能宣称原生模型研究端到端已验收。圆形节点是可逆的当前设计假设；节点形状原型与生产数据分开保存，用户后续明确偏好时再调整。
