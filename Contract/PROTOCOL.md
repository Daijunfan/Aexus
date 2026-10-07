# Aexus Engine / Infra 协议 1.0.0

## 两类调用者与认证

Electron、Web 和 CLI 均使用原 Core 认证。页面由宿主注入 `ContractClient`，Node Engine 用 `createNodeClient({env})`。用户的请求保留用户身份；员工的请求保留该员工凭据、Company 职位、会话成员资格和当前授权。不得把普通员工请求转换成 operator 请求。

Engine manifest 是兼容性声明，不是权限凭据。Engine 源码和已安装插件都属于用户选择运行的受信任代码；本版没有宣称对恶意同进程 Engine 提供操作系统沙箱。

## 发现与版本

```sh
aexus contract info --json
aexus contract engines --json
aexus contract describe --version 1.0.0 --domain messages --json
aexus contract describe --version 1.0.0 --command chat.create --json
```

`contract.info` 返回版本、传输和权限边界；`contract.engines` 仅读取清单，不执行 Engine。无效清单单独返回错误，不影响有效引擎。描述接口可以用于查看权限范围以外的公开文档，执行仍按真实权限检查。

`commands.v1.json` 是本版的明确导出表。每项包含 name、domain、permission、inputSchema、schemaSource、readOnly、transport。`readOnly:true` 仅用于没有写入变体的操作；具有读写变体的接口以 `effect:conditional` 标识，如 conversation.file。具体读写审批始终由 Infra 按参数与真实身份判断，原生 planning 模式继续禁止写操作。

## 请求与响应

```sh
aexus contract call --version 1.0.0 --command group.list --args '{}' --json
printf '%s' '{"version":"1.0.0","command":"plan.query","args":{}}' | aexus api call contract.call --args @- --json
```

现有认证线路的外层响应保持不变：

```json
{"ok":true,"data":{"contractVersion":"1.0.0","command":"group.list","data":["Research"]}}
```

失败返回 `{"ok":false,"error":"…","code":"…"}`；现有 Core 的某些历史错误没有 code，SDK 对它们使用 `INFRA_ERROR`。协议错误包括 `CONTRACT_VERSION_UNSUPPORTED`、`CONTRACT_COMMAND_UNAVAILABLE`、`CONTRACT_REQUEST_INVALID`、`CONTRACT_STREAM_REQUIRED`。传输或解析失败使用 `CONTRACT_TRANSPORT_ERROR`。

`args` 必须是 JSON 对象。数据结构和业务结果继承该版本所列 Core API，Contract 不复制或重解释员工、消息或计划。未知版本、未导出命令和递归 contract.call 都在操作前拒绝。

CLI 的 JSON 参数支持 `--args @file.json` 与 `--args @-`。Node SDK 用 stdin 传输，避免大参数触发系统命令行长度限制。环境变量或命令输出中的凭据不得写进 Engine 报告。

## 流式读取和界面通知

`session.follow` 是现有的换行分隔 JSON 流。Node SDK 的 `follow(employeeId,{signal,raw})` 会先核对 Contract 能力，再订阅原 CLI；结束、取消和错误有明确终态，不自动重新订阅。流可能先包含历史 snapshot，随后包含事件；消费端按真实消息 ID 合并，不把 snapshot 当成新任务。

```js
import {createNodeClient} from './node-client.mjs'
const client=createNodeClient()
for await (const event of client.follow(employeeId,{signal})) {
  // Render or persist the existing session event. This is not a send operation.
}
```

Engine 页面可以按需重新读取状态；执行任务与读取消息是两件独立操作。所有用户已读写入必须明确使用既有 acknowledge API，浏览列表或生成报告不能自动清除私聊/群聊未读。

## 并发、失败与任务验收

单次请求不是跨业务事务。任务可能在网络响应丢失前已执行；超时不代表未执行。SDK 不自动重试写操作。消息重试使用原 `clientMessageId`，计划修改使用当前 revision，文件编辑使用 hash，分别按原业务去重/冲突规则处理。

