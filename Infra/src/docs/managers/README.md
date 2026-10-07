# Aexus Manager 文档源

本目录保存 Manager 手册的源文件，不作为员工 Workspace。`npm run docs:managers` 根据根项目 `API.md`、`SCHEDULER.md` 和命令注册表更新这里的文档。

本地 Build Team 绑定项目的 `Agents-Managers` 文件夹后，每次创建员工，宿主会将本目录文档复制到该员工的 `.agents-company/manager/`，并在其目录生成 `AGENTS.md`、`CLAUDE.md` 引导和 `.agents-company/bin/agents` 启动器。Team 根目录不放这些文档。

员工先读自己的 `.agents-company/manager/API.md`，然后使用 `agents status --json`。插件领域 API 先通过 `agents plugin describe ID --json` 查询。Work 插件员工也在自己的 Workspace 获得对应插件的文档和专属 CLI 启动器。
