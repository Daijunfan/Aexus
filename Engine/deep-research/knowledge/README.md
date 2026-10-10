# Knowledge domain (Deep Research)

纯函数知识层，服务研究语义、可追溯性和展示消费。当前作为渐进接入的领域模块，保留现有工作流持久数据和原有公开投影；不得在调用方绕过证据核验，也不得以此模块调度任务。`knowledge/index.mjs` 是稳定薄入口，内部按 `evidence.mjs`、`relations.mjs`、`topics.mjs`、`history.mjs`、`matrix-proposals.mjs` 分工，公共类型位于 `index.d.mts`。无需新持久 Store、数据库或运行时依赖。

## 可复用接口

- `projectKnowledge(state)`：将当前 checkpoint 按需投影为主题、发现、缺口、限制、实体与关系；不修改原状态，不复制存储新版本。知识关系仅来自**当前有效**综合节点的 `result`。
- `projectPublicKnowledge(summary)`：直接消费 `WorkflowView.summary` 的现有公开字段（`sources`、`findingsDetails`、`graph`、`dimensions`、`contradictions`、`deliverable`），由工作台调用，不修改 Contract。可选 `summary.researchGaps` 需执行/工作流负责人显式提供真实已记录的问题。
- `projectFindings(sources, findings)`：保留原发现 ID，只有来源已独立取得原文、来源已核验且片段可匹配时，才输出 `linked`；历史 `verified` 标记、候选摘要以及未匹配片段显示 `unlinked`。随投影传递该片段的原始正文 `SHA-256`、最终 URL 和获取时间，便于跨版本证据审阅；不复制网页正文。若新旧取证的同一句话对应不同 SHA/最终 URL 且旧发现未绑定版本，将标记 `issues: [{sourceId,kind:'ambiguous-proof'}]` 并跳过猜测；可选 `evidence.sha256/finalUrl/accessedAt` 精确定位版本，遗留单版本证据仍可显示。
- `mergeSynthesis(analyses, linkedFindings)`：每个 `{nodeId, result}` 中的实体 ID 只在本分支有效。跨分支仅合并类型、规范化名称和描述完全相同的实体；同名不同解释保持分离。关系只使用本分支已声明的端点，允许知识环；未知端点和重复本地 ID 记录为 `issues`。可选 `findingIds` 必须对应已链接的真实发现，否则只保留为未关联证据的候选关系。输入未提供 `findingIds` 的旧综合结果依旧可查看，但不应标识为经证据证明。
- `projectTopics(state)`：索引真实研究维度、当前检索节点、来源与显式发现关联；区分未评估、候选资料、**已独立读取待核验**、已核验资料和显式关联的论断。发现明确绑定到问题且原文核验完整时，即使来源最初没有维度标签，也会把其真实来源列入该问题。部分声明证据未通过核验时，材料继续可浏览，但不据此宣称该问题已有完整引用论断。返回 `readSourceIds` 和 `verifiedSourceIds`，不推断精确覆盖率。
- `projectGaps(state)`：读取初调研缺口与**当前有效、已完成**搜索节点的真实缺口；正确处理任务重试、格式纠错，排除已替代、失败和待执行节点；重复问题保留稳定 ID 和 `originNodeIds`。这些是“曾报告的缺口”，可能在后续研究中已被解答，展示时不可宣称仍未解决。
- `projectDisputes(sources, contradictions)`：保留现有分歧 ID 与来源引用，区分相关已核验原文是否齐全；同一 URL 的两个来源 ID（包括不同 fragment）不会被视作两份独立材料。`sources-ready` 仅代表至少两份不同 URL 的原文可进入审阅，仍需进一步核验来源独立性及矛盾是否成立。
- `projectReportLinks(report, linkedFindings, sources?)`：只依据报告章节实际保存的 claim、sourceId 和 excerpt 三者严格对应已核验发现时形成章节跳转；当前数据入口传入 `sources` 以验证证据版本，遇到同一原文跨版本歧义会阻止错误跳转。只读兼容旧调用，不解读 Markdown 文本来捏造引用。
- `compareResearch(previous, current)`：比较发现表述、来源、原文片段及取证正文 SHA-256 的变化。先按**两边唯一的稳定 finding ID**，再按精确「表述＋出处版本」匹配，最后仅在两边均仅剩一条同表述时关联；避免历史新旧 ID 重建、同文异来源的重新排序造成虚假证据变更。若无法唯一映射，谨慎使用 `new/not-observed` 表示两批次观察未能对应，不能说已确认新增或撤销事实。若缺少证据版本关联，标记 `provenance-unresolved`；仅获取时间变化不触发证据变化。建议比较 `projectFindings` 的输出。

