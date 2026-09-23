# Agents Company Manager 工作目录

[API.md](API.md) 是完整的 CLI 使用手册，包含所有宿主命令索引、操作示例、失败处理和定时任务全文。[SCHEDULER.md](SCHEDULER.md) 是便于单独查阅的调度规范。[AGENTS.md](AGENTS.md) 与 [CLAUDE.md](CLAUDE.md) 引导两种员工引擎先阅读手册。

本目录的 `agents` 是指向主项目 `bin/agents` 的启动器。从本目录运行 `./agents status --json`；员工若位于直接子文件夹，运行 `../agents status --json`。CLI 需要正在运行的 Agents Company App 或 `agents serve`，没有窗口也可操作。

Manager Team 应采用本地 Build 模式，将 Team 根目录绑定到本目录。创建 Team 的示例和安全的日常工作顺序见 [API.md](API.md)。

根项目的 `API.md`、`SCHEDULER.md`、`PLUGIN_SPEC.md` 和 `ENGINE_CAPABILITIES.md` 是文档来源。修改这些来源后运行 `npm run docs:managers`，并用 `npm run test:manager-docs` 检查副本与命令索引是否同步。
