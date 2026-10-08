# Aexus Infra — 员工协作与可视化 API

本指南属于 Infra 内部功能，不是 Engine 协议，也不包含软件插件的命令。CLI、Agent 原生工具、Electron 和浏览器都进入同一个已认证 Core。

## 发现与身份

```sh
aexus infra api --domain company --json
aexus infra api --domain messages --json
aexus infra api --domain plan --json
aexus infra api --domain files --json
aexus auth whoami --json
aexus api describe chat.send --all --json
```

`infra.api` 只发现当前核心功能和参数，不授权。普通 Employee、Manager、Governor、Secretary 的原有管理范围保持；Company 管理权限与群组/频道 Owner/Admin/Member 分开。读取元数据不创建员工、不启动引擎、不标记消息已读。

## Company：对象、关系与布局

先用 group.list、session.list、management.topology 读取真实 ID 和 Team，再使用 card.create、management.bind/unbind、office.layout、card.place、connector.* 操作。绑定关系是显示和来源关系，不替代权限。

```sh
aexus infra group list --details --json
aexus infra management topology --json
aexus infra office layout --json
```

员工创建时确定 Coding Agent 引擎、Team、工作区和执行主机。重命名只改展示名；后续布局不移动文件或复制原生会话。多对象删除保留原审批与 deleteWorkspace 的显式选择。

## Messages：工作与公开发言

私聊用 session.send/enqueue；群组用 chat.send；频道讨论用 channel.message-send。原生输出留在工作上下文，需要公开时显式使用 chat.post/channel.message-post。频道引擎发布文章走 channel.publish，普通讨论不混作文章。

一次发送使用稳定 clientMessageId。响应丢失后查询原结果，不盲目重新发送。状态要分别读取：队列/任务状态、按目标的投递回执、用户已读。Company 员工会话和 Messages 私聊共用私聊已读；群组与频道分别记录。

```sh
aexus infra session status --employee EMPLOYEE_ID --json
aexus infra session transcript --employee EMPLOYEE_ID --limit 50 --json
aexus infra chat history GROUP_ID --limit 50 --json
aexus infra channel timeline CHANNEL_ID --limit 20 --json
```

群文件通知继续是原文字加持久附件引用，不自动复制到私聊。全部文件操作根据 workspace.catalog / conversation.workspace 返回的位置执行。

## Plan：规则、状态与验收

plan.query 是统一读取入口；plan.views / calendar / timeline / analytics 只展示相同任务。schedule.create/update/pause/resume/delete 管规则；schedule.history 查实际运行；schedule.trigger 明确触发事件规则。未来触发时间不能当作已经执行。

```sh
aexus infra plan query --json
aexus infra schedule preview --spec @schedule.json --json
```

schedule.preview 的准确参数以 api.describe 返回为准。修改使用当前 revision；批量删除使用逐 ID 版本表。任务执行继续复用同一个员工上下文，取消时核对当前任务身份。

群/频道固定通知 conversation.notice-* 独立于 Plan；帖子数量触发 channel.post-trigger-* 也独立。不同规则不能相互删除或复用 ID。

## 文件、UI 和异常

文件编辑使用 hash 防覆盖；复制/上传先取得传输 ID，再等待完成，不把 queued 写成成功。普通成员只写自己的一级目录，现有 Secretary 特权按实际成员和角色检查，不由显示名称决定。

启动页不挂载业务内容；view.load-engine 选择一个 Engine，view.launcher 返回首页。view.layer 切换 Engine/Infra，view.select 选择 Company/Messages/Plan，view.open/close 保留原会话返回关系。每个客户端一次查看一个 Engine，多引擎后台任务并行且不随查看切换。显式资源关联与请求作用域见 [ENGINE_WORKSPACES.md](ENGINE_WORKSPACES.md)；现有职位授权独立检查。

所有命令详细定义见 [API.md](API.md)，权限见 [PERMISSIONS.md](PERMISSIONS.md)。本轮补充的 schema 是既有输入的文档化，业务校验仍留在各领域实现；没有增加第二套员工 CRUD 或通用万能事务。

## 工作流状态与低开销读取

Engine 后台任务继续通过公共 `workflow.*` 调用。`workflow.get` 可传入非负整数 `ifRevision`；版本相同时仅返回 `{id, engineId, revision, unchanged: true}`，客户端保留上一次公开视图。版本变化或不传该参数时返回完整公开视图。鉴权与 Engine 归属检查先于缓存判断；读取不启动模型、不修改任务，也不返回私有材料和提示词。调用类型与生命周期见 [Workflow Contract](../../../Contract/WORKFLOWS.md)。
