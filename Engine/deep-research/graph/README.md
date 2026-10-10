# Research graph canvas

画布展示研究任务 DAG，保留用户的缩放、选择与阅读锚点。节点操作通过父页面的 `onSelect` 进入已有详情和后续研究动作，画布不直接执行工作流或编辑依赖。

- `ResearchGraph.tsx`：节点/边渲染、筛选、搜索、缩放与键盘导航。
- `camera.ts`：不依赖 React 的聚焦、方向导航和滚动锚点计算。
- `viewport.ts`：超过 120 个节点时按视口裁剪 DOM 节点/连线、生成聚合缩略导航。不丢失数据或更改执行 DAG。
- `relations-layout.ts` / `KnowledgeRelations.tsx`：以 Knowledge Engineer 的只读领域模型绘制独立知识关系图；允许环和自关系，明确标识已关联出处与待核对项。布局只服务于展示。
- 原 `../ResearchGraph.tsx` 是兼容导出；父页面目前无需修改。
- `../ui.ts` 的 `layoutGraph` 暂时保持原位，避免并行改动跨越共享领域类型。待与 Knowledge/Workflow/Workspace Engineer 对齐接口后再决定是否迁移。

用户操作：方向键在节点间导航、`+`/`-` 缩放、`Home` 适应整图，Ctrl/Cmd + 滚轮围绕指针缩放；“定位当前研究节点”返回当前选区。研究状态刷新保留附近节点的阅读位置。大图提供可点的缩略地图，低缩放时悬停任务展示实际摘要与关联来源数量。知识关系图提供实体查找、证据与原文跳转，窄屏配实体快速导航。

验证：

```sh
node --test Engine/deep-research/graph/*.test.mjs
node Engine/deep-research/test/ui.mjs
```

专项测试使用确定性节点和本机 Chrome，不触发收费模型或真实工作流。512 节点滚动/缩略导航由浏览器断言校验，300 个实体环形关系布局由纯函数断言校验。视觉截图放在本地 .aexus/artifacts/deep-research-graph，不作为发布文件。

## 与 Workspace、Knowledge 对接

`ResearchGraph` 保留原有 props，额外支持以下可选项：

- `knowledge?: Pick<KnowledgeProjection, "entities" | "relationships" | "findings">`
- `onOpenFinding?: (id) => void`、`onOpenSource?: (id) => void`、`onOpenNode?: (id) => void`

Workspace 可对 `summary` 调用 `projectPublicKnowledge(summary)`（来自 `knowledge/index.mjs`），使用 `useMemo` 缓存，并传入已有 `openFinding`、`openSource`、`openNode` 回调。只有真实实体存在时展示关系入口；没有证据链接的关系明确标示为待核对。切换知识关系时不卸载执行 DAG 画布，返回保留先前位置。上述 Page 入口接线必须由 Workspace Engineer 负责；图谱模块不会读取 Host 私有状态或重复实现知识语义。
