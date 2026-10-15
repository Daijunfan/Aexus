# Aexus 2.11.2 发布验收记录

验收日期 2026-10-15。固定发布身份：**2.11.2 / build 50**，构建标识
`5cf36f9b2d20c9e60e6822b970dcc4bcd01e859524c3b405ab2153bd32f15c3d`。`/Applications/Aexus.app`
与 Toolbox 1.5.1（build 20）内嵌 Aexus 均已安装该版本，后端 `release.verify` 一致；
图标候选包链哈希 `793f0670…`、内容清单 `dacf703b…`。

## 结果口径

- `npm test`：220 通过 / 0 失败。
- 当前核心套件：169 项通过。
- 适用业务 UI 套件：107 项通过（106 完整 + 1 明确移除范围跳过），31 项排除不计入通过。
- 打包集成链：10/10 通过（`artifacts/full-acceptance-20261015/integration-r2/`）。10/10 完整
  集成链执行于 build49；build50 图标补丁通过业务文件字节一致、原生启动与签名检查承接该
  结果，未重跑完整矩阵。完整 backend buildId 5cf 未变；runtime/native 改动不是 Core/UI 改动。
- 原生 WKWebView 认证生命周期：冷启动 22 项、新进程沿用 Cookie 22 项全部通过；
  每阶段各 9 个真实文档写入，被拒已认证请求 0，导航失配 0。

## 真实模型覆盖

- DeepSeek 真实 Pi（provider deepseek/deepseek-flash）：文件写入/读回与原生会话重连通过。
- Role Board：Core API 建立角色、关系、群聊并创建、运行 Plan；UI 完成委派消息、授权与
  群聊 mention 并检查界面结果（`tests/role-board-deepseek-live.cjs:13-31`）。不宣称每步均走表单。
- Claude：真实 managed SDK 0.3.272 + 实际 CLI 2.1.300，同一会话 thinking off/on
  （模型 deepseek-v4-pro，high）通过。
- 引擎就绪：Codex 0.162.1、Claude 2.1.300、Cline 3.0.71、Pi 0.87.1。

## 安装后 Role 口径（最终依据）

Agent 与 Role 身份独立，安装后用户数据保持；详细本地审计见
`artifacts/claude-manager-20261015/post-install-role-audit.md`。

## 图标根因修复

`Engine/App.swift` 原先无条件用旧版 `Aexus.icns` 覆盖现代 `Assets.car` 图标，导致白边；
现仅在缺少 `CFBundleIconName` 时回退旧版 icns；`build.py` 的 `CFBundleVersion` 49→50。
GUI/Core 业务字节与 5cf 一致：5823 文件不变，仅 Info.plist、原生二进制、Assets.car
（actool 非确定性）与 CodeSignature 变化。最后 build49→50 runtime 补丁未再修改图像本身；
本次整体发布确已处理 PNG 透明外缘并再生成 ICNS/ICO。未加自定义 Finder 图标。实际系统
图标已由 root 亲自确认（`final-visual-approval.json` APPROVED），安装包原生签名验证通过。

## 未覆盖边界（不宣称已完成）

- 本验收覆盖 macOS 管理端；Windows 原生桌面运行与打包验收未完成。
- 扩展生态与其余原生交互分支未完整覆盖；未覆盖外部 Codex 组内中转站故障。
- 不宣称全部 OS 全原生 GUI，也不宣称任意操作全覆盖。

## 证据

- `artifacts/claude-manager-20261015/final_review-report.md`
- `artifacts/claude-manager-20261015/post-install-role-audit.md`
- `artifacts/claude-manager-20261015/native_live_acceptance-final-report.md`
- `artifacts/claude-manager-20261015/icon-runtime-ready.json` / `icon-runtime-report.md`
- `artifacts/full-acceptance-20261015/integration-r2/`（10/10 通过）
