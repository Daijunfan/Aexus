# Deep Research 2.0 — Multi-Agent Research Engine

一个强大的多 Agent 研究系统，提供实时进度展示、专业动画效果和完整的 Web UI。

## 🌟 核心特性

### 多 Agent 协作
- **研究协调员 (Coordinator)**: 规划研究路线，协调整体流程
- **深度研究员 (Researcher)**: 搜索和收集来源
- **证据核验员 (Verifier)**: 交叉验证信息，检测矛盾
- **知识综合员 (Synthesizer)**: 整合发现，构建知识图谱
- **报告撰写员 (Writer)**: 撰写结构化研究报告

### 研究范围
- **Quick** (5-10 分钟): 快速概览
- **Comprehensive** (10-20 分钟): 全面调查 [默认]
- **Deep** (20-40 分钟): 深度分析
- **Academic** (40+ 分钟): 学术研究

### 实时监控
- 实时进度跟踪
- 动画状态指示器
- 进度条和统计数据
- Worker 状态可视化
- 研究维度展示

## 🚀 快速开始

### CLI 使用

```bash
# 启动新研究
Engine/deep-research/cli.mjs start \
  --topic "AI breakthroughs in 2024" \
  --scope quick \
  --request-id req-001

# 实时监控研究进度（带动画）
Engine/deep-research/monitor.mjs <workflow-id>

# 查看研究状态
Engine/deep-research/cli.mjs get --id <workflow-id>

# 下载研究报告
Engine/deep-research/cli.mjs download \
  --id <workflow-id> \
  --output report.html
```

### Web UI 使用

```bash
# 启动 Web 服务器
Engine/deep-research/web/server.mjs

# 打开浏览器访问
open http://localhost:3000
```

Web UI 特性：
- 🎨 现代化渐变设计
- 📊 实时进度更新
- 🎬 流畅动画效果
- 📱 响应式布局
- 🔄 自动刷新状态

## 📊 实时监控界面

### CLI 监控器特性
- ✨ 多种动画 spinner（dots, pulse, arrow, etc）
- 🎨 颜色编码状态指示
- 📈 实时进度条
- ⏱️ 持续时间跟踪
- 👥 Worker 状态可视化
- 📋 任务时间线

### Web UI 特性
- 🌊 平滑淡入动画
- 💓 脉冲动画（活跃 worker）
- ✨ 闪烁效果（运行中任务）
- 📊 实时统计计数器
- 🎯 研究维度展示
- 🎭 阶段转换动画

## 🏗️ 架构设计

### Engine 引擎支持
系统支持多种 AI 引擎：
- **Codex**: Codex App Server
- **Cline**: Cline ACP with DeepSeek
- **Pi**: Pi RPC with DeepSeek
- **Claude**: Claude Agent SDK (支持 Anthropic API)

### 研究流程

```
初始化 → 规划 → 研究 → 验证 → 综合 → 撰写 → 审查 → 完成
   ↓        ↓      ↓      ↓      ↓       ↓      ↓      ↓
  创建    制定   收集   交叉   构建   撰写   质量   生成
 Workers  计划   来源   验证   图谱   报告   审查   报告
```

### 数据流

```
User Input
    ↓
Coordinator (规划调查维度)
    ↓
Researcher (并行搜索来源)
    ↓
Verifier (验证证据强度)
    ↓
Synthesizer (整合知识)
    ↓
Writer (撰写报告)
    ↓
Final Report
```

## 🎯 JSON 格式规范

### Plan Task（规划任务）

```json
{
  "taskId": "wf_xxx/research-plan",
  "dimensions": [
    {
      "query": "大语言模型推理能力突破",
      "rationale": "推理是 2024 年的重要研究方向"
    }
  ],
  "strategy": "重点关注 reasoning, multimodal, efficiency",
  "estimatedTime": 15
}
```

### Research Task（研究任务）

```json
{
  "taskId": "wf_xxx/search-dim-0",
  "sources": [
    {
      "type": "web",
      "title": "OpenAI o1: Learning to Reason",
      "url": "https://openai.com/...",
      "snippet": "关键内容摘要..."
    }
  ]
}
```

## 🔧 配置选项

### 研究参数
- `topic`: 研究主题（必需）
- `scope`: 研究范围（quick/comprehensive/deep/academic）
- `maxSources`: 最大来源数量（默认 50）
- `languages`: 语言列表（默认 ["zh-CN", "en"]）
- `autoApprove`: 自动批准计划（默认 false）

