# Aexus 2.12.6 / build 58 — Role Board 管理 API

本文件说明代码交付范围与可重复验证流程。实际构建哈希、测试结果、安装与远端推送证据由本次发布日志记录；本文不预先声称已通过或已安装。

## 功能与契约

Role Board 的 Company、Messages、Plan 使用内嵌 Core 0.66.3。Secretary 是最高应用管理员，以自己的 Agent key 管理全部职级、会话、资产、配置、计划与软件操作。它不直接修改 Aexus 自身源码，不冒充人类或其他员工。

- 角色生命周期覆盖其他 Secretary；Agent 删除/降级/撤销及批量 Team 删除预检，保留 ready 且凭据可用的管理员。
- 全局会话治理与文件管理无需先加入每个群组。消息作者、编辑者、转发幂等和审计保留真实 actor；原始用户阅读回执保持真实阅读含义。
- config.get/effort/thinking 支持关闭会话与稳定员工 ID。默认配置用于之后创建的全部职级，显式 false/default 优先，已有员工保持原设置。
- effort 依据实际引擎模型目录；Claude thinking、Codex/OpenCode effort、Cline/Pi未暴露能力明确区分。Plan临时覆盖结束后恢复原设置。
- `api.capabilities`、单命令schema、通用CLI、两项原生发现/执行工具及生成的文档索引构成同一API入口；不新增逐按钮工具。

完整逐操作对照：[Secretary API](../AgentBoard/Aexus/docs/SECRETARY_API_PARITY.md)。身份、key、文件与原生权限：[权限规范](../AgentBoard/Aexus/PERMISSIONS.md)。参数与示例：[Core API](../AgentBoard/Aexus/API.md)。

## 验证与交付流程

在 `AgentBoard/Aexus` 生成文档并运行类型、默认值、管理集成、GUI/API目录、原生工具边界、Plan与会话行为测试。测试使用临时数据与确定性原生协议夹具，不调用收费模型。静态命令覆盖不是外部provider、云主机或设备的全面实测。

仅用仓库根 `python3 build.py` 构建 macOS 原生产品，核对 release.json、版本/build及 `codesign --verify --deep --strict`。完成候选构建后检查活动任务、退出旧Aexus并安装；验证启动和原数据身份后，只删除核对 Bundle ID 的同产品旧APP包。保留源码、宣传素材、配置、数据与备份。共享Toolbox工具服务保持运行。Git提交与推送必须在验证后进行，并报告真实commit及remote结果。
