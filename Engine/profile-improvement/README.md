# Profile Improvement

简历优化引擎。上传一份 **.docx Word 原稿**，填写一至三个目标岗位；团队分别核查事实、分析岗位、优化和独立审校，按岗位交付保留原模板的 Word 文件。界面在 Aexus 的 Engine 目录自动发现，入口 `Page.tsx`。

## 安装与运行

```sh
npm --prefix Engine/profile-improvement ci
node Engine/profile-improvement/cli.mjs doctor
node Engine/profile-improvement/cli.mjs run --resume ./resume.docx \
  --targets '后端开发；测试开发' --output ./final
```

只需要一个已在 Infra 配置并就绪的 Coding Agent，默认按 Pi、Cline、Codex、Claude Code 顺序选取首个就绪引擎。也可明确指定 `--engine` 和 `--model`；启动后固定该选择，失败不悄悄更换服务商。开始任务会通过公开 Contract 创建独立 Team 和三位 Employee，并调用所选模型，可能产生模型费用。用户可以在 Infra 查看这三位员工。

**版式验收环境：**运行 Core 的主机必须安装 LibreOffice 和 Poppler 的 `pdftotext`。支持通过 `PROFILE_IMPROVEMENT_SOFFICE`、`PROFILE_IMPROVEMENT_PDFTOTEXT` 指定可执行文件。缺少工具时会先报告环境问题，不开始模型任务。不自动安装或改变用户系统配置。

UI 默认只有上传与岗位两个必填项，岗位说明和引擎选择收在可选设置中。任务持久化由 Infra 管理，切换页面不停止；历史任务可重新打开、失败后继续、明确停止、预览和下载。

## 输入与事实约束

接收不超过 4 MiB、正文不超过 30,000 字符的可编辑 DOCX。PDF、截图、旧版 `.doc`、加密文档、宏、外部嵌入内容以及未接受的 Word 修订不做静默转换；需要原稿或先在 Word 保存成普通 DOCX。保留图片、页眉页脚、表格、链接、样式、节与段落结构。

分析只使用原简历和用户提供的目标/JD。不搜索求职者、不推断敏感属性、不代表用户投递职位。没有 JD 时明确说明岗位要求属于一般性分析。能力缺口只显示为待补充建议，不能写成已具备。原数字、量化结果、日期和受保护字段不能被修改；检测到的姓名与联系方式（含分段或链接形式）不进入模型输入，其他经历仍会发送给用户选择的模型服务；岗位分析和每项改写必须引用原文文字位置。模型审校可以发现语义问题，但不承诺消除所有模型错误，用户仍应审阅最终表述。

## Word 保真方式

`document.mjs` 解析 OOXML，生成稳定的段落/文字槽 ID；编辑员只提出已有 `w:t` 文本的替换。执行器在原 `word/document.xml` 的文字字节范围内修订。除文本内容外，XML 标记、Run 字体/字号/加粗、段落、表格、图片与链接均保持。其他 ZIP 内部文件解压后的字节逐一验证不变，不重新套模板。

文字改写可能影响自动换行。因此 `layout.mjs` 使用同一 LibreOffice 渲染原稿和优化稿，再通过 Poppler 对照页数、页面尺寸、每页文字行数和行的垂直位置，同时核对改写内容完整呈现。失败会把问题返回编辑员；最多三轮，仍失败就不交付该任务的中间稿。不会缩小字号、压缩行距或删页来通过。

这一验收保证的是原模板结构和指定渲染环境的一致性，不能保证缺少原字体的另一台电脑或所有 Word 版本逐像素相同。浏览器的 docx-preview 是阅读预览，不替代 Word 验收；它运行于禁止脚本/网络的独立 iframe，并禁用外部 HTML 嵌入。

## 多 Agent 流程

1. 核查员提取可定位事实及额外受保护字段；岗位分析员并行分析全部目标。
2. 编辑员基于原稿，为每个目标独立提出定向修订；后一版本不叠加前一岗位的修改。
3. 核查员审校证据、职责强度、数字和技能是否真实，存在阻断问题时返回修改。
4. Engine 本地执行文字补丁、结构校验与实际版式校验，只把完成版本交给 Infra 最终文件接口。

员工调用只经 `ContractClient.invoke`。模板处理使用 Engine 自己的依赖和 OS 临时目录；不读取/导入 Infra Store、数据库、组件、私有 IPC 或另一个 Engine。既有深度研究、Plan、频道及其他员工不被修改。临时渲染文件会清理；原上传文件不覆盖。任务和员工记录在 Infra 中保留以支持恢复，不声称“零数据留存”。

## 恢复与取消

任务、员工身份、提示词、调用幂等键及已完成阶段保存在 workflow checkpoint。发送响应丢失后使用同一键确认，不创建第二个任务；员工创建响应丢失时通过公开role与任务唯一身份找回，显示名称变更可恢复，身份/引擎/职权被替换则停止；已经完成的岗位不重复处理。超时只增加等待，明确无结果/无效结果的人工重试才创建新尝试。格式修复至多一次，事实/版式修订每次执行至多三轮，避免无限循环。

取消会逐员工确认；发送响应丢失时先用公开原消息核对确切ID。只对本工作流记录的员工和确切消息 ID 发出 `session.interrupt`；当前员工已在执行不相干任务时不打断它。CLI Ctrl+C 只结束等待，持久任务需显式 `cancel`。

## 文件与依赖

- `engine.json`：输入、输出与所需公开能力。
- `Page.tsx` / `Preview.tsx` / `style.css`：独立 UI。
- `runtime.mjs` / `model.mjs` / `agents.mjs`：领域状态、证据规则、公开API协作。
- `document.mjs` / `layout.mjs`：原 Word 补丁与版式检查。
- `workflow.mjs` / `cli.mjs`：UI/CLI共享提交与文件校验。
- `test/`：纯领域、真实文档、公开CLI黑盒和界面测试。

依赖仅安装在本 Engine：fflate 0.8.3、@xmldom/xmldom 0.9.12、docx-preview 0.4.1。宿主构建/打包时必须包括该 Engine 的运行依赖，或将其独立打包；不要通过导入宿主内部安装目录取得依赖。参考 `THIRD_PARTY.md`。

## 验证

```sh
npm --prefix Engine/profile-improvement test
npm --prefix Engine/profile-improvement run test:layout
npm --prefix Engine/profile-improvement run test:infra
npm --prefix Engine/profile-improvement run test:ui
```

领域测试使用确定性 Contract 替身，覆盖创建/发送丢响应、身份被替换、精确取消、修复缓存和输入完整性。排版测试包括真实中英文两页模板、表格、图片、页眉页脚、列表及超页拒绝。集成测试通过项目公开 build/CLI 启动临时 Core，真实 Pi 原生程序通过本地 OpenAI-compatible 模型夹具完成初始化、工具调用和结构化结果，不调用付费模型供应商、不读写正式用户数据，不在 Engine 导入 Infra 测试夹具或实现。

默认集成测试构建所有 Engine。并行开发中可用 `PROFILE_TEST_ENGINES=workspace-audit,deep-research,profile-improvement` 在测试快照选择待验收引擎；不会改源目录，测试报告必须明确未覆盖的 Engine。`PROFILE_TEST_APPLICATION` 可复用事先构建好的临时应用，避免重建共享输出。
