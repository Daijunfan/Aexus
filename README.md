# Aexus

[GitHub](https://github.com/Daijunfan/Aexus) · [English](Infra/src/docs/README.en.md) · [0.64.0 更新记录](Infra/src/docs/releases/0.64.0.zh-CN.md)

**面向明确目标的业务 Engine，建立在同一套多 Agent 协作 Infra 上。**

Engine 定义用户输入、领域流程、界面和可验证的交付结果；Infra 提供员工、团队、原生编码会话、消息、文件、权限及调度。Contract 是两层之间的版本化接口。新增求职、科研、活动策划或软件工程应用时，不需要重写 Infra，也不复制员工和聊天数据库。

启动后首先进入 **Engine library** 全屏固定首页：引擎围绕中央启动舱分布，**必须将引擎卡片拖入正中央才会加载**。单击卡片不会打开。未选择前不挂载业务页面、员工、会话、Plan 或文件内容。进入后顶部为 **Engine / Infra**，Company、Messages、Plan 和相关文件均限定到当前引擎关联的资源。

**多个引擎可同时在后台工作，每个窗口一次只查看一个。** 切换引擎或返回首页不会取消任务、关闭原生会话或暂停计划；重新拖入卡片恢复查看，不重复派发工作。已有资源通过 **Linked Engine resources** 显式关联，原身份、历史、目录和权限保持。完整行为与 CLI 见 [Engine 工作区](Infra/src/docs/ENGINE_WORKSPACES.md)。

## 目录与职责

```text
Aexus/
├── Engine/                   每个一级子目录对应一个业务应用
│   ├── deep-research/        动态团队与 DAG 研究、独立原文核验和引用报告
│   ├── profile-improvement/  简历与岗位匹配、Word 模板修改
│   ├── PPT-maker/            演示文稿制作、编辑与 PPTX 导出
│   └── workspace-audit/      可运行的只读参考 Engine
├── Contract/                 协议、客户端、能力清单、引擎清单 schema
├── Infra/
│   ├── src/                 Core、桌面/Web、CLI、测试、文档与构建工具
│   └── Plugins/             已有独立软件插件，保留各自发布结构
├── README.md                全项目导航与协作入口
└── .aexus/                  不提交的构建、验收、进度和本地产物
```

`Infra/src/main` 是唯一的核心业务实现；`shared` 是 Infra 内部类型和命令定义；`renderer`、`preload` 是展示与桌面接入；`cli` 是终端入口；`test`、`tooling`、`docs`、`resources`、`tunnel` 分别放测试、构建工具、内部文档、资源和远端协议。生成输出统一到 `.aexus/out`，不把第二份实现放回项目根目录。

Deep Research 的当前用法、证据与交付边界见 [引擎说明](Engine/deep-research/README.md)；旧发布记录保留对应版本的历史行为。

**业务 Engine 与 Coding Agent 适配器不同。** Codex、Claude Code、Cline、Pi 留在 `Infra/src/main/engines`，继续执行员工的原生会话。`Engine/*` 是面向最终用户的领域软件。

## 给 Engine 开发者

先读 [Contract 总览](Contract/README.md)、[协议](Contract/PROTOCOL.md) 和 [Engine 开发指南](Contract/ENGINE_GUIDE.md)。机器可读接口为 [commands.v1.json](Contract/commands.v1.json)，清单格式为 [engine.schema.json](Contract/engine.schema.json)。

一个 Engine 至少包含：

```text
Engine/my-engine/
  engine.json     id、版本、所需能力及输入/输出 schema
  Page.tsx        独立页面，接收 ContractClient
  cli.mjs         无界面运行入口
  workflow.mjs     自己的领域流程，UI/CLI共用
```

允许依赖 `Contract` 和本 Engine；禁止导入 `Infra/src/main`、直接读写 Core 数据库或借 Engine ID 增加操作权限。新增目录后重新构建即可载入页面，不必修改 Infra 导航或添加一份员工 Store。

参考实现 [workspace-audit](Engine/workspace-audit/engine.json) 的明确起点是一个已有 Team；终点是包含真实目录条目、数量和验收检查的 JSON。它只验证基础设施接入，不冒充已完成的求职或科研产品。

```sh
node Engine/workspace-audit/cli.mjs --input '{"team":"Research"}' --output audit.json
```

请为自己的应用提供明确的输入、持久任务 ID、失败处理和真实验收标准。多步执行中途失败时，报告已完成与未完成的部分；不要把“消息已送达”写成“任务已成功”。

## 开发与运行

支持的 Node/npm 版本以 `package.json` 为准。在本目录安装依赖和构建：

```sh
npm ci
npm run build:engines
npm run build:plugins
npm run contract:check
npm run build
npm run dev
```

无窗口 Core/Web：

```sh
node Infra/src/cli/aexus serve --web
node Infra/src/cli/aexus contract info --json
node Infra/src/cli/aexus contract describe --domain company --json
```

现有 `agents`、`avalon`、`anexus` CLI 别名保留。`aexus infra …` 与原员工 CLI 进入同一 Core；`aexus contract …` 是业务 Engine 的版本化入口。安装版和远端部署沿用已授权的身份凭据；本地开发不要指向正式数据运行测试。

## Infra 开发与内部 API

先读 [开发约束](Infra/src/docs/AGENTS.md)、[架构](Infra/src/docs/ARCHITECTURE.md)、[安全边界](Infra/src/docs/SECURITY.md)、[权限](Infra/src/docs/PERMISSIONS.md)。

[Infra API 工作流](Infra/src/docs/INFRA_API.md) 区分员工协作与可视化；[完整 API](Infra/src/docs/API.md) 保留原操作与参数。插件有自己的独立协议，不混入本次内部 API 清单。

```sh
node Infra/src/cli/aexus infra api --domain company --json
node Infra/src/cli/aexus infra api --domain messages --json
node Infra/src/cli/aexus infra api --domain plan --json
node Infra/src/cli/aexus api describe schedule.create --all --json
```

| Infra 子视图 | 职责 | 权威接口 |
| --- | --- | --- |
| Company | Team、员工、权限、关系和画布 | `group.*`、`card.*`、`management.*`、`office.*`、`room.*` |
| Messages | 私聊、群组、频道、文件、阅读状态 | `session.*`、`chat.*`、`channel.*`、`messenger.*`、`conversation.*` |
| Plan | 定时、重复、事件任务及运行验收 | `plan.*`、`schedule.*` |

## 验证与并行协作

```sh
npm run typecheck
npm run contract:check
npm run test:contract
npm run test:layers
npm run test:engine-scope
npm run test:release-core
npm run test:release-ui
```

测试默认使用一次性数据目录、确定性协议替身和隐藏桌面；不使用正式员工或收费模型。构建不代表安装。发布与打包规则见 [部署](Infra/src/docs/DEPLOYMENT.md) 和 [许可](Infra/src/docs/LICENSING.md)。

并行 Agent 在 `share_chat/` 记录占用范围和交接，在 `progress/Agents-company.md` 追加关键步骤；这两个路径映射到 `.aexus`，不会成为新的源码层。Engine 作者只改自己的子目录，协议变更先协商。

本次源码从 `Agents-company` 迁移到 `Aexus`。员工 ID、Team 和实际工作区、凭据、原生会话、`AGENTS_COMPANY_HOME` 及既有 API 名称保持兼容；外部用户工作区不随源码改名。Electron 的历史资料目录也保持原路径，保留本机筛选和频道显示偏好；旧目录名仅用于数据兼容，界面品牌统一为 Aexus。旧源码路径保留有限的 CLI/本地工作区兼容桥接，开发请使用新根目录。当前仓库地址统一为 https://github.com/Daijunfan/Aexus；历史发布记录中的旧产品名保留为历史信息。

新建 Codex 员工默认使用 `gpt-6.1-sol`，思考强度为 `high`；创建时可覆盖，已有员工配置不变。Claude Code、Cline、Pi 的接口和密钥由本机引擎设置管理，密钥不随源码发布。
