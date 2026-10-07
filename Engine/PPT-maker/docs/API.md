# PPT-maker API / Contract 1.0.0

所有Infra交互通过版本化 ContractClient。Engine专用操作封装在 `workflow.start/respond` 的领域输入中；不增加PPT专属Infra命令，也不直接调用模型服务。清单 `engine.json` 列出实际所需的18项公开能力。

## 1. 创建与查询

```js
const job = await client.invoke('workflow.start', {
  engineId: 'PPT-maker',
  clientRequestId: 'project-presentation-v1',
  input: {
    brief: '制作项目方案。只使用资料里的事实，说明实施步骤。',
    audience: '评审委员会',
    slideCount: 8,
    style: 'blueprint',
    ratio: '16:9',
    language: 'zh-CN',
    confirmOutline: true,
    engines: [{engine: 'pi'}],
    materials: [{name: 'facts.md', content: '这里填写实际原始资料。'}]
  }
});
const current = await client.invoke('workflow.get', {id: job.id});
```

输入：brief 0–6000字符（无模板/父快照时必填），audience最多300；slideCount 3–24，缺省8；style为executive/blueprint/editorial/midnight；ratio 16:9或4:3；language en或zh-CN；confirmOutline缺省true。engines可选1–4项，engine为codex/claude/cline/pi，model可选；省略时发现已就绪引擎，三个角色仍是独立员工。

资料最多8份，每份name<=160字符、content<=80000，合计160000字符。UI只读取TXT/MD/CSV，不静默调用模型解析其他格式。模型生成所需材料会交给用户选定的Infra原生引擎，遵守其模型服务配置。

上传模板：`template:{name:'brand.pptx',content:BASE64}`，4MiB以内PPTX/POTX。无brief时直接进入无模型编辑；有brief时由员工使用实际模板对象ID填充并审校，保留页数与主题。旧PPT、宏、加密与签名文件明确拒绝。

请求和父快照须适配通用workflow 8MiB上限。Base64不是文件路径，不允许Engine去读取用户未上传的客户端文件。

## 2. 阶段与领域摘要

运行态包括prepare/planning/writing/review/revising/export；用户等待态包括outline/edit。最终为completed，错误为failed，用户停止为cancelled。以外层 `status` 为准，不通过文字猜测执行结束。

`summary` 包含title、phase、outline、deck、deckRevision、quality、review、workers、tasks、attention、changes、parentId与exportInfo。界面轮询只读取状态，不确认用户已读，也不启动新工作。内部中间资料不列入files。

- `quality`：结构、坐标、文本容量及碰撞检查。
- `review`：独立员工对给定资料和文稿的审校；修改后标记stale。
- `attention`：原生审批需要处理时提供已有employeeId，用户可进入Infra。
- `tasks`：实际请求ID、员工ID、角色、状态与时间，不代替最终产物检查。

## 3. 确认大纲

读取最新工作流revision后：

```js
await client.invoke('workflow.respond', {
  id: job.id,
  expectedRevision: current.revision,
  clientRequestId: 'approve-outline-v1',
  answer: {action: 'approve-outline', outline: current.summary.outline}
});
```

outline为 `{title,slides:[{id,title,purpose}]}`。页数必须与请求一致；页面ID唯一且稳定。确认后，内容与视觉角色并行处理，再进行独立审校。

## 4. 编辑、审校与按页修改

在 `status:waiting, summary.phase:edit` 时操作。每次必须传当前外层revision及文稿deckRevision：

```js
await client.invoke('workflow.respond', {
  id: current.id,
  expectedRevision: current.revision,
  clientRequestId: 'save-edit-1',
  answer: {
    action: 'save',
    deckRevision: current.summary.deckRevision,
    deck: editedDeck
  }
});
```

`deck`只在有修改时发送；使用 `scene.mjs` 的validateDeck/reconcileEdits校验。生成文稿可编辑文字/图形/图片/表格/图表/备注与页序；模板采用声明的受限保真模式。未知对象、锁定对象、跨页修改和不支持字段被拒绝，不静默丢弃。

