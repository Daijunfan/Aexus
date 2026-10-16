# CloudHosts Agent API（派生自可执行 Core 契约）

API version: 1.1.0
Schema SHA-256: 96887c1363fb7fcc08875749284cfbd648843fb2a6ab5e53e111813643724d13
Product version: 2.12.1

> 上表值由 `src/api-contracts.cjs` 的真实命令注册表计算：`apiVersion` 为源码常量，
> `schemaHash` 对当前命令注册表与 `schema.json` 命令求 SHA-256，`productVersion` 对应本次
> 发布版本（package.json）；buildId 由构建时的 `release.json` 生成。可用 `aexus api info`
> 复核。这些命令描述带来源标记的 CloudHosts 会话；Company/Messages/Plan 由 Role Board 使用
> 原始内嵌 Aexus Core，其完整原版 API 文档见 AgentBoard/Aexus/docs/managers/API.md。
> Guardian 与插件产品已排除。

## Native Agent call flow

1. `cloud_docs`: `{"operation":"identity"}` — real Agent, action-scoped management targets, host/workspace and allowed members.
2. `cloud_docs`: `{"operation":"search","search":"plan","agentOnly":true}` — filter registered methods.
3. `cloud_docs`: `{"operation":"describe","command":"plan.create"}` — read precise input/output schemas.
4. `cloud_api`: `{"command":"plan.create","args":{...}}` — Core authorizes this native Agent and returns a structured result.
5. Read the saved object through `cloud_api`. Retain the original call ID for uncertain transport outcomes; do not blindly reissue writes.

`cloud_docs` 支持 `operation` = `identity` / `index` / `search` / `describe` / `document`，全部只读。

Only `cloud_reply` publishes the result of the current assigned group turn. Legacy `cloud_group_reply`, `cloud_delegate`, `cloud_task_status`, and `cloud_plan_create` remain compatible adapters.

## CLI

`cloud-hosts api info`
`cloud-hosts api list --prefix plan.`
`cloud-hosts api describe plan.create`
`cloud-hosts api docs scenario/weekly-verification`
`cloud-hosts api call plan.list --data "{}"`

CLI uses the operator-owned Core endpoint; the Agent tool applies additional authenticated Agent policies and cannot call host credentials or privileged management APIs.

## Supported Agent business commands

### company

| Core command | Effect | Description |
| --- | --- | --- |
| `company.roster` | read | Read permitted Agent identities and roles |
| `company.teams` | read | List visible teams |
| `company.createTeam` | write | Create a real team |
| `company.updateTeam` | write | Edit team with optimistic revision |
| `company.bindings` | read | List visible manager relationships |
| `company.tasks` | read | List work delegated by or to this Agent |
| `company.task` | read | Read one authorized delegated task |
| `company.delegate` | delegate | Delegate to an authorized Agent with stable retry identity |

### messages

| Core command | Effect | Description |
| --- | --- | --- |
| `messages.list` | read | List groups where this Agent is a member |
| `messages.get` | read | Read a group where this Agent is a member |
| `messages.create` | write | Create a group containing permitted members |
| `messages.update` | write | Edit group as Owner/Admin |
| `messages.history` | read | Read published group history, paged |
| `messages.search` | read | Search published group messages |
| `messages.entry` | read | Read one published group message |
| `messages.publish` | publish | Post a non-triggering public Agent message to a joined group |

### plan

| Core command | Effect | Description |
| --- | --- | --- |
| `plan.list` | read | List authorized Plans |
| `plan.get` | read | Read one authorized Plan |
| `plan.query` | read | Search authorized Plan rows, true run states, tags, Teams and Agents |
| `plan.history` | read | Read execution records for authorized Plans |
| `plan.preview` | read | Preview concrete schedule occurrences |
| `plan.create` | schedule | Create a Plan tied to the calling Agent and current grant |
| `plan.update` | schedule | Modify a Plan created by this Agent |
| `plan.archive` | schedule | Archive a Plan created by this Agent |
| `plan.schema` | read | Discover the ten Aexus Plan layout contracts |
| `plan.views` | read | List built-in and authorized saved Plan views |
| `plan.view-create` | write | Save a Plan layout, filtering and sorting without changing tasks |
| `plan.view-update` | write | Change an owned saved Plan view with revision protection |
| `plan.view-delete` | write | Delete an owned saved view; jobs and runs remain unchanged |

### channel

| Core command | Effect | Description |
| --- | --- | --- |
| `channel.list` | read | List channels this Agent currently belongs to |
| `channel.get` | read | Read a channel in current membership scope |
| `channel.timeline` | read | Page actual published news and discussion within current channel membership |
| `channel.history` | read | Page discussion messages without news |
| `channel.post` | read | Read one current article by stable ID |
| `channel.posts` | read | Find active articles only in authorized channels |
| `channel.message-post` | publish | Publish an explicitly authored Channel discussion reply without launching new Agent turns |
| `channel.publish` | publish | Publish a real article only where this Agent is an explicit member-publisher |

## Contract and runtime boundary

Every Agent-callable command declares a machine-readable input schema and output schema. The same dispatcher is used by the native App, Web, CLI and MCP tool. Writes require Full or a current per-call human approval; exact native Agent identity, current membership, role, target workspace, task source and current turn are rechecked by Core. A stable call ID records mutating calls in SQLite; ambiguous calls must be inspected, never blindly replayed.

Scheduled Agent-created Plans retain a creator identity and recheck authority before dispatch. Fixed-text notices never invoke the model. Group Agent publications create public notes and do not fan out fresh Agent tasks.

The CloudHosts Codex engine uses its exact native thread ID; Claude/Pi/Cline/OpenCode companion conversations still have independent collaboration history. These cannot be represented as the same native conversation until supported seamless resume is verified.

The command registry also includes operator/legacy Core commands marked non-Agent-callable. A schema listing does not grant permission or imply that Aexus full business behavior is implemented.

## Host 管理命令（operator，非 Agent 可调）

`hosts.agent-configure` 更改已存在角色的目标主机权限（`ask`/`full`），运行中会话拒绝修改、
下次启动生效；不删除角色、不静默重启会话。CLI：`aexus agent-configure WORK_HOST --session ID --permission ask|full`。

## Scenarios

- `cloud_docs {"operation":"document","document":"scenario/team-discussion"}`
- `cloud_docs {"operation":"document","document":"scenario/weekly-verification"}`
- `cloud_docs {"operation":"document","document":"scenario/delegated-work"}`
- `cloud_docs {"operation":"document","document":"scenario/session-history"}`
- `cloud_docs {"operation":"document","document":"scenario/plan-saved-view"}`
- `cloud_docs {"operation":"document","document":"scenario/plan-query"}`

## Saved Plan views

Run `cloud_docs` with `{"operation":"document","document":"scenario/plan-saved-view"}` to discover the complete versioned create/update/delete flow. Views are metadata owned by the authenticated creator, support the ten Aexus layout identifiers and optimistic revisions, and never create or replay scheduled tasks.

## Complete Aexus command tracking

See [AEXUS_MIGRATION_LEDGER.json](AEXUS_MIGRATION_LEDGER.json) for the historical CloudHosts legacy API mapping: 312 non-product entries. The original complete Aexus Core is now embedded under AgentBoard/Aexus; the old partial mapping is no longer the implementation route. Guardian-only and plugin products remain disabled.
