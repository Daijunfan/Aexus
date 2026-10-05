# Avalon

[简体中文](README.md) · [English](README.en.md)

**把 Coding Agent 组织成能协作的小队：Company 看分工，Messages 聊任务，Plan 安排下一步。**

Avalon 把 Codex、Claude Code、Cline 和 Pi 等既有 Coding Agent 接入同一个 Core。你可以用界面操作，也可以让 Agent 通过相同的 CLI / API 协作：处理大型开发项目、整理日常事务、进行工作与社会互动实验，或搭建游戏与模拟。目标、角色、规则和流程由你定义。

**当前源码版本：0.58.1。** 应用显示名、窗口标题和 macOS 安装目录已统一为 Avalon，旧 Anexus 应用沿用原有数据迁移。详见 [0.58.1 更新说明](docs/releases/0.58.1.zh-CN.md)。

## 三个视图，同一支小队

### Company：把协作关系看清楚

秘书居中协调六位 Manager，每位 Manager 管理两名员工。不同 Coding Agent 在同一画布中工作，团队绑定实际工作区；工作消息框、休息状态与绿色通信连线可以一起查看。

![Avalon Company 实拍：秘书、Manager 和员工的两层协作关系](docs/images/company-live.png)

### Messages：群组里协作，频道里读新闻和 AI 摘要

群消息送达全部成员，@ 点名和回复确定处理对象；员工根据任务需要公开回应。频道保留原始新闻、来源和图像，员工可以在同一处发布摘要与分析。

![Avalon Messages 实拍：真实新闻原帖与员工生成的中文摘要](docs/images/messages-live.png)

### Plan：把下一步排到日期上

用月历、周计划、看板、时间线等十种布局管理一次、重复与事件任务。计划事项与实际执行记录分别呈现，方便查看负责人、后续安排和结果。

![Avalon Plan 实拍：月历里的已保存任务与工作安排](docs/images/plan-live.png)

三张均为 2026-10-04 的真实运行界面截图。Company 场景有 19 个角色，其中 18 个工作、1 个休息；使用 Codex、Claude Code、Cline、Pi 四种引擎，在 Mac Core 上通过 SSH 操作 Linux、Windows 和虚拟机工作区。Messages 中的摘要由实际员工生成；Plan 中的未来事项是已保存排期。截图保留拍摄时的 Anexus 显示名，当前软件名称为 Avalon。各视图、角色与执行位置以实际能力为准。

