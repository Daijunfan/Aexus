# Cloud Hosts 验收记录

最新：1.2.2 已完成安装、压力测试与隐藏窗口验收，性能对照及数据保留结果见 [PERFORMANCE.md](PERFORMANCE.md)。以下 1.2.0 记录保留历史测试范围。

日期：2026-09-27。执行环境：macOS / Apple Silicon。全部自动 UI 验证使用隐藏窗口和隔离数据目录，无模型调用。真实 SSH 检查为只读操作，没有创建员工或修改远端系统配置。

## 已通过

- `npm run typecheck`：共享 Core 类型检查。
- `npm run build`、插件独立 `build:plugin`：应用编译与 UI 打包。
- `npm --prefix PlugIns/cloud-hosts test`：独立 CLI 与 runtime 对全部已声明方法的宿主映射、未知方法拒绝。
- `node test/cloud-hosts-test.mjs`：主机迁移去重、密码加密、SSH askpass、主机执行、目录、Team 引用保护和插件 CLI。
- `node test/cloud-host-health-test.mjs`：连接检查合并、三路并发上限、失败隔离及缓存。
- `node test/cloud-workbench-test.mjs`：真实 PTY 的目录和环境变量保留、Unicode、缩放、Ctrl+C；主机间会话归属；离线错误；活动连接保护；并发转发复用；VNC WebSocket 二进制传输和 Origin 拒绝；RDP 配置不含密码且保留 NLA/证书检查；清理；普通员工权限拒绝。SSH 和桌面服务使用隔离的本地协议 fixture。
- `node test/cloud-workbench-ui-test.mjs`：隐藏 Electron 窗口，主机搜索/创建/编辑/删除、密码显示、SSH 桌面配置、真实终端输入与页签恢复、完整 VNC RFB 握手/画面/键盘/鼠标、只读、画质、断开、RDP 准备状态和 620px 布局。
- `npm run test:coverage`：149 项静态 CLI/Core/UI 覆盖检查通过；Manager 文档已同步。
- 插件运行依赖的 `npm audit --omit=dev`：未报告漏洞。

## 真实主机检查

- 两台现有 Ubuntu 主机：持久 SSH Shell 可执行只读命令并确认远端 Linux。单次观测从打开到标记输出约 0.9–1.0 秒。
- 已登记 Windows 主机：隐藏 xterm 中的 PowerShell 输入、输出和真实 Windows 平台确认通过，单次观测约 2.6 秒。
- Windows 的 3389 端口监听；经新建托管 SSH 转发完成 RDP X.224 协商，选择安全协议 2（HYBRID/NLA），协商阶段单次约 50ms。
- Ubuntu 检查时未监听 3389/5900/5901，没有自动安装桌面服务。

上述时间是单次连接观测，不是帧率、吞吐或 SLA。原生 RDP 客户端中的桌面登录、音视频、长期交互流畅度未验收；真实 Ubuntu VNC 桌面尚未提供可连接服务。Windows/Linux 原生 Core、远程 Web VNC 未验收；后者当前明确不支持。Windows 的原始 PTY 需要终端客户端响应终端查询，内嵌 xterm 已实测处理该协议。

真实 Windows 验证入口（显式 opt-in，不调用模型）：

```sh
AGENTS_CLOUD_WORKBENCH_LIVE=1 node test/cloud-workbench-live-ui-test.mjs
```

## 1.2.0 历史宿主集成记录（非当前安装状态）

- `node test/cloud-hosts-ui-test.mjs` 中主机 UI CRUD、密码、SSH 检查和目录浏览完成，但宿主“创建 Cloud Team”后表单未关闭，旧用例未整体通过。该环节在本插件工作台之外；本轮没有修改 Team 表单。
- `npm run app` 被项目技术检查阻止：Margin Reader 源码版本 0.6.0 与 `plugins.lock.json` 中的 0.5.0 不一致。同一工作区另有插件修改，本轮未替其决定发布版本。该阻塞已由后续工作解除；1.2.1 已按项目流程安装并验证。
- 全工作区 `git diff --check` 另报告 `src/renderer/src/styles/pets.css` 的尾部空行，属于已有的其他改动，未清理。

构建结果位于 `build/plugins/cloud-hosts/`；它依赖本轮新增的宿主 `host.terminal-*` / `host.desktop-*` Core API，不能仅替换旧 App 的插件文件来获得完整功能。

## 第三方实现依据

- noVNC RFB API：https://novnc.com/noVNC/docs/API.html
- Microsoft RDP 属性：https://learn.microsoft.com/en-us/azure/virtual-desktop/rdp-properties

截图位于仓库 `artifacts/cloud-workbench-{overview,terminal,vnc,rdp,compact}.png`。VNC 截图中的彩色画面来自协议 fixture，不能作为真实 Ubuntu 桌面的证据。
