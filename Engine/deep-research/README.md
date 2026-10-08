# Deep Research 2.0

**多 Agent 协作的深度研究引擎**

## 特性

✅ **零幻觉引用** — 实时验证每个引用，解决 ChatGPT 90% 幻觉问题  
✅ **5 角色协作** — 协调员、研究员、核验员、综合员、撰写员并行工作  
✅ **来源可信度评分** — ML 评估方法论、引用网络、时效性  
✅ **知识图谱** — 自动构建实体关系网络  
✅ **矛盾检测** — 交叉验证，标记冲突信息  
✅ **混合来源** — 学术论文 + 网页 + 用户文档  
✅ **极致 UI** — 渐进式披露，实时可视化  

## 超越竞品

- **Perplexity** — 更深入的验证 + 知识图谱
- **ChatGPT** — 零幻觉引用系统
- **Gemini** — 更准确的可视化 + 来源评分
- **Consensus** — 学术 + 网页混合来源
- **Elicit** — 更智能的整合和洞察

## 使用方法

### 通过 UI

在 Aexus Engine Library 中，将 Deep Research 卡片**拖入中央启动舱**加载。

### 通过 CLI

```bash
# 开始新研究
node cli.mjs start --topic "AI 在医疗诊断中的应用" --request-id req-001

# 快速研究
node cli.mjs start --topic "2024 AI 趋势" --scope quick --request-id req-002

# 查看进度
node cli.mjs get --id WORKFLOW_ID

# 批准研究计划
node cli.mjs respond --id WORKFLOW_ID --revision 1 --action approve-plan --request-id req-003

# 下载报告
node cli.mjs download --id WORKFLOW_ID --output report.html
```

### 研究范围

- `quick` — 快速概览 (5-10 分钟)
- `comprehensive` — 全面调查 (10-20 分钟，默认)
- `deep` — 深度分析 (20-40 分钟)
- `academic` — 学术研究 (40+ 分钟)

## 工作流阶段

1. **规划** — 分解问题，规划多维度调查路线
2. **研究** — 并行搜索，深度阅读，智能提取
3. **验证** — 交叉验证来源，评估可信度
4. **整合** — 构建知识图谱，发现联系
5. **撰写** — 组织叙事，管理引用
6. **审查** — 质量检查，确保准确性
7. **完成** — 多格式导出

## 输出格式

- `research-report.html` — 完整研究报告（HTML，包含可视化）
- `research-report.md` — Markdown 格式报告
- `sources.csv` — 来源清单

## 架构

### Multi-Agent 角色

- **协调员** — 战略规划，整合发现
- **研究员** — 并行搜索，深度阅读
- **核验员** — 验证证据，检测矛盾
- **综合员** — 知识图谱，发现洞察
- **撰写员** — 清晰叙事，管理引用

### 技术栈

- Node.js ESM
- React 19 + TypeScript
- Contract Client (Infra API)
- 完全通过 `ContractClient.invoke()` 调用，零 Infra 内部依赖

## 设计原则

1. **零耦合** — 只使用 Infra API，不导入内部模块
2. **可验证** — 每个引用可追溯到原始来源
3. **透明** — 所有决策和来源可审计
4. **协作** — 多 Agent 并行工作，高效深入
5. **美观** — 极致 UI，渐进式披露

## 版本

**2.0.0** — 完全重构，基于 Aexus Infra API

## License

GPL-3.0-only