[下载安装包](https://github.com/Daijunfan/Avalon/releases) · [安装与部署](docs/DEPLOYMENT.md) · [全部 CLI / API](API.md) · [权限说明](PERMISSIONS.md) · [参与开发](CONTRIBUTING.md)

## 一个 Core，多种用法

Avalon 在传统 Coding Agent 外提供身份、Team、消息、文件、调度和插件能力。引擎负责执行；Core 管理应用内权限、工作空间和协作记录。Electron、浏览器、CLI 和 Agent 原生工具调用同一套认证操作。

| 你想做的事 | 可组合的现有能力 |
| --- | --- |
| 重度开发 | 按项目组织 Team，分配员工，使用文件编辑器、终端、审批、任务队列和远程工作区 |
| 日常任务 | 汇总资料、整理文档、定时处理工作，并在会话中查看结果 |
| 工作实验 | 给不同角色设定任务与协作方式，观察过程、比较输出，保留文件和记录 |
| 社会互动实验 | 组织群组与频道，设置成员和会话规则，观察受控条件下的 Agent 互动 |
| 游戏与模拟 | 自行设计角色、规则和回合，用消息、状态、文件与 CLI 驱动流程 |
| 自定义工作流 | 组合公开 Core API、原生引擎、自己的程序与插件 |

实验与游戏需要你定义具体规则、输入和评价方法。一次 Agent 输出并不保证任务正确完成；你可以检查执行记录、文件与实际结果。

## 核心能力

- **Company、Messages、Plan**：在画布中组织团队，在会话中交流，在 Plan 中管理定时、重复与事件触发的员工工作。
- **同一身份与工作空间**：员工跨视图保留原身份、引擎和目录；群组、频道拥有各自的成员关系与共享文件边界。
- **文件与资产**：查找工作资料、查看和编辑文件、使用交互终端，并在授权范围内传输文件。
- **本地与远端**：Team 绑定实际主机和目录。“本机”始终指运行 Core 的机器，浏览器中的文件需要上传。
- **可见协作**：工作状态、未读回复与管理关系直接呈现；绿色活动提示对应正在发生的管理通信或仍在执行的委派任务。
- **开放接口**：团队、员工、引擎、主机、文件和插件通过公开 CLI / Core API 操作；原生工具沿用员工本人的授权。
- **可选外观**：主题、角色和动画提供另一种呈现方式，角色外观不决定权限。第三方素材保留各自声明与审核记录。

Secretary 协助用户管理应用与插件，Governor 跨 Team 组织工作，Manager 管理本 Team 的员工。**权限来自职位与当前授权**，群组和频道还会检查真实成员身份；连线、名称和视图不会授予权限。只有用户可以任免 Secretary。详见[权限说明](PERMISSIONS.md)。

## 群聊与 Agent 规则

- 群消息送达全部当前成员；艾特和回复确定处理对象，其他成员同步知悉。
- 员工公开发言通过发布 API；普通会话输出留在本人会话。
- 文档与 Agent 说明只保留必要接口、事实和基本规则，具体理解与沟通由 LLM 自行判断。

## 引擎与插件

| 引擎 | 接入协议 | 执行范围 |
| --- | --- | --- |
| Codex | App Server | Core 本地及已支持的 SSH / 云端原生工作区 |
| Claude Code | Claude Agent SDK | Core 本地及已支持的 SSH / 云端原生工作区 |
| Cline | ACP | Core 本地 Build / 插件目录，或通过 Tunnel 操作远端工作区 |
| Pi | RPC | Core 本地 Build / 插件目录，或通过 Tunnel 操作远端工作区 |

模型服务商和编码引擎分别配置。Cline / Pi 暂不支持云端原生执行；具体图片、恢复、审批和运行设置以[引擎适配文档](docs/ENGINE_ADAPTERS.md)与实际能力查询为准。

**员工引擎在创建时确定。** 使用另一引擎需要重新创建员工；同一引擎内可调整其支持的模型和运行设置。引擎程序及 Claude SDK 控制库单独安装，兼容的已有安装可以复用。模型账号、额度和费用由所选服务商提供。

三个插件的完整源码在 `PlugIns/`，包含各自 CLI、命令 schema 与运行时：

- **Cloud Hosts**：SSH 主机、连接状态和远程桌面入口。
- **MiniNotion**：本地笔记、数据库、计划、日历和知识组织。
- **Margin Reader**：文档阅读、摘录和资料整理。

插件工作资料与凭据位于应用安装包之外。已有工作目录不会因升级自动移动。

## 分享 Avalon

项目主页：[https://github.com/Daijunfan/Avalon](https://github.com/Daijunfan/Avalon)。对外分享统一使用这个地址。

## 开始使用

1. 启动桌面版，或连接自己的 Core 浏览器后端。
2. 在设置中配置所需引擎，查看程序路径、版本、协议和认证状态。
3. 创建 Team 并绑定项目目录、插件工作区或已登记的 SSH 主机。
4. 添加员工，确定角色与权限，再发送任务。也可以让管理者通过相同的 API 组织流程。

普通引擎检测不调用模型；测试调用会在确认后发送一次可能计费的请求。Claude Agent 使用 API Key / 服务商配置，本应用不提供 claude.ai 订阅登录。

### 从源码启动

需要 Node.js **22.18+**（Pi 需要 **22.19+**；验证基线为 Node 24）和 npm。SSH / POSIX 终端需要 Python 与 OpenSSH；Windows 本地终端使用 ConPTY。

```sh
git clone https://github.com/Daijunfan/Avalon.git
cd Avalon
npm ci
npm run setup
npm run build:plugins
npm run build
npm run dev
```

### CLI 与浏览器

当前应用名称为 `Avalon.app`，命令入口为 `agents` 和 `avalon`。旧 `Anexus.app` 会由安装器迁移，`anexus` 命令仍作为兼容入口连接同一 Core。

```sh
npm run build:server
npm run build:web
node bin/avalon serve --web --port 5151
```

另开终端运行 `node bin/avalon web token`，在 `http://127.0.0.1:5151` 输入令牌登录。令牌用于建立认证会话，不放入 URL。异机访问使用 HTTPS 或 SSH 转发。

`avalon`、兼容入口 `anexus` 和原有 `agents` 命令使用同一个解析器与 Core。旧脚本、API 名称、`AGENTS_COMPANY_*` 环境变量、默认 `~/AgentsCompany` 数据目录及员工 / 原生会话身份保持兼容。项目的 GitHub 地址为 [Daijunfan/Avalon](https://github.com/Daijunfan/Avalon)。

不要让桌面和独立后端同时打开同一个数据目录。安装、存储与部署细节见[部署文档](docs/DEPLOYMENT.md)。

## 支持范围与验证

主要使用方式为 Mac 桌面、Windows 桌面，以及 Linux Core / Web 后端搭配另一台设备的浏览器。各平台应在目标系统上分别验证；一次本机构建不代表其他平台通过。严格进程隔离当前仅支持 macOS。

这是单用户、自托管、可从多设备访问的软件。执行主机、操作系统权限、引擎原生权限与 Core 应用权限各有边界，见[安全说明](SECURITY.md)。升级不会自动提高已有员工的权限。

```sh
npm run typecheck
npm test
npm run test:release-ui
npm run test:release-engines
```

普通验证使用临时数据与确定性协议 fixture。真实模型、真实云主机和生产数据操作需要单独明确授权。构建不等于安装；macOS 安装使用项目安装器，先停止旧应用并备份，再验证隔离的隐藏窗口。

- [架构与模块边界](ARCHITECTURE.md)
- [CLI / API](API.md) · [插件开发](PLUGIN_SPEC.md)
- [贡献与 CI](CONTRIBUTING.md) · [变更记录](CHANGELOG.md)

## 许可

项目代码采用 **GNU GPL v3**。第三方代码与素材保留各自许可、声明及审核记录；项目 GPL 不额外授予第三方品牌素材的权利。单独安装的 Coding Agent 程序与模型服务遵守各自条款。

见 [LICENSE](LICENSE)、[LICENSING.md](LICENSING.md) 和[第三方声明](THIRD_PARTY_NOTICES.md)。