- `projectKnowledge(state).diagnostics`：只报告可核查的连通性数据：已归属／未归属研究问题的完整可追溯论断 ID、`partiallyLinkedFindingIds`（部分声明来源未核验）、指向未知主题的引用、歧义证据引用、缺来源关联的关系。不推断论断所属主题，不生成知识覆盖率。
- `assessMatrixProposal(matrix, candidate, linkedFindings, context?)` 与 `acceptMatrixProposal(matrix, candidate, linkedFindings, approved, context?)`：供后续研究回填使用的纯函数。对比**矩阵 ID、行/列文字、原单元格原值**，拒绝重复标签、编辑冲突、证据缺失与没有原文支持的数字。每个待审候选输出 `proofRefs`（准确的 finding/source IDs、原文 SHA-256、最终 URL、摘录、定位与获取时间）；成功应用时原样保留，便于事后核对。**新 UI 接入时应提供 `candidate.researchId`（矩阵所属原研究）与 `{researchId:当前打开研究}`，避免多个研究都使用 `custom` 矩阵 ID 时串写。** 用户审阅后将当时的 `ready-for-review.proofRefs` 原样保存到 `candidate.reviewedProofRefs`；点确认时重新评估，证据正文版本发生变化返回 `stale-evidence`，原单元格被编辑返回 `conflict`，跨研究返回 `wrong-research`。仅获取时间变化不视为证据版本冲突。兼容早期省略可选作用域／快照的调用，但新交互应完整提供。引用可追溯也不代表数值语义自动成立，必须人工确认 `approved === true`；不触发任务、不持久化、不换算单位。

`projectKnowledge` 可供 Graph、Workspace、Deliverables 使用，而不需要触及 Infra 或 Contract。`projectPublicKnowledge` 仅接受现有合法公开摘要；若后续提供 `researchGaps`，字符串只能标识为 `reported`，结构化 `search` 来源节点必须指向**当前有效、已完成的检索任务**；失败、运行中或综合节点不会冒充已报告的缺口来源。Workflow 可以在保留旧 `knowledgeGraph` 状态兼容期间逐步接入归一化；不要替换现存研究/任务/source/finding ID，也不要把投影的候选关系直接写成已证实事实。若后续要将发现准确归属到主题，验证环节应记录明确的 `dimensionIds` / `topicIds`，不能通过引用了同一 URL 自动猜测。

## 约束

- 当前已有的 `sourceId`、`findingId`、任务 ID 和 checkpoint 结构保持权威。展示层收藏与引用沿用这些身份；新图实体 ID 仅由归一化的实体字段计算。
- 无持久化、外部调用或新增依赖；资料的独立读取和来源状态仍归 Retrieval；任务 DAG 与执行进度仍归 Workflow；视觉画布/报告归各自负责人。
- `evidenceStatus: linked` 仅表示显式关联到了**全部声明证据均可核对**的论断；一个来源可定位但其他声明证据缺失的论断仍可以在发现页作为部分可追溯材料阅读，暂不授予其关系 `linked` 状态、主题已关联发现状态或报告章节知识跳转。仍需审查论断与关系语义，不自动判定事实成立。
- `issues` 是对综合结果中无法建立链接的数据的可解释记录；不自动补造缺失实体、证据或关系。
- 旧平面 `knowledgeGraph` 无分支端点身份时，不能可靠重建跨分支关系，保留旧视图历史并单独说明限制；本模块不会冒用该平面图来宣称获得新证据。

## 验证

从仓库根目录运行：

```sh
node --test Engine/deep-research/knowledge/*.test.mjs
```

测试使用确定性构造资料，无付费模型、网络访问或用户工作流写入。跨模块接入需要相应负责人完成并分别验证。浏览器打包使用无 Node 运行时依赖的领域模块。

可选性能基准：`node Engine/deep-research/knowledge/benchmark.mjs`。在一次本地合成测试中，500 主题/1000 来源/1000 发现的中位投影耗时从约 13.13 ms 降到 1.69 ms；1000 主题/2000 来源/2000 发现从 49.95 ms 降到 3.35 ms。数据生成与测试环境固定在脚本内，数值仅用于比较本地算法开销，不代表真实模型、磁盘、网络或 UI 绘制性能。
