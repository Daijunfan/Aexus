# Deep Research 1.2.0

一句话立项，三轮意见确认，多 Coding Agent 独立搜证与交叉审查。仅在证据和最终报告通过检查后发布交付文件。

## 使用

在 Aexus 顶部选择 Engine，再打开 Deep Research。输入调研任务，点击开始。没有额外配置时，自动检测并选择两种已经就绪的 Coding Agent；也可展开引擎选择，指定 Codex、Claude、Cline、Pi 中的两至四种。模型沿用对应配置，不自动安装软件、注册服务或提高权限。

第一轮确认目标、范围和优先级；第二轮确认研究主编针对任务制定的方案；第三轮根据初步证据确认最终重点。每轮都可直接采用建议。确认第一轮后会启动原生研究员工，正常模型使用可能产生对应服务的费用。需要原生工具权限时，界面提供进入 Infra 审批的入口。

Core 在后台执行任务，页面关闭、刷新、切换 Engine/Infra 不影响任务运行。Core 重启会恢复持久检查点；被中断且没有完整结果的原生任务显示失败，用户明确重试后继续，不把已发送消息当作研究完成。

## 研究控制与工作台

入口提供三档预算：标准（至少 4 来源 / 2 网站 / 3 发现）、深入（8 / 3 / 6）、广泛（12 / 4 / 8）。每档仍要求至少两类引擎贡献，补证轮次和每任务时限有界。数量只控制覆盖要求，不保证报告正确，也不等同于固定完成时间。

可限制允许的网站、设置优先/排除域名、添加最多 12 个起始链接。核验过程对请求与每次重定向硬性执行允许/排除规则；优先域名属于搜索偏好。原生模型浏览遵循任务指令，独立核验的访问限制不能替代第三方模型的网络沙箱。域名过窄导致证据不足时不会自动放开限制。

最多上传六份 TXT、Markdown、CSV、JSON 参考材料，单份最多 80,000 字符、总计 200,000 字符。确认第一轮目标后才把背景发送给所选模型。它们不计为已独立核验来源，公共工作流投影只展示文件名与字符数。此入口不支持 PDF 解析或云端连接器。

工作台显示阶段/实际步骤进度、来源核验计数和各 Agent 的原生任务状态，可搜索来源、筛选一手/二手材料、查看摘录、引用、指纹与时间戳，追踪审查分歧、证据缺口和用户修订。百分比不表示置信度或预计剩余时间。

研究中可「暂停并调整」；保存修订后点击「继续研究」。暂停只中断属于本研究的确切原生消息，保留已完成步骤和员工身份。新要求会重新制定方案并审查，旧草稿不沿用。暂停在 Core 重启后仍保持暂停；清理未完成时需重试暂停，不能直接恢复。CLI 的 `amend` 另支持 `sourcePolicy` 和 `depth` 修订。

协作图以已持久化任务展示主编、并行研究路线、共享证据池、证据审查和报告审查。每位研究员完成后立即入库已核验摘录，不必等待最慢的研究员；质量门槛与后台交付检查共用同一计算。域名卡片可回查来源，网站数量不等于相互独立的原始证据。

同一网页的不同摘录逐条重新核验，贡献仅记给提交该条有效摘录的引擎和研究员。引用未通过该研究员本次核验的发现会被拦截。失败重试只重发失败步骤；已完成并行步骤保留。发送结果不确定时保留原请求编号核对，避免重复派发。

## 最终交付

| 文件 | 内容 |
| --- | --- |
| `research-report.html` | 无外部资源依赖的交互报告：摘要、研究正文、对照矩阵、反证、证据分布、结论与来源对应、来源检索；支持浏览器打印。 |
| `research-report.md` | 完整可编辑报告，保留引用、建议和限制。 |
| `evidence.csv` | 最终证据表，每条已核验摘录一行，包含网址、访问时间、对应页面 SHA-256、引用章节、摘录编号和贡献引擎/研究员。 |

下载全部时，ZIP 内仅有上述三个文件，没有 README、执行日志、任务 JSON、草稿、抓取缓存或零散图片。失败、暂停、取消、等待确认期间没有可下载的中间报告。CLI 不覆盖已有输出目录。PDF 不作为自动生成的交付文件；HTML 可通过打印另存 PDF。

## 协作与检查

