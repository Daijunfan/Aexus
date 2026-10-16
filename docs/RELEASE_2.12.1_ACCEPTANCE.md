# Aexus 2.12.1 发布验收

固定发布身份：**2.12.1 / build 53**。构建标识（buildId）与候选包哈希以仓库根
`release.json` 为唯一来源（`npm run build` 内容寻址生成），本文不书写具体哈希。最终带
日期的结果（精确 buildId / bundleHash、统一全套与安装结果）一律记录在 ignored
`artifacts/`，冻结后无需回改本文档。

## 最终功能

- **Agent 与 Role 独立**：Agent Board 只管理原生 Coding Agent；Role Board 独立承载
  Company、Messages、Plan。会话与角色身份分离，不向 Agent Board 的模型上下文注入协作或
  路由提示词。
- **工作组**：按工作组组织主机，各组独立保存排序与 1–6 列数。
- **Team**：云端自动生成、绑定与改名；选中的远端 parent 保留，不被覆盖或当作 remote-dir。
- **员工**：目录严格子目录化——新增/重绑子工作区按严格校验（受管目录内子路径），既有未改动的旧保存绑定保持可用，不因新严格规则失效。
- **Secretary**：创建与后续职位管理（ManagementPanel）。
- **界面（限定范围）**：只修角色/设置/对话等明显有问题页面（个人资料、编辑、对话、设置、
  表单）的紧凑与对比度；看板与外壳保持原样，系统图标沿用原图标，不做全应用主题或深色改动。
- **全云权限**：云端 Codex/Claude 全局 Full 默认且可配置；Cline/Pi 沿用原生权限门。
- **OpenCode**：第 5 个原生 CLI，CLI / Role / IDE 共享同一份原生鉴权与配置。
- **Plan 刷新稳定**：Timeline/Planner 仅在尚无事件时显示加载占位；生成刷新期间不再闪现 55px 流入加载条，已有事件原位稳定。
- **字节码缓存修复（2.12.1）**：内嵌 Role Core 的 Python 传输入口（`agent_process.py` / `native_executor.py` / `terminal.py`）现在于导入 `transport` 前先 `sys.dont_write_bytecode = True`，避免运行时向已签名应用包写入 `__pycache__` 字节码缓存导致 `codesign --strict` 失效；新增 `Modules/Tunnel/tests/test_no_bytecode.py`（含负对照）在普通可写目录、无 `-B`/环境变量遮蔽下证明不再生成缓存。

## 验收流程（稳定）

1. 构建：`npm run build`（Root 冻结信号后），生成 `release.json` 与候选
   `artifacts/Aexus.app`。
2. 身份核对：候选包与 `release.json` 的 buildId 一致，`codesign --verify --deep --strict`。
3. 统一全套：按 `artifacts/role-parity-20261015/final-acceptance-runbook.md` 与
   `final-suite-manifest.json` 跑全新 Core/UI/auth/publish 套件（OpenCode 套件已存在），
   不用旧汇总或跳过项充数。
4. 安装恢复：部署前完成构建、检查活动任务、退出旧应用再替换包；现场重新盘点
   NativeAgent / Role / 终端数量，不硬编码旧数。
5. 结果归档：带日期的精确 buildId / bundleHash 与全套、安装结果写入 ignored `artifacts/`。

## 预检证据（2026-10-16，冻结前；不等同于统一全套与安装通过）

- Team 云端生成/绑定/改名：`artifacts/role-parity-20261015/creation-report.md`。
- Secretary 创建与职位管理：`artifacts/role-parity-20261015/secretary-retained-report.md`。
- 内层 Role 界面（仅个人资料/编辑、对话、设置、表单的紧凑与对比度修正；`role-ui-regression`
  28/28、hosted 桥接 8/8、创建表单 5 引擎含 OpenCode）：
  `artifacts/role-parity-20261015/ui-report.md`。看板/外壳的宽泛改色与重排已回退到改动前
  HEAD，不作为最终功能。
- 权限门（Cloud Codex/Claude 全局 Full 应用并读回，Cline/Pi 原生审批保留 ID）：
  `artifacts/role-parity-20261015/permissions-acceptance.json` / `permissions-report.md`。
- OpenCode 接入与权限接线：`artifacts/role-parity-20261015/opencode/opencode-report.md`、
  `artifacts/role-parity-20261015/native-opencode-permission-report.md`。
- Windows ConPTY 编译 + 确定性协议（无模型）：`artifacts/role-parity-20261015/windows-helper-check.md`。

OpenCode 测试套件现已存在：`tests/opencode-permission.test.cjs`（确定性，无模型）、
`tests/opencode-permission-real.cjs`（真实本机一轮）、`tests/opencode-tui-native-live.cjs`
（真实 TUI，Mac/GPU/Windows）、`AgentBoard/Aexus/test/opencode-optional-test.mjs`（未配置
OpenCode 的 list/detect）、`opencode-mcp-bridge-test.mjs`（stub + Core MCP 桥）、
`opencode-cloud-e2e-test.mjs`（GPU 云主机）、`opencode-real-e2e-test.mjs`（本机真实）。

预检时点外部状态：VM `Windows-target1..4` SSH 端口拒绝连接，属外部 VM 状态，未改 VM
软件/网络，不宣称在线。

## 边界

- NativeAgent（`src/agent-*`，外层原生会话）与真正 Role（`AgentBoard/Aexus/src`，内嵌
  Core 0.66.2）的划分见 [Agent / Role Board 拆分验收](AGENT_ROLE_SPLIT.md)。
- 预检报告是冻结前的点状证据；统一全套与安装以最终 `artifacts/` 归档结果为准。

## 证据（预检报告索引）

- `artifacts/role-parity-20261015/creation-report.md`
- `artifacts/role-parity-20261015/secretary-retained-report.md`
- `artifacts/role-parity-20261015/ui-report.md`
- `artifacts/role-parity-20261015/permissions-acceptance.json` / `permissions-report.md`
- `artifacts/role-parity-20261015/opencode/opencode-report.md`
- `artifacts/role-parity-20261015/native-opencode-permission-report.md`
- `artifacts/role-parity-20261015/windows-helper-check.md`
- `artifacts/role-parity-20261015/final-acceptance-runbook.md` / `final-suite-manifest.json`
