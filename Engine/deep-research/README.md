# Deep Research 1.5.0

多 Coding Agent 独立搜证、反证与交叉审查。用户控制研究目标、方案、来源范围和最终重点；通过核验后交付可追溯报告。

## 工作流

输入问题后先确认目标，再选择已经配置且就绪的 Codex、Claude、Cline、Pi 中至少两种引擎。默认自动匹配两种；不安装原生引擎、不切换未授权服务、不提高权限。研究主编负责方案及独立审查，证据研究员和反证研究员并行研究，第四种引擎可承担专题路线。员工、团队、任务编号及原生会话均复用 Infra。不同适配器不必然等于不同模型提供商，模型配置和来源贡献分别显示。

三轮确认分别控制目标、方案和报告重点。方案可编辑；研究中可暂停并调整要求、网站或深度，再明确继续。暂停只处理本研究持有回执的确切任务，等待审批回合结束；丢失回执需先恢复编号。未完成清理时不能直接继续。成功步骤与身份保留，修订使旧报告失效。

Core 持久保存进度；刷新、离开页面、切换 Engine/Infra 不取消研究。阶段进度、真实完成步骤、来源核验、各 Agent 的贡献、路线覆盖、缺口和分歧均可查看。百分比不代表置信度或预计剩余时间。原生调用仍可能需要用户在 Infra 审批；确认目标后使用已配置模型可能产生对应费用。

## 研究范围与材料

标准、深入、广泛三档分别要求至少 4/8/12 个核验来源、2/3/4 个网站、3/6/8 条有引证发现，并要求两类引擎的有效贡献。门槛只代表基础覆盖，不能证明结论正确。补证轮次与每任务时限有上限。

支持允许、优先、排除域名及最多十二个起始链接。独立核验会在请求、DNS 和每次重定向检查公开地址及域名范围。原生模型浏览还须遵循任务指令，不能把此核验规则说成第三方工具的网络沙箱。证据不足时不会自动放宽来源限制。

可明确选择 TXT、Markdown、CSV、JSON、PDF、DOCX、XLSX、PPTX；文档字节在 Core 主机提取。单次上传原始文件合计最多 4 MiB、最多六份；单份提取文字最多 80,000 字符，总量最多 200,000 字符。较长材料明确显示截断标记。PDF 最多 200 页、XLSX 最多 30 个工作表/12,000 行、PPTX 最多 200 页；ZIP 解压、解析线程资源和执行时间均有上限。

PDF 仅提取文本层，不做 OCR；Office 提取文字、表格和已有单元格结果，不运行宏、公式或外部连接。图片、复杂图表和版面未被理解时保留明确限制。背景材料不计入独立核验来源，只有确认目标后才发送给已选研究模型；公共状态不暴露正文。入口尚未实现云盘/Gmail/Notion 的授权检索。

## 来源核验

每个 URL/摘录组合单独重新读取并核对完整提交内容，再保存短展示摘录、原始页面 SHA-256、时间和真实 Agent 贡献。找到一个有效前缀不能使虚构尾句通过，也不能把另一研究员仅提交同一 URL 算为贡献。发现只可引用其本次提交中实际通过的证据。

独立读取支持公开 HTML、文本、JSON 和带文本层的 PDF（最多 4 MiB）。PDF 可记录匹配页码；没有文本层、受限页面或访问失败不冒充已读取。私网、回环、带凭据网址、受限端口和重定向绕过均拒绝。来源类型由研究员分类，报告日期未独立核实；网页匹配与模型审查不等于事实正确性保证。

外部网页、文档和引用始终作为资料，不能通过其中的指令改变权限或派发任务。HTML 转义模型内容，CSV 防止公式执行。最终报告的段落必须绑定已核验来源，区分事实与分析；独立证据审查与最终报告审查均通过后才出现下载区。

## 交付与后续研究

原交付保持三件：`research-report.html`（自包含可视化报告）、`research-report.md`（可编辑正文）、`evidence.csv`（摘录、网址、指纹和引用章节）。默认 ZIP 仅包含这三件，不夹带日志、草稿、抓取缓存或任务 JSON。

审查通过后可另存 `research-report.docx`、`research-report.pdf`，无需再次调用模型。Word 保留目录、正文、对照表、可点击引用与来源；PDF 提供分页、页码、证据分布和链接。客户端及 CLI 解码后核对字节数与 SHA-256，原报告修订号及三件套保持不变。PDF 使用运行主机已有字体；缺字则明确失败，不输出乱码；可设置主机环境 `AEXUS_REPORT_FONT`/`AEXUS_REPORT_FONT_FAMILY` 指定合法可用字体，字体不随源码分发。

报告底部可建立后续研究。新工作流由 Core 记录父报告 ID 和版本，创建新的原生研究员工并重新核对来源，不覆盖原件。历史摘要仅作待检验背景；私人材料仅在明确勾选后复用。

## CLI

```sh
npm --prefix Engine/deep-research ci --omit=dev --ignore-scripts
node Engine/deep-research/cli.mjs start --topic "调研任务" --depth deep --engines codex,claude --json
node Engine/deep-research/cli.mjs prepare --attachments '["/explicit/path/brief.pdf"]' --json
node Engine/deep-research/cli.mjs start --topic "调研任务" --attachments '["/explicit/path/brief.docx"]' --json
node Engine/deep-research/cli.mjs status WORKFLOW_ID --json
node Engine/deep-research/cli.mjs answer WORKFLOW_ID --answer '{"values":{},"note":"补充要求"}' --json
node Engine/deep-research/cli.mjs pause WORKFLOW_ID --json
node Engine/deep-research/cli.mjs amend WORKFLOW_ID --update '{"note":"重点核对反例"}' --request-id revision-001 --json
node Engine/deep-research/cli.mjs resume WORKFLOW_ID --wait --json
node Engine/deep-research/cli.mjs export WORKFLOW_ID --out ./final-originals --json
node Engine/deep-research/cli.mjs export WORKFLOW_ID --format all --out ./final-formats --json
node Engine/deep-research/cli.mjs fork WORKFLOW_ID --topic "继续核对成本与最新反例" --request-id follow-up-001 --json
```

输出目录必须不存在。`--format pdf|docx|all` 选择额外格式，省略时保留原三件套。`--attachments` 只读取明确给出的文件，不能递归扫描目录。`--defaults` 明确授权逐轮采用建议；普通 `--wait` 在非交互场景等待用户回答。自动化客户端保留任务 ID 与 `--request-id`，响应丢失先查询原请求，不能盲目重建。

## 开发与验收

领域逻辑留在本 Engine；持久工作流、身份、权限、控制、原子交付、文档钩子与父子关系由通用 [Workflow Contract](../../Contract/WORKFLOWS.md) 提供。1.5.0 显式兼容 1.0.0、1.1.0、1.2.0、1.3.0 的检查点，不隐式迁移其他版本。

```sh
npm run build:engines
npm run test:deep-research
npm run test:deep-research-ui
npm run test:deep-research-desktop
```

测试使用独立数据目录、确定性原生协议、隐藏桌面/无头浏览器和真实文档二进制。验收产物在 `.aexus/artifacts/`。通过流程与格式测试不代表已评估真实主题质量、商业连接器或所有操作系统。