研究主编负责方案与审查，证据研究员和反证研究员使用不同 Coding Agent 并行研究。选择四种引擎时增加一位专题研究员。各阶段通过原员工会话、真实任务 ID 和原生接收回执关联，不创建第二套聊天或员工数据库。

研究员必须实际访问来源；引擎会独立重新读取公开页面，核对短摘录并记录指纹。标准档至少需要四个有效来源、两个网站、两类引擎的来源贡献和三条有引用的发现，深入与广泛档使用更高预算。数量门槛只代表基础覆盖，不能证明结论正确。来源类型由研究员分类；发布日期未独立核验。当前独立摘录核验支持公开 HTML、纯文本和 JSON，PDF、登录墙或无法访问的页面需要提供可读的对应原始网页。

独立主编检查证据与结论、反例和适用范围；阻断问题触发补证，最终报告再单独审查。结构错误可进行一次针对性修正。所有报告段落必须绑定已核验的来源 ID；不存在的引用、空结果、未通过审查的内容会阻止交付。模型审查仍可能出错，报告保留限定条件，不能把这套机制视为事实绝对正确的保证。

来源访问拒绝私网、回环、受限端口、带凭据的网址，并在实际 DNS 查询和每次重定向后检查目标。外部材料始终作为数据；不得按其中的指令改变任务或权限。HTML 对模型内容进行转义，CSV 防止单元格公式执行。

## CLI

交互使用会逐轮询问意见：

```sh
node Engine/deep-research/cli.mjs start --topic "调研任务" --out ./research-final
```

自动化客户端使用同一 Contract；`--defaults` 明确授权采用每轮建议，普通 `--wait` 在需要意见时返回问题：

```sh
node Engine/deep-research/cli.mjs start --topic "调研任务" --engines codex,claude --json
node Engine/deep-research/cli.mjs start --topic "调研任务" --depth deep --source-policy '{"preferredDomains":["arxiv.org"],"excludedDomains":[],"seedUrls":[]}' --materials @references.json --json
node Engine/deep-research/cli.mjs status WORKFLOW_ID --json
node Engine/deep-research/cli.mjs answer WORKFLOW_ID --answer '{"values":{"decision":"研究目的"},"note":"补充要求"}' --json
node Engine/deep-research/cli.mjs pause WORKFLOW_ID --json
node Engine/deep-research/cli.mjs amend WORKFLOW_ID --update '{"note":"聚焦复现和失败边界"}' --request-id revision-001 --json
node Engine/deep-research/cli.mjs resume WORKFLOW_ID --wait --json
node Engine/deep-research/cli.mjs export WORKFLOW_ID --out ./research-final --json
node Engine/deep-research/cli.mjs cancel WORKFLOW_ID --json
```

执行脚本应保存返回的 workflow ID；发送创建/回答/恢复请求时可通过 `--request-id` 保留幂等标识。超时或响应丢失时应先查同一个任务，不能盲目创建另一份研究。

## 代码边界

`policy.mjs` 定义研究深度、来源范围和参考材料约束；`model.mjs` 定义研究状态和检查规则；`agents.mjs` 管理基于 Contract 的原生任务；`sources.mjs` 安全读取公开来源，`evidence.mjs` 逐摘录核验与归属，`insights.mjs` 共享质量门槛与协作投影；`runtime.mjs` 组织各阶段；`report.mjs` 生成最终报告；`delivery.mjs` 打包最终文件；`Page.tsx` 和 `cli.mjs` 提供两种入口。

1.2.0 明确支持持久化 1.0.0、1.1.0 检查点；其他版本需要单独验证和兼容声明。`references.json` 为 `[{"name":"brief.md","text":"用户背景"}]`，没有隐式读取整个目录的能力。

所有领域逻辑留在本目录。后台运行、检查点、确认、恢复、取消、原子交付和文件读取由通用 `workflow.*` 提供。详见 [Workflow Contract](../../Contract/WORKFLOWS.md)。

## 验证

```sh
npm run test:deep-research
node Infra/src/test/deep-research-ui-test.mjs
node Infra/src/test/deep-research-ui-test.mjs --desktop
```

测试使用临时 Core、独立构建、隐藏 Electron/无头 Chrome、确定性原生协议与合成资料，不读取生产工作区或调用收费模型。报告位于 `.aexus/artifacts/deep-research/`，与最终用户交付目录分离。确定性验收证明协议、流程和界面行为，不代替真实主题的研究质量评估。
