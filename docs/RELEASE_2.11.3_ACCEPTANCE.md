# Aexus 2.11.3 发布验收记录

验收日期 2026-10-15。固定发布身份：**2.11.3 / build 51**。构建标识（buildId）与候选包
链哈希以仓库根 `release.json` 为唯一来源——该文件由 `npm run build` 内容寻址生成，本文
不重复书写具体哈希，避免文档自引用。`/Applications/Aexus.app`（独立安装）与 Toolbox
内嵌 Aexus 均安装同一候选，二者与仓库 `release.json` 的 buildId、后端 `release.verify`
完全一致；精确 buildId / bundleHash 记录在 artifacts 最终报告。

## 缺陷与修复

文件回收站 `trash` 操作原先「先移动数据、后写元数据」，元数据写入失败（ENOSPC/部分写入）
时源路径已消失、正常流程无法恢复（不可见的孤儿数据）。

修复为 **metadata-before-move**：`tempfile.mkstemp` → 写 JSON → `flush` → `fsync` →
`os.replace` 原子发布元数据，再移动数据；元数据失败保留源，移动失败清理元数据，不覆盖已
存在目标。

- 路径一：`Runtime/workspace_files.py`（CloudHosts/Aexus 统一工作台，本地 Core 主机 + SSH
  主机文件，回收站 `.cloud-hosts/trash`）。
- 路径二：`AgentBoard/Aexus/Modules/Tunnel/workspace_files.py`（内嵌 Role Core 云主机
  Team 工作区，回收站 `.agents-company/trash`）。

两副本同步修复、保持独立；trash id / json schema（`{'path': value}`）/ RPC 返回
（`{id, path}`）/ 跨平台语义不变，读端 `trash-list`/`restore` 无需改动即向后兼容。

## 故障注入覆盖（tests/test_trash_atomic.py 共享夹具，对两份模块各跑）

- `os.fsync` ENOSPC → 源与内容原样、无坏 json、无临时泄漏。
- 部分写入（先写一半再 ENOSPC）→ 源原样、无坏 json。
- `os.replace` 发布失败 → 源原样、无 json/临时残留。
- `os.rename` 移动失败 → 源原样、元数据被清理。
- 成功 roundtrip（文件 + 非空目录）→ 列出、恢复原内容、恢复后列表空。

全部使用隔离临时目录，不触碰用户文件/回收站，不填满磁盘，不触发模型。

## 结果口径（本轮实际执行）

- `npm test`：220 通过 / 0 失败。
- 候选打包隔离回归（`artifacts/Aexus.app` 内实际打包的两份 `workspace_files.py`，
  `PYTHONDONTWRITEBYTECODE=1` / `sys.dont_write_bytecode=True`，签名包内无 `__pycache__`/
  `.pyc`）：5 个测试方法全部通过，14 个 subTest 全部 PASS（runtime-candidate +
  tunnel-candidate × 文件/目录故障注入 + roundtrip）。打包模块与源 `sha256` 一致。
- 实现侧证据（`artifacts/claude-manager-20261015/trash-atomic-fix-report.md`）：
  Python 16 项通过（Runtime 专项 11 + 共享夹具 5）、Tunnel 18 通过 + 4 明确跳过、
  Node workspace/windows 11 通过；旧实现负对照证据存于 artifacts，未保留为永久测试。

## 候选与安装身份

- 候选 `artifacts/Aexus.app`、独立安装 `/Applications/Aexus.app`、Toolbox 内嵌
  `/Applications/Toolbox.app/Contents/Tools/Aexus/Aexus.app` 三者 Info.plist 均为
  `2.11.3` / `51`，`CloudHostsBuildID` 与仓库 `release.json` buildId 一致；严格签名
  `codesign --verify --deep --strict` 通过；后端 `release.verify` verified；两份打包
  `workspace_files.py` 与源 `sha256` 一致。
- 安装后用户会话/草稿/主机数据保持：白名单原生 Agent 原生会话保留、无新增 busy
  agent/role、终端草稿（含 GPU 未提交草稿）原样保留；用户数据目录沿用
  `~/Library/Application Support/Toolbox/CloudHosts`，未迁移凭据/会话/文件。

## 清理与保留

安装器备份目录保留 `data/` 与终端快照；仅删除本轮被替代的应用包备份（确认无进程占用
后），未做广泛清理。

## 未覆盖边界（不宣称已完成）

- 本验收覆盖 macOS 管理端；Windows 原生桌面运行与打包验收未完成（`Windows/test_hidden.py`
  等 Windows 分支未在本机运行）。
- 未覆盖真实模型引擎端到端验收（本轮不执行模型调用）；不宣称全 OS 全原生 GUI 或任意
  操作全覆盖。

## 证据

- `artifacts/claude-manager-20261015/trash-atomic-fix-report.md` / `trash-atomic-fix-ready.json`
- `artifacts/claude-manager-20261015/trash-review-prep.md`
- `artifacts/claude-manager-20261015/trash-release-prepare.md` / `ready.json`
- `artifacts/claude-manager-20261015/trash-candidate-runner.py`（候选打包隔离回归）
- `artifacts/claude-manager-20261015/trash-release-final-report.md` / `trash-release-final-ready.json`
  （最终精确 buildId / bundleHash 与各项检查结果）
