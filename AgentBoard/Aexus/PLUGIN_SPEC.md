# 插件产品：本版本停用

CloudHosts 内嵌 Aexus Core 不打包、扫描、安装或运行插件产品（MiniNotion、Margin Reader、Cloud Hosts 插件等）。`plugin.list` 仅为兼容查询，返回空数组 `[]`；插件产品写调用、安装、窗口和 Work Team 新建明确拒绝并返回 `PLUGIN_DISABLED`。

旧版 Work Team 的持久化配置及目录关系保留供历史查看，不能运行对应插件。Company、Messages、Plan 的原 API、角色初始化、认证授权和独立调度器仍然可用。通过 `agents api docs` 查询当前 Core 的 API 文档。

本文件为 02-core 迁移的已生成文档覆盖件。根 `PLUGIN_SPEC.md` 和 `scripts/sync-manager-docs.mjs` 由 01-integrator 负责，需在集成时调整，以防下次文档生成恢复已禁用的插件说明。