Engine 的状态和产物由 Engine 负责。多步计划应记录输入、稳定对象 ID、已接受操作及结果引用，使用查询确认终态。消息送达、Agent 读取和工作完成不能相互替代。不得用新建员工或重复发送代替恢复不确定状态。

## Engine 作用域与并行执行

Engine 页面只有在用户从首页显式 Load 后才挂载。宿主注入的客户端固定到该 Engine；Node 客户端用 `createNodeClient({engineId:'deep-research',env})`，也支持 `AEXUS_ENGINE_ID`。客户端在创建时复制环境和启动参数，其他任务以后修改全局环境不会重定向已有客户端。

CLI 可以使用 `aexus --engine-scope deep-research ...`。作用域放在传输外层的 `engineScope`，不混入各命令的业务 args；本地 socket、HTTP 和 session.follow 都保留它。null 表示首页的空范围，未提供表示保留既有管理 CLI 行为。已继承的调用/委派作用域不可被嵌套请求更换，原身份与权限继续单独校验。

查看选择属于窗口，执行归属属于每项工作流、原生任务和计划。A、B 可同时执行；返回首页或显示 B 不影响 A。`view.load-engine` 仅选择工作区，`view.launcher` 仅回首页，不调用发送、取消或删除。后台 `workflow.*` 使用该工作流的持久 engineId，不读取当前窗口来决定归属。

`infra.scope/bind/unbind` 是用户显式关联现有资源的入口，不赋予 Agent 管理权限。新资源按创建请求归属；关联/取消关联不复制或删除原对象。查询数量、分页、直接 ID、目录和订阅都遵守同一范围。呈现事件携带接收窗口的 Engine 与导航版本；切换后迟到的旧事件/响应丢弃，不重放写操作。取消流式订阅不取消员工任务。

详细规则及可执行命令见 [Engine 工作区](../Infra/src/docs/ENGINE_WORKSPACES.md)。这些边界不提供恶意受信代码的操作系统沙箱。

## 文件与远端

路径始终属于 Core 或指定执行主机。浏览器本地文件通过上传；远端文件走 Tunnel/传输 API，不能当作客户端本地绝对路径打开。文件位置使用 Core 返回的作用域和相对路径，不通过员工显示名拼接身份。

群组/频道原件、成员一级子目录、Company Workspace 继续使用原权限；目录显示或 Engine 名称不会授予写权限。复制保留来源，冲突不覆盖目标。共享群成员资格与 Company 管理权限分别检查。

## 版本演进

v1 当前精确版本是 1.0.0。未来可并存多个协议大版本；不要在 v1 名义下删除命令、收紧既有输入或改变结果含义。增加能力需要同步清单和测试。兼容旧 CLI 和数据路径不要求保留旧源码物理结构。

## 传输细节与测试

Node 客户端对非法响应对象、版本不匹配、进程提前结束和超时返回明确错误；不会重试写操作。循环引用等非 JSON 输入在启动进程前拒绝。`follow` 保留原 CLI 的 `snapshot` 和后续事件，空闲流以 EOF 结束，不生成假的任务完成事件；支持 AbortSignal 取消订阅。

Contract 不开放专用原文凭据导出，`host.list` 的 `credentials:true` 形式也被拒绝；原 Infra API 与其授权行为不变。受信任 Engine 仍能调用获授权的普通文件接口，这不等于针对恶意代码的沙箱。

`npm run test:boundaries` 检查物理结构、静态层间依赖和打包文档；`node Infra/src/test/aexus-sdk-test.mjs` 检查无 shell 传输、错误恢复与取消。

能力元数据的 `readOnly` 采用保守定义：只在整个操作无写入变体时为 true。`effect:conditional` 明确标识根据参数变化的效果，不能凭一次默认参数查询推断整项 API 都是只读。
