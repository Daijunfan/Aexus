# MiniNotion Agent 工作流（1.21.0）

## 安装与发现

Agents Company 0.50.11 内置 MiniNotion 1.21.0。Work 员工正常任务上下文会给出其实际 CLI 启动器、工作目录和 `.agents-company/plugins/mininotion/API.md`。Employee 不执行隐藏模型初始化；Build 员工保持原上下文行为。

以运行中的 `agents plugin describe mininotion --json`、员工 `mininotion status` 为准。源码构建或 `dist-plugin` 目录的版本不等于安装版。完整命令 schema 与分发给员工的 API.md 来自同一构建。

## 页面与物理目录

每个页面对应自己的文件夹和 index.mininotion.json。主页面仅对应 fs.info.collectionRoot 下的直接子文件夹；每多一层目录就多一层子页面。Team 和员工目录也遵守此规则，不能在全局视图中跳过中间目录。详细文件树与命令见 MININOTION_WORKSPACES.md。

先用 fs.bind 把员工当前目录作为已有页面，再以返回的 pageId 创建子页面。page.create 自动创建子文件夹，page.move 实际移动目录树。普通文件只在所属页面的文件区预览。所有修改完成后调用 fs.audit，valid 必须为 true。

## 最短操作链

1. `mininotion guide`，再按需要读取 `guide pages`、`guide blocks`、`guide databases`、`guide delegation`、`guide verify`。
2. `page.create --title '技术分析' --color white` 获取真实 id。对子页面传 `--parent-id ID`；后代继续引用父页面 ID。
3. `page.write-markdown PAGE_ID --data @request.json` 写入原生富文本。请求对象包含 markdown、mode（replace/append）、可选 expectedHash。此接口支持标题、列表、代码和表格，不需要 Agent 自行编写转换器。
4. 修改既有内容前 `page.read-markdown PAGE_ID` 获取 hash，提交 expectedHash；冲突时重新读取合并。Markdown 是可读投影，复杂原生块仍使用 block.* 编辑。
5. `schema block.append --compact` 查看完整块字段与例子；`block.validate --data @blocks.json` 只校验，不写页面。
6. 用 `fs.audit`、`page.audit ROOT_ID`、`fs.path --page-id ROOT_ID` 与数据库 `view.render` 回读验收。返回任务 messageId、生成脚本或落地一个 Markdown 文件均不代表原生页面已完成。

通用 JSON 入口为 `mininotion api METHOD --data @request.json`，也支持 `--data -` 从 stdin 读取。绑定启动器已传入 --workspace，不能覆盖。不要用截断管道吞掉非零退出码。`block.update` 的结构化正文修改使用 `changes.content`；`text` 是便捷字符串入口。

## 数据库与真实视图

`database.create`、`record.create`、`view.create` 分别返回数据库、记录和视图 ID。先 `property.list DATABASE_ID` 确认属性和选项，再填写 records.values。创建同一数据库的 table、board、gallery、list、calendar、chart 视图，无需复制数据库。

看板分组使用 `groupBy`；图表分组使用 `chartGroup`（不能混用），配合 chartType 和 chartAggregation。日历使用 `calendarBy` 指向实际 date 属性；记录必须有日期。验收日历要核对 view.render.unscheduled 和 days.records，图表要核对 series，而不只看视图按钮存在。

正文嵌入数据库使用 `database.embed`。重命名页面不会移动其主页面目录；员工绑定使用 fs.path.absoluteDirectory。

## 子 Agent 协作

Manager 使用宿主 `agents session send --employee ID` 调度已注册员工。先查看现有员工和引擎能力；当前 Work 使用支持该模式的 Claude/Codex，不把不支持 Work 的引擎静默替换或放宽权限。

可让员工绑定主页面内的子目录并在其目录使用 fs.bind；也可复用兄弟目录中的分析员工，由其返回有源码证据的技术分析，再由 Manager 写入自己的原生子页面。不要让兄弟员工通过覆盖 workspace 写父目录。

逐项等待 status/transcript/follow 的实际完成结果。技术分析需含源码路径、关键函数、调用链、数据模型、错误路径、测试依据、权衡和未验证事项；静态分析不能冒充运行测试。

## 格式兼容与失败处理

1.19.1 修复 js/ts/bash 等代码语言别名、未知语言的纯文本回退以及正文中 asset:// 字面量被误当作附件的问题。未知语言名保留在 originalLanguage，不宣称渲染 Mermaid 等额外图形语言。

1.19.2 补齐旧表格缺少 tableContent 类型、行内文本缺省 styles 的规范化，避免已被 CLI 接受的旧数据让整个界面无法显示。标准写入仍使用完整 schema；错误数据不会通过清空用户文档处理。

## 验收入口

`npm run test:mininotion` 执行真实 Node 后端/CLI 与宿主集成；`npm run test:mininotion-ui` 包括富文本写入、旧数据兼容和窗口回读。`test/mininotion-authoring-ui-test.mjs` 支持指定实际安装应用，使用隔离数据和隐藏窗口。

真实任务验收 `test/mininotion-live-delivery-verify.mjs` 为显式 opt-in，要求 MININOTION_VERIFY_REAL_DELIVERY=1 和本地 MININOTION_DELIVERY_CONFIG。配置提供 rootId、employeeIds、startedAt、baselinePath；不把生产员工 ID 嵌入源码。它检查原页面保留、正文、递归深度、所有技术页面的实际渲染、记录、日期、图表及员工完成回执。
