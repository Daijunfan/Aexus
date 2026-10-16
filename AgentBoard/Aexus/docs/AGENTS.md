# Coding Agent 执行模式

Cloud Team 上的 Coding Agent 有三种执行模式，创建时用 `--execution-mode default|local|cloud`（`card.create` 与 `session.new`）显式指定。省略时：新 Cloud Team 解析为 `default`；显式 legacy `kind`/`workEnvironment` 仍优先；已有记录永不迁移。

| 模式 | 引擎位置 | 工作区位置 | 传输 | 底层字段 |
| --- | --- | --- | --- | --- |
| `default` | 所选云主机（cloud-native-worker；需 codex/claude） | Team 云端工作区 | 原生云端会话 | `kind=cloud-native-worker`, `workEnvironment=team` |
| `cloud` | Core 主机 | Team 云端工作区 | Tunnel | `kind=worker`, `workEnvironment=team` |
| `local` | Core 主机 | Core 本地工作区（Cloud Team 内）或 Build/Work 本地 | 本地 | `kind=worker`, `workEnvironment=local` 或未设置 |

- `default` 是 Cloud Team 的推荐默认。engineCapabilities 不支持 cloud-native-worker 的引擎（Cline/Pi/OpenCode）自动回退为 `cloud`：Core 引擎经 Tunnel 访问 Team 云端工作区。
- Build/Work Team 只有本地执行：`default`/`local` 等同本地；`cloud` 无效。
- 公开员工 / 会话 / topology / `api.describe` / `api.list` 响应暴露派生 `executionMode` 以及 `executionOrigin`（`cloud-host` | `core-host`）、`executionTarget`（`team-cloud` | `core-local`），不暴露凭据。
