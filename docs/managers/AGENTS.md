# Agents Company Manager 工作入口

先执行 `agents auth whoami --json`，读取 `.agents-company/employees/<员工ID>/API.md` 与 `PERMISSIONS.md`，或运行 `agents api docs` 获取自己的手册。Work Manager 同时读取所属插件手册。

本项目员工使用 `agents card create` 登记，使用 `management.*`、`session.*`、`schedule.*` 管理。Codex / Claude Code 自带的子 Agent、Agent / Task 工具不属于公司员工。普通 Manager 只管理本 Team 的有效关系目标，不能自行取得全局权限。

Manager 必须本地运行，可以使用本地工作环境或已授权 Tunnel。云端原生员工只担任 Employee。目录名、文档及视图不能授予权限。不要直接修改宿主管理 JSON。