| action | 额外字段 | 结果 |
| --- | --- | --- |
| save | 可选deck | 保存用户修改，等待继续编辑 |
| ai-edit | slideId、instruction<=2000字符、可选deck | 只修订对应页面，再独立审校 |
| review | 可选deck | 保留文稿，重新独立审校 |
| export | 可选deck、confirmReview、acceptWarnings | 验证并生成唯一最终PPTX |

`ai-edit`使用当前真实元素ID。未指定页的对象保持不变。AI不擅自添加数据或把模板旧数字当作当前新事实。新增图表只能使用资料中找到的数值，审校继续检查语义；数值匹配并非完整事实证明。

## 5. 最终交付

```js
await client.invoke('workflow.respond', {
  id: current.id, expectedRevision: current.revision,
  clientRequestId: 'export-v1',
  answer: {action:'export', deckRevision:current.summary.deckRevision,
           confirmReview:true, acceptWarnings:true}
});
```

有结构错误时拒绝导出。审校为revise或已过期时，需要重新审校或用户明确人工确认；模板/版面警告需明确接受。UI只在用户导出对话框确认后传这些字段。

完成后 `files` 恰好1项，名称 `presentation.pptx`。演示标题写在文档属性和页面中；文件名遵守宿主ASCII限制。

```js
const done=await client.invoke('workflow.get',{id:current.id});
const file=await client.invoke('workflow.file',{id:done.id,name:done.files[0].name});
// file: {name,mediaType,description,encoding:'base64',content,bytes,sha256}
// 解码后检查实际bytes和SHA-256，再保存；原始JSON不能当PPTX写盘。
```

生成文字/形状/图片/表格/图表均为对应原生对象。图表包含可编辑数据工作簿。验证还检查所有内部关系目标和输出页数。

## 6. 完成后创建新修订

宿主禁止运行时递归workflow调用。UI与CLI先通过公开客户端读取授权父版本，再提交明确快照：

```js
import {prepareRevision} from './workflow.mjs';
const input=await prepareRevision(client,completedId);
const child=await client.invoke('workflow.start',{
  engineId:'PPT-maker',input,clientRequestId:'revision-2'
});
```

helper验证父工作流为已完成PPT-maker，读取scene；原生模板还读取最终PPTX。运行时重新检查文件SHA、页面身份和编辑约束，不读取Infra文件或父工作流私有状态。快照过大时明确拒绝。原版本文件不变。

parentSnapshot为 `{deck,revision,file?:{name,content,bytes,sha256}}`。parentId只是用户提交的来源标记，不用它提升权限。调用者已可提交任意自己拥有的PPTX，因此快照不宣称不可伪造的血缘证明。新修订先进入手动编辑，不自动创建新员工；后续明确请求AI修改时才配置自己的协作角色。

## 7. 恢复、取消与并发

failed状态用 `workflow.resume {id,expectedRevision,clientRequestId}`。传输/超时恢复跟踪已接收请求，不重建员工，不盲目生成新请求；不支持的文件/不合格资料需要修正输入或另建工作。格式错误最多增加一轮格式修正，持续不合格则明确失败。

取消使用 `workflow.cancel {id}`。只有匹配本工作流messageId的当前任务才发送 `session.interrupt {employee,expectedMessageId}`；不会中断该员工正在处理的另一项工作。不确定取消会返回真实说明。

保存使用两层修订保护。冲突时UI保留草稿，让用户明确重新加载；不会自动覆盖另一窗口。浏览器IndexedDB草稿按写入顺序串行，切换引擎/文稿前尝试刷入；浏览器被强制关闭或存储不可用不保证最后一次按键已落盘，重要修改应点击保存到Core。

## 8. 本地文档工具

无需模型或运行Core：

```sh
node cli.mjs inspect --file source.pptx --output scene.json
node cli.mjs check --input @scene.json
node cli.mjs render --input @generated-scene.json --output final.pptx
node cli.mjs patch --template source.pptx --input @edited-scene.json --output revised.pptx
node cli.mjs validate --file final.pptx
```

`inspect`提取编辑预览模型；`check`发现阻断问题时退出码2；render只接受generated；patch只接受原生模板与对应scene；所有文件输出排他创建，已有文件拒绝覆盖。模板scene中的未支持结构只读，原包仍保留。
