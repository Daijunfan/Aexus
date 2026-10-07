# Deep Research

一句话立项，三轮意见确认，多 Coding Agent 独立搜证与交叉审查。仅在证据和最终报告通过检查后发布交付文件。

## 使用

在 Aexus 顶部选择 Engine，再打开 Deep Research。输入调研任务，点击开始。没有额外配置时，自动检测并选择两种已经就绪的 Coding Agent；也可展开引擎选择，指定 Codex、Claude、Cline、Pi 中的两至四种。模型沿用对应配置，不自动安装软件、注册服务或提高权限。

第一轮确认目标、范围和优先级；第二轮确认研究主编针对任务制定的方案；第三轮根据初步证据确认最终重点。每轮都可直接采用建议。确认第一轮后会启动原生研究员工，正常模型使用可能产生对应服务的费用。需要原生工具权限时，界面提供进入 Infra 审批的入口。

Core 在后台执行任务，页面关闭、刷新、切换 Engine/Infra 不影响任务运行。Core 重启会恢复持久检查点；被中断且没有完整结果的原生任务显示失败，用户明确重试后继续，不把已发送消息当作研究完成。

## 最终交付

| 文件 | 内容 |
| --- | --- |
| `research-report.html` | 无外部资源依赖的交互报告：摘要、研究正文、对照矩阵、反证、证据分布、结论与来源对应、来源检索；支持浏览器打印。 |
| `research-report.md` | 完整可编辑报告，保留引用、建议和限制。 |
| `evidence.csv` | 最终证据表，包含网址、短摘录、访问时间、页面 SHA-256 及引用章节。 |

下载全部时，ZIP 内仅有上述三个文件，没有 README、执行日志、任务 JSON、草稿、抓取缓存或零散图片。失败、取消、等待确认期间没有可下载的中间报告。CLI 不覆盖已有输出目录。PDF 不作为自动生成的交付文件；HTML 可通过打印另存 PDF。

## 协作与检查

研究主编负责方案与审查，证据研究员和反证研究员使用不同 Coding Agent 并行研究。选择四种引擎时增加一位专题研究员。各阶段通过原员工会话、真实任务 ID 和原生接收回执关联，不创建第二套聊天或员工数据库。

研究员必须实际访问来源；引擎会独立重新读取公开页面，核对短摘录并记录指纹。至少需要四个有效来源、两个网站、两类引擎的来源贡献和三条有引用的发现。数量门槛只代表基础覆盖，不能证明结论正确。来源类型由研究员分类；发布日期未独立核验。当前独立摘录核验支持公开 HTML、纯文本和 JSON，PDF、登录墙或无法访问的页面需要提供可读的对应原始网页。

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
node Engine/deep-research/cli.mjs status WORKFLOW_ID --json
node Engine/deep-research/cli.mjs answer WORKFLOW_ID --answer '{"values":{"decision":"研究目的"},"note":"补充要求"}' --json
node Engine/deep-research/cli.mjs resume WORKFLOW_ID --wait --json
node Engine/deep-research/cli.mjs export WORKFLOW_ID --out ./research-final --json
node Engine/deep-research/cli.mjs cancel WORKFLOW_ID --json
```

执行脚本应保存返回的 workflow ID；发送创建/回答/恢复请求时可通过 `--request-id` 保留幂等标识。超时或响应丢失时应先查同一个任务，不能盲目创建另一份研究。

## 代码边界

`model.mjs` 定义研究状态和检查规则；`agents.mjs` 管理基于 Contract 的原生任务；`sources.mjs` 独立核对来源；`runtime.mjs` 组织各阶段；`report.mjs` 生成最终报告；`delivery.mjs` 打包最终文件；`Page.tsx` 和 `cli.mjs` 提供两种入口。

所有领域逻辑留在本目录。后台运行、检查点、确认、恢复、取消、原子交付和文件读取由通用 `workflow.*` 提供。详见 [Workflow Contract](../../Contract/WORKFLOWS.md)。

## 验证

```sh
node Infra/src/test/deep-research-unit-test.mjs
node Infra/src/test/deep-research-core-test.mjs
node Infra/src/test/deep-research-ui-test.mjs
node Infra/src/test/deep-research-ui-test.mjs --desktop
```

测试使用临时 Core、独立构建、隐藏 Electron/无头 Chrome、确定性原生协议与合成资料，不读取生产工作区或调用收费模型。报告位于 `.aexus/artifacts/deep-research/`，与最终用户交付目录分离。确定性验收证明协议、流程和界面行为，不代替真实主题的研究质量评估。