### 监控参数
- `refreshInterval`: 刷新间隔（CLI monitor，默认 2000ms）
- API polling: Web UI 每 2 秒自动更新

## 🎨 动画效果

### CLI 动画
- **Spinner 类型**:
  - `dots`: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
  - `pulse`: ⣾⣽⣻⢿⡿⣟⣯⣷
  - `arrow`: ←↖↑↗→↘↓↙
  - `circle`: ◐◓◑◒

### Web UI 动画
- **fadeIn**: 元素淡入（0.5s ease）
- **pulse**: 脉冲效果（2s infinite）
- **shimmer**: 闪烁效果（2s infinite）
- **spin**: 旋转加载（1s linear infinite）

## 📈 性能优化

### Checkpoint 机制
- 自动保存研究进度
- 支持断点恢复
- 增量更新状态

### 并行处理
- 多维度并行研究
- Worker 并发执行
- 异步任务调度

### 错误处理
- 自动重试机制
- 格式修复（format-fix）
- 超时保护（15 分钟）

## 🛠️ 开发指南

### 添加新的任务类型

在 `agents.mjs` 的 `getTaskInstructions()` 中添加：

```javascript
myTask: `任务描述

返回 JSON 格式：
{
  "taskId": "原样返回",
  "result": { /* 任务结果 */ }
}`,
```

### 添加新的验证函数

在 `runtime.mjs` 中添加：

```javascript
function validateMyTask(result) {
  if (!result || !result.someField) {
    throw Error('验证失败');
  }
  return {
    someField: result.someField,
    // ... 标准化结构
  };
}
```

### 自定义 Worker 角色

在 `model.mjs` 的 `initialize()` 中修改 `workers` 数组。

## 🐛 问题排查

### 常见问题

1. **Agent 初始化失败**
   - 检查引擎配置（`engine list`）
   - 验证 API key 是否设置
   - 查看 transcript（`session transcript <id>`）

2. **JSON 解析错误**
   - Agent 返回的 JSON 格式不正确
   - 查看任务失败日志
   - 使用 format-fix 自动重试

3. **研究停滞**
   - 检查 worker 状态（`session status <id>`）
   - 查看任务超时设置
   - 重启 Aexus 服务

### 日志查看

```bash
# 查看 worker transcript
node Infra/src/cli/agents session transcript <worker-id>

# 查看 worker 状态
node Infra/src/cli/agents session status <worker-id>

# 查看研究详情
Engine/deep-research/cli.mjs get --id <workflow-id>
```

## 🎯 最佳实践

### 研究主题
- ✅ 清晰具体："2024 年量子计算硬件突破"
- ❌ 模糊宽泛："科技发展"

### 范围选择
- **Quick**: 快速了解概况
- **Comprehensive**: 日常研究需求
- **Deep**: 重要决策参考
- **Academic**: 学术论文准备

### 监控策略
- 使用 CLI monitor 进行深度跟踪
- 使用 Web UI 进行日常监控
- 长时间研究建议后台运行

## 📝 API 文档

### HTTP API

```bash
# 启动研究
POST /api/research/start
Content-Type: application/json

{
  "topic": "研究主题",
  "scope": "quick"
}

# 获取状态
GET /api/research/<workflow-id>

# 列出所有研究
GET /api/research
```

### Node.js Client

```javascript
import { createNodeClient } from './Contract/node-client.mjs';

const client = createNodeClient();

// 启动研究
const result = await client.invoke('workflow.start', {
  engineId: 'deep-research',
  input: { topic: '...', scope: 'quick' },
  clientRequestId: 'req-001'
});

// 获取状态
const status = await client.invoke('workflow.get', {
  id: result.id
});
```

## 🚀 路线图

### 已完成
- ✅ 多 Agent 协作架构
- ✅ 实时 CLI 监控器
- ✅ Web UI 界面
- ✅ 动画效果系统
- ✅ JSON 格式规范
- ✅ 错误恢复机制

### 计划中
- 🔄 知识图谱可视化
- 🔄 来源网络图
- 🔄 报告导出格式（PDF, Markdown）
- 🔄 研究历史管理
- 🔄 协作批注功能
- 🔄 AI 辅助问答

## 📄 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**Deep Research 2.0** — Powered by Multi-Agent Architecture
