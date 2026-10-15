# CloudHosts · 专家 22 项审查修复与验收（2.9.9）

本轮所有项目内操作使用 CLI 和独立测试环境，未打开可见 GUI 窗口、未删除或重启用户已有云主机、Agent 会话或远端工作文件。离屏 WebKit 窗口位于负坐标。Windows SSH 实机传输只触及唯一命名的系统 Temp 测试目录，验证后立即清理。

## 逐项追踪

| # | 结果 | 主要实现/验收依据 |
|---|---|---|
| 1 | 已修复、隔离验证 | `src/desktops.cjs` 按目标主机 ID 关闭；`tests/expert-integrity.test.cjs` 同时保留 B/C 回环桌面。跳板依赖由 registry 拦截。|
| 2 | 已修复、Mac/Windows隔离验证 | `src/station.cjs` 传输强制完整隐藏文件清单、哈希及空目录；`tests/expert-integrity.test.cjs`、`tests/expert-windows-station-live.cjs` 真 Windows Hidden 属性文件夹字节一致。|
| 3 | 已修复、WebKit验证 | `ui/files.js` 导航失败还原有效目录，`directoryReady` 防旧路径发送，`tests/files-ui-webkit.js`。|
| 4 | 已修复、字节检查 | `src/station.cjs` TextDecoder fatal UTF-8，无法无损解析不打开可写编辑器；非 UTF-8 文件前后字节相同。|
| 5 | 已修复、并发测试 | Station 原始 SHA-256 版本号、原子保存及旧哈希冲突；`tests/expert-integrity.test.cjs` 两编辑者验证。|
| 6 | 已修复、本机往返 | Station `local` 走 `src/local-files.cjs`，不走 SSH；真实二进制/空目录本机 fetch→send 往返。|
| 7 | 已修复、单元测试 | Board Host 校验包含 `local`，但新提交未知 ID 会报错；`tests/expert-integrity.test.cjs`。|
| 8 | 已修复、隔离验证 | 暂时 SSH/认证失败保留原精确 Codex `threadId` 和 Pi `nativeSessionId`；`tests/expert-agent-safety.test.cjs`。|
| 9 | 已修复、WebKit验证 | 异常状态先开放详情与管理按钮，恢复失败仍可重命名/删除；`tests/agent-board-webkit.js`。|
| 10 | 已修复、幂等性测试 | Agent `creationId` 对同一用户操作重复提交复用单角色；没有 ID 的创建失败不会积累错误卡片；`tests/expert-agent-safety.test.cjs`。|
| 11 | 本轮完善、WebKit验证 | `ui/app.js` 筛选非空时禁用主机拖动，清空后恢复；`tests/workspace-mode-webkit.js`。|
| 12 | 已修复、离屏验证 | `ui/remote-tabs.js` 更新已保存桌面信息，未连接的标签重挂载，正在连接不受影响；`tests/expert-ui-webkit.js`。|
| 13 | 已修复、WebKit验证 | 终止终端先确认“结束终端及运行任务”，取消不发送 close RPC；`tests/terminal-input.js`。|
| 14 | 本轮完善、离屏验证 | RDP 只读所有新远程键鼠/剪贴板写操作禁用；切换时释放已按按键/鼠标并清内部状态；`tests/rdp-pointer-webkit.js`。真实用户 Windows 桌面写入测试因避免干扰现存会话而未执行。|
| 15 | 已修复、WebKit验证 | Station 传输进度局部更新；不重建文件项及丢失焦点，`tests/files-ui-webkit.js`。|
| 16 | 已修复、WebKit验证 | 关闭新 Agent 窗口后迟到的创建响应不弹新 inspector；后台创建结果保留在角色列表；`tests/agent-board-webkit.js`。|
| 17 | 已修复、WebKit验证 | 未保存文本弹确认；取消/保存哈希冲突后保留原编辑草稿；`tests/files-ui-webkit.js`。|
| 18 | 本轮完善、WebKit验证 | 仅翻译 UI 标签：用户主机/文件/文件夹/源主机/传输名称标 `data-no-i18n`；`tests/files-ui-webkit.js`、`tests/language-webkit.js`。|
| 19 | 本轮完善、两处 WebKit验证 | Station/文件看板树用方向键选择可见行，左右展开/折叠；同目录刷新恢复存在文件的展开、选择、键盘焦点与滚动，`tests/file-board-webkit.js`、`tests/files-ui-webkit.js`。|
| 20 | 已修复、真实 RPC WebKit验证 | Single Host Agent `roleHeight` 与主看板共用持久状态；`tests/workspace-mode-webkit.js`。|
| 21 | 已修复、连接隔离验证 | 纯显示名更新跳过 idle 检查，地址/认证/桌面等变更仍需空闲；`tests/expert-integrity.test.cjs`。|
| 22 | 已修复、离屏验证 | 严格指纹对话框展示 SSH host:port + 算法与 SHA-256；必须经独立核对并勾选才提交 `hosts.trust`，取消不信任；`tests/expert-ui-webkit.js`。真实未知主机的首次连接必须由用户本人通过可信渠道核对，未模拟自动信任。|

## 验收命令

```sh
npm ci                 # 可选：仅在需重建 node_modules 时
npm run build
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
node tests/expert-windows-station-live.cjs  # 显式选择 Windows SSH 临时目录实测
```

Mac 原生/WebKit离屏：使用项目中的 `tests/workspace-mode-webkit.swift`、`tests/file-board-webkit.swift`、`tests/agent-board-webkit.swift`、`tests/terminal-input-webkit.swift` 对对应 JS fixtures 回归。Win 原生产品测试在系统 Temp 目录展开 zip，验证编译、ConPTY、本机 agent 恢复、文件/隐藏项，无需替换正在使用的安装版。

**发布保护：** 本轮代码和构建不自动重启现有 CloudHosts 后台；已有 PTY、Agent、桌面连接仍需保持。只有确认用户会话可以安全结束后才能使用带校验与回滚的安装脚本激活新版。离屏和隔离测试不等于所有真实云主机长时运行已验证。
