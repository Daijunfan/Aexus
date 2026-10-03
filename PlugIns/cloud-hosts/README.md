# Cloud Hosts

Avalon 的 CLI-first 云端工作台：主机管理、持久 SSH 终端、原生 RDP 和内嵌 VNC。所有业务操作通过共享 `host.*` Core API，无需创建员工，也不需要 Electron 窗口即可从 CLI 使用。

- 概览：主机搜索、系统、认证、指纹与缓存连接状态；仅显式刷新触发 SSH 检查。
- 终端：xterm.js + 现有 SSH PTY，支持会话恢复、Ctrl+C、Unicode、窗口缩放。
- 桌面：RDP 原生客户端入口；noVNC 内嵌画面、画质、只读和全屏；可选 SSH 安全转发。
- 权限、凭据和主机数据始终由宿主 Core 管理，不维护第二份数据库。

```sh
npm ci
npm run build:plugin -- --out /tmp/cloud-hosts-plugin
npm test
agents serve
node cli.cjs --workspace /existing/folder hosts.list
```

完整参数、远端前提和平台边界见 [API.md](API.md)。RDP 启动不等于登录成功，通道状态不等于服务健康。远程 Web VNC 暂不支持；Windows/Linux Core 需分别进行原生平台验收。

noVNC 1.7.0 使用 MPL-2.0；xterm.js / FitAddon 使用 MIT。构建将许可证与 bundle 的第三方注释一起打包。源码包保留 npm lock；noVNC 源码可从 https://github.com/novnc/noVNC/tree/v1.7.0 获取，未修改其源码。
