# 布局：读取、整理与走线质量

布局只改变 Company 画布上 Team 房间和员工工位的**视觉位置**，绝不修改权限、引擎、工作区、管理关系、会话、排期或任何业务逻辑。Secretary（全局）可整理任意 Team；Manager 只能整理自己的 Team；Governor 可跨 Team。所有写操作都走 Core 的 `layout.write` 校验。

- 读取：`office.layout`
- 整理（唯一的规范写入口）：`office.arrange`
- 走线端点/线段：`connector.get` / `connector.set` / `connector.segment` / `connector.reset`

## 最短闭环

1. 先读：`agents office layout [--team NAME] [--view VIEW_ID] --json`
2. 整理：`agents office arrange --pattern circle|rectangle|grid [--scope teams|employees|all] [--team NAME] [--around ID] [--order JSON] --json`
3. 再读：`agents office layout --json`，检查返回的 `quality`
4. 有交叉时按 `quality.crossings` 调整：重新 `arrange`，或用 `connector.segment` 拖动具体线段

`office.arrange` 一次原子写入房间与工位，返回 `{revision, pattern, scope, rooms, employees, quality}`。`avoidCrossings` 默认开启：先按选中的 `pattern`/`scope` 摆放房间与工位（工位先排，房间后排，房间围绕已成长的 Team 外框），再用**有界、确定性的环旋转**逐 Team 旋转工位环、再旋转整体房间环，只在 `crossingCount`（其次 `overlapCount`、`blockedCount`）严格变好时保留候选，交叉清零即提前停止。它**不承诺通用平面化**，也不隐藏或丢弃任何走线；剩余交叉会诚实地列在 `quality.crossings` 里，由你决定是否继续调整。

`--avoid-crossings false` 关闭搜索，直接采用旋转 0 的基准摆放，便于对照。

## `office.layout` 返回

- `rooms[]`：每个 Team 的 `name`、`bounds`（世界像素）、`employees[]`（`id`、`position` 为相对该 Team 的像素坐标、`editable`）
- `connections[]`：规范正交走线的完整路径（`id`、`managerId`、`employeeId`、`points`、`manual`、`warning`）
- `crossTeamConnections[]`：跨 Team 走线，`status` 为 `routed|hidden|blocked`
- `coordinates`：坐标约定（Team 用世界像素，员工用相对 Team 的像素）
- `quality`：机器可读的走线质量

### `quality` 字段

| 字段 | 含义 |
| --- | --- |
| `crossingCount` | 真实内部交叉数量（两线真正穿过彼此；共享端点、相邻正交拐角不算） |
| `overlapCount` | 共线重叠数量（正长度重叠；共享节点上的公共主干不算） |
| `blockedCount` | 无法干净走线的数量（`warning` 连接 + `blocked` 跨 Team 腿） |
| `crossings[]` | 每个问题的 `kind`（cross/overlap）、`connections`（两条连接 ID）、`point`（近似交叉/重叠点，世界像素）、`avoidable`、`reason` |
| `avoidable` | 是否存在任何可由自动几何清除的问题（至少一个交叉/重叠的 `avoidable` 为 true） |

不要为 `crossingCount` 为 0 之外的值编造“已修复”；如实汇报剩余交叉并给出可操作的下一步。

单个问题的 `avoidable` 语义：**手工路由（`manual`）涉及的交叉不可自动清除**（`avoidable: false`），自动几何只能清掉自动走线；`reason` 会注明 `manual`。共线重叠只在“同一经理、两条线共享真实公共前缀（相同起点的连续相同线段）近源主干”时豁免为不算问题，任意下游重叠仍如实上报。

## `office.arrange` 参数

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `--pattern` | `circle` `rectangle` `grid` | 必填；排布形状 |
| `--scope` | `teams` `employees` `all` | 默认 `all`；`teams` 只排房间，`employees` 只排工位 |
| `--team` | Team 名 | 只排此 Team（可省略，作用范围按权限） |
| `--view` | 视图 ID | 只排视图内的 Team |
| `--around` | 员工或 Team ID | 作为中心/锚点（circle **和 rectangle** 都让该员工/Team 居中；grid 不适用） |
| `--avoid-crossings` | `true`/`false` | 默认 `true` |
| `--order` | 员工 ID 数组 JSON | 工位顺序偏好；越级 ID 会被拒绝，重复 ID 会被拒绝 |

`--order` 只接受目标 Team 内的员工 ID，例如 `--order '["EMP_A","EMP_B"]'` 或 `--order @file.json`。**显式 `--order` 按调用者给出的顺序照单执行**，不强制按角色重排，因此 Secretary 可以放在任意指定位置（含末尾）；未给出时默认主管（supervisor）在前。Secretary 自己也是普通员工节点，可以直接列入 `--order` 或作为 `--around`。

## 常见命令

把各 Team 的房间围绕自己（Secretary）的 Team 摆成一个圈：

```bash
agents office arrange --pattern circle --scope teams --around MY_TEAM --json
```

把某个 Team 内的员工围绕 Secretary 本人摆成一圈（Secretary 在圆心）：

```bash
agents office arrange --pattern circle --scope employees --team MY_TEAM --around MY_EMPLOYEE_ID --json
```

把全部可见 Team 的房间排成矩形（环）：

```bash
agents office arrange --pattern rectangle --scope teams --json
```

按网格整理一个 Team 的工位并指定顺序：

```bash
agents office arrange --pattern grid --scope employees --team MY_TEAM --order '["EMP_A","EMP_B","EMP_C"]' --json
```

检查是否还有交叉：

```bash
agents office layout --json | jq '.quality'
```

## 处理剩余交叉

1. 重读 `office.layout`，拿到 `quality.crossings` 里的 `connections` 和 `point`。
2. 优先重新 `arrange`（换 `pattern` 或 `scope`）。
3. 仍交叉时，用 `connector.get --manager ID --employee ID` 读端点，再 `connector.segment --manager ID --employee ID --index N --x X --y Y` 拖动具体正交线段，或 `connector.set` 调整端点侧与偏移。
4. 手工路由清不掉时不要删除用户的 `connector` 设置；把交叉连同原因汇报给用户。
