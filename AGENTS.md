# Agents Company 工作约定

保持简单、边界清晰，优先复用现有接口。未经明确要求不得创建或调用子 Agent。

## CLI 是产品基础

- 业务逻辑放在共享 Core，不能依赖 Electron 窗口、React 组件或 DOM。
- 先实现 Core / CLI API，再接 UI。UI 的业务操作必须是 CLI API 的严格子集。
- 会话、引擎、模型、思考/effort、权限、Team、员工、文件、终端、插件操作都必须可在 `agents serve` 下无窗口完成。
- 新命令同时更新 `src/shared/protocol.ts`、`src/main/server.ts`、`bin/agents`、`API.md`，并提供真实 CLI 验证。不能只用 `ui.click` 代替业务 API。
- 同步运行 `npm run docs:managers`，让 `Agents-Managers/API.md` 与根目录 API、调度规范和命令注册表一致；Manager 员工必须能够从自己的目录使用 `agents` 启动器。
- Team 决定 Work、本地 Build 或 cloud 执行环境；SSH 配置只保存在 cloud Team。员工不能覆盖主机，只能选择 Team 范围内的云端工作目录。
- Team 与员工名称创建后不可更改。切换引擎或工作目录必须保留会话历史与旧原生 ID，删除员工时再统一清理。

## 插件也必须 CLI 优先

- 一个插件一个 `PlugIns/<name>` 目录。复用 `PLUGIN_SPEC.md` 与 `examples/plugin-starter`。
- 必须提供独立 CLI、共享 runtime.request、非空命令 schema 和规范 Markdown 文档；不能只有界面。
- 所有业务操作在 schema 中声明；UI、CLI 和员工调用必须共用同一 request 实现。宿主拒绝未声明的命令。
- 业务数据不能只保存在 renderer/localStorage；不能以 Electron IPC 私有方法绕开 CLI/Core。
- 新插件必须在没有 Electron 窗口的环境中验证创建、读取、修改和错误处理；再做 UI 与 CLI 一致性检查。

## 验证与后台工作

- 运行改动相关的类型检查、CLI 覆盖检查和实际行为测试；通过后不做无理由的重复测试。
- 用户要求后台工作时，只使用隐藏窗口、隔离数据目录，不启动可见窗口、网页或系统选择器。
- Codex 推理测试只能使用 `gpt-6-luna`、`low`。优先使用无推理的协议与 fixture 测试。
- 不在真实用户数据中创建或删除测试员工。安装前确认应用身份与活动任务，备份并核对现有数据。
- 禁止替换仍在运行的 App，包括先改名旧 `.app` 再把新包放回原路径；Electron 缓存的 ASAR 文件偏移会导致二进制乱码。也不能以“保留旧进程，下次启动生效”为由绕过。
- 安装使用 `npm run install:mac -- --source '/path/Agents Company.app'`。安装器确认目标及候选进程全部退出后才替换；不得手写热替换命令绕过检查。安装完成后要实测隐藏窗口的页面渲染，而非只检查构建成功。
