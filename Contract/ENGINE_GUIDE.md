# Aexus Engine 开发指南

## 独立开发边界

在 `Engine/<slug>/` 新建应用。`engine.json` 的 id 必须等于目录名；版本采用 x.y.z；contractVersion 当前为 1.0.0。`Page.tsx` 导出接收 `{client: ContractClient}` 的 React 组件；`cli.mjs` 提供无界面运行；`workflow.mjs` 可供两者共享。

不修改 Infra 导航或 Core Store。宿主通过 manifest 发现、通过构建时 glob 加载页面；添加 Engine 后需要重新构建。坏的 manifest 会显示在 Engine 目录错误列表，页面渲染异常不会关闭 Infra。清单声明不能动态加载任意远程脚本。

## 输入与可靠交付

一个业务 Engine 必须讲清三个问题：用户要提供什么、系统会做什么、怎样核对结果。把输入和输出 schema 放在 manifest；为实际副作用提供稳定 ID、状态查询和失败恢复，不把所有异常写成“成功”。

参考 `Engine/workspace-audit`：输入一个已经存在的 Team；读取它和员工的真实目录；输出条目清单与准确计数；任何读取失败都会使流程失败；无收费模型和文件写入。CLI 的 `--output` 使用排他创建，保护已有报告。

## React 页面

```tsx
import type {ContractClient} from '../../Contract/protocol'
export default function Page({client}:{client:ContractClient}) {
  // Domain UI and workflow live here. Invoke only declared capabilities.
  // Example: await client.invoke('plan.query', {})
  return <section>My Engine</section>
}
```

Engine 可以拥有自己的样式、模块和业务依赖；不能引用 Infra 内部组件作为隐式接口。避免无前缀全局 CSS。用户明确操作前不要自动创建员工、发送任务或调用模型。

## CLI

```js
import {createNodeClient} from '../../Contract/node-client.mjs'
const client=createNodeClient({engineId:'my-engine'})
const plans=await client.invoke('plan.query', {})
```

SDK 默认定位同一包中的 Node CLI 入口，也支持 `AEXUS_CLI` 或 `createNodeClient({cli,env})` 指定另一份 Node 入口脚本。已安装的可执行包装器使用 `createNodeClient({launcher:['/Applications/Aexus.app/Contents/Resources/cli/aexus'],env})`；需要指定运行时的平台可传 `[运行时可执行文件, CLI脚本]`，不经过 shell 字符串解析。`AGENTS_COMPANY_HOME` 等旧变量保留；以员工身份运行时只使用该员工已有凭据，不读取或签发 operator 凭据。

## 接口和测试

用 `aexus contract describe --command COMMAND --json` 查当前请求结构，requiredCommands 声明实际使用的方法。插件 API 不在本版 Engine Contract 内；需要插件时先协调独立扩展，不能私自越过核心层。

至少覆盖有效输入、无权限、对象删除/改名、网络错误、部分完成和可验证产物。所有测试使用临时 Core/工作区；不要拿用户的团队、聊天或真实排期做演示。

可直接运行参考案例：

```sh
node Engine/workspace-audit/cli.mjs --input '{"team":"Research"}'
npm run test:contract
npm run test:layers
```

并行开发时，在根目录 `share_chat/` 声明自己占用的 Engine 子目录；只有确有协议缺口时协商 Contract 修改。Infra 可以在边界内继续优化，不应要求每个 Engine 跟着改内部路径。

## 加载、切换与后台任务

宿主首页只展示清单；用户必须将引擎卡片拖入中央启动舱后才挂载 Page（键盘支持抓取卡片并投放）；普通单击不加载。页面收到的 ContractClient 固定到本 Engine，不使用别的窗口当前选择。Node CLI 显式传入自己的 engineId 或在进程启动时设置 AEXUS_ENGINE_ID，不在并发任务之间反复修改 process.env 来切换身份。

页面卸载不等于业务取消。需要离开页面后继续的工作使用持久 workflow runtime；恢复时读取原任务、员工和产物 ID，不重新招聘或重复发送。用户可以在另一个 Engine 工作，同时你的 workflow、队列和 Plan 任务继续执行。只有明确取消操作才停止目标任务。

新建资源自动关联创建请求的 Engine；需要复用旧 Team/员工时，由用户在 Linked Engine resources 中显式关联。不要根据显示名推断所有权，不要直接写 engine-resources.json。详细行为见 [Engine 工作区](../Infra/src/docs/ENGINE_WORKSPACES.md)。

## 页面隔离与效果分类

每个 Engine 的样式放在自己的目录，使用唯一根类名前缀。宿主提供现有主题变量（例如 `--bg`、`--fg`、`--accent`），不提供可随意导入的 Infra 组件。切换层保留 Infra 表单和会话状态，不创建第二套数据。

能力描述的 `effect` 为 read、write 或 conditional。`readOnly:true` 只表示无条件读取；命名迁移、共享文件及可取消的进度接口按参数区分读写，标记为 conditional，并始终进入原 Core 的审批/权限检查。
