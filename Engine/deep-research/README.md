# Deep Research

Aexus 的独立研究 Engine，版本 `2.0.0`，公开 Contract `1.0.0`。
先进行初步调研，再生成团队与有向无环图（DAG）计划；执行期间可以补充问题、
调整计划并保留已完成工作的记录。人员数量、Manager 数量和研究分支由计划决定，
受用户设置的预算约束。

## 使用

在 Aexus 的 Engine library 选择并加载 Deep Research，填写研究问题即可开始。
原生 Agent 必须已经在 Infra 配置并就绪；研究任务使用该配置，可能产生模型费用。
Engine 不自行安装模型或配置服务商，也不能根据服务商名称证明使用了中转站额度。
首页明确显示执行引擎。已配置密钥的共享 Pi、共享 Cline 优先作为默认项；只有账号型引擎时需显式选择，自动组合多个引擎也需显式选择。实际模型和计费由所选引擎当前配置决定。

初步调研与规划期间显示不确定进度。计划确认后，同时显示 DAG 和当前计划的
加权任务完成比例。这个比例不是剩余时间预测，也不是来源数量除以来源预算；
增加任务或重规划时可以降低，全部完成并交付后才到 100%。

UI 默认自动执行生成的计划；高级设置勾选“关键节点由我确认”后等待用户确认。
API 未传 `autoApprove` 时默认需要确认计划。运行期间可暂停、补充要求、
继续或停止，也可检查具体任务、员工、计划版本、来源、矛盾和报告。
重规划保留相同任务的结果，归档被替代节点；已开始任务不能用同一 ID 改写。
完成后可从报告页选择“继续研究”，输入后续问题；新任务保留父研究链接，把旧报告作为历史背景，重新初调研、规划和独立核验来源。默认先确认新计划，原报告与员工记录保持不变。

## 公开接口

生产 UI、CLI 和运行时通过 `ContractClient` 使用现有 `workflow.*`、
`session.*` 与管理能力，不读取 Infra Store 或数据库。
接口与输入定义见 [engine.json](engine.json)、[Contract](../../Contract/README.md)
和 [工作流协议](../../Contract/WORKFLOWS.md)。

```js
import { createNodeClient } from '../../Contract/node-client.mjs';

const client = createNodeClient();
const job = await client.invoke('workflow.start', {
  engineId: 'deep-research',
  clientRequestId: 'research-request-001',
  input: {
    topic: '比较家用储能的成本、寿命与安全性，并引用原始资料',
    scope: 'comprehensive',
    engines: [{ engine: 'pi' }], // 使用已配置的原生 Pi 凭据与默认模型
    maxSources: 80,
    team: { maxWorkers: 12, maxManagers: 4, maxConcurrency: 4 }
  }
});
const current = await client.invoke('workflow.get', { id: job.id });
```

创建被接受不等于研究完成。修改请求使用最新 `expectedRevision` 与稳定的
`clientRequestId`；响应丢失时保留同一请求键。计划确认通过
`workflow.respond` 的 `answer: { action: 'approve-plan' }` 提交。
暂停、补充要求和恢复分别使用 `workflow.pause`、`workflow.amend`、
`workflow.resume`；具体参数遵循工作流协议。

CLI 是同一公开接口的可选客户端，从项目根目录运行：

```sh
node Engine/deep-research/cli.mjs --help
node Engine/deep-research/cli.mjs list
node Engine/deep-research/cli.mjs get --id WORKFLOW_ID
node Engine/deep-research/cli.mjs fork --id COMPLETED_ID --revision N --topic "哪些假设已经变化？" --request-id follow-up-001
node Engine/deep-research/cli.mjs download --id COMPLETED_ID --output report.html
```

`start --input @input.json --request-id KEY` 支持完整输入，执行时会调用配置的模型。
CLI `download` 当前下载第一个最终文件，按 UTF-8/base64 解码后校验字节数，
并拒绝覆盖已有文件。其他文件通过 UI 或 `workflow.file` 读取。

## 预算与证据

| 参数 | 默认值 | 范围 |
| --- | --- | --- |
| `maxSources` | 80 | 1-1000 |
| `team.maxWorkers` | 12 | 2-64，包含 Manager |
| `team.maxManagers` | 4 | 1-16 |
| `team.maxConcurrency` | 4 | 1-32 |
| `maxTasks` | 128 | 4-512 |
| `maxReplans` | 3 | 0-20 |

