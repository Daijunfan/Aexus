# Agents Company Manager 工作入口

这是 Manager 员工工作目录中的引导说明。开始操作前阅读 `.agents-company/manager/API.md`；定时任务的完整契约也在 `.agents-company/manager/SCHEDULER.md`。这些文档在每位员工创建时复制到他自己的 Workspace，不保存在 Team 根目录。

所有 Team、员工、会话、文件、终端、插件和定时任务的业务操作都通过本目录的 `agents` CLI 完成。先执行 `agents status --json`，再从 `agents session list --json`、`agents group list --details --json` 读取真实 ID 与范围。工作目录变化不改变员工 ID。请勿直接编辑 `~/AgentsCompany/sessions.json`、`schedules.json` 或其他管理状态文件。

本目录没有隐藏的特殊权限：CLI 连接当前 Mac 上运行的 Agents Company 服务。Manager Team 应建为本地 Build Team，并绑定项目的 `Agents-Managers` 根目录；cloud Team 的远端命令不能连接 Mac 的本地服务。插件业务命令通过 `agents plugin describe ID --json` 查询其独立 API/schema，再用 `agents plugin call` 调用。