`quick` 未手动设置预算时，默认最多 6 个来源、4 名员工（其中 1 名 Manager）、2 项并发任务、16 个计划节点和 1 次重规划；其他范围沿用表中默认值。显式输入的预算始终优先。

这些是上限，不是必须创建的人员或必须搜集的来源数。`scope` 支持
`quick`、`comprehensive`、`deep`、`academic`，不承诺固定完成时间。
背景材料为 `materials: [{ name, content }]`，最多 10 份，每份最多 200,000
字符；当前没有本地 Office/PDF 上传解析接口。
可选的 `sourceUrls` 最多列 10 个公开页面，且不能超过来源预算。Engine 先预读
可见正文供初调研选择片段，随后重新独立读取并核对引用；指定网址之外的来源不会
进入证据和报告。预读不是引用证明，也不是原生员工网络工具的权限隔离。后续研究
只有再次填写 `sourceUrls` 才继续限定网址。

Agent 发现来源后，Engine 独立请求公开 HTTP(S) 原文，核对每个证据片段，
保存内容哈希、获取时间与最终 URL；HTML 页面的标题也取自实际正文。
Agent 自报的读取状态或标题不能代替独立读取证明。
同一 URL 上无法匹配的片段保留拒绝原因，不能借用其他片段的证明进入引用。
进度中的“已发现来源”保留候选 URL；“实读网站”只统计已经独立取得正文的域名，不把搜索结果当作实际网站覆盖。

支持公开 HTML、纯文本/JSON 和带文本层的 PDF。网页最多 4 MiB；PDF 最多
8 MiB、80 页、800,000 个提取字符，不支持 OCR 或加密 PDF。
无法读取、付费墙或未匹配来源保留状态与限制，不伪造成功读取。
精确片段匹配保证出处可追查；事实是否成立、来源是否可靠仍需要语义核验和审阅。

## 交付与架构

只有通过证据约束并完成最终审查后才发布文件：

- `research-report.html`：适配桌面、窄屏和打印的完整报告；章节引用可跳转到原文，来源附获取时间、最终网址、定位和 SHA-256。
- `research-report.md`：可编辑报告，保留同一来源的原文定位与读取证明。
- `sources.csv`：全部来源的读取、核验状态；独立取得的来源附最终网址、获取时间和 SHA-256。
- `evidence.json`：来源、论断、原文、矛盾与读取证明。
- `research-plan.json`：DAG、团队及计划修订记录。

当前没有原生 Word/PDF 导出或协作批注。
浏览器打印 HTML 不等于已实现原生 PDF 导出。

`Page.tsx`、图与阅读组件负责独立 UI；`model.mjs` 管理状态和控制；
`schema.mjs`、`graph.mjs` 校验团队/无环依赖并维护计划版本；
`agents.mjs` 复用原生员工与确切任务身份；`runtime.mjs` 执行就绪节点；
`source-read.mjs`、`source-pdf.mjs` 独立读取原文；`evidence.mjs` 建立证据约束；
`reports.mjs` 生成最终文件。checkpoint 与文件发布由 Host 托管，
新状态不重复保存最终文件正文。旧维度计划保留兼容迁移。

## 验证与边界

研发验证记录见 [独立审核](../../Infra/src/docs/DEEP_RESEARCH_REVIEW.zh-CN.md)
与 [对标研究](../../Infra/src/docs/DEEP_RESEARCH_BENCHMARK.zh-CN.md)。
领域、Host 恢复、独立原文、浏览器及实际打包验证各有不同证据范围。
确定性模型夹具、原文匹配、通过构建或成功安装均不能证明真实模型研究质量，
也不能证明优于官方网页端产品。

`STATUS.md`、`SUMMARY.md`、`SCHEMA_FIX_SUMMARY.md` 以及旧 `web/`、监控与调试
脚本记录先前实现，不是当前产品验收标准。旧 `web/server.mjs` 已退役，
启动会退出且不监听端口；使用 Aexus 的受授权 UI/Contract。项目使用 `GPL-3.0-only`；
第三方库保留各自许可证与声明。
