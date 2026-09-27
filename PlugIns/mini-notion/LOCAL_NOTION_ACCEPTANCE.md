# MiniNotion · 本地体验验收

范围：Agents Company 内的 `PlugIns/mini-notion`。使用现有 Node Core、独立 CLI、宿主 `plugin.call` 与同一写入服务；本轮不扩展联网、协作、导出或备份功能。

## 完成的改进

- 图标选择器提供表情符号、图标、上传三个页签；1,703 个 Lucide 矢量图标、十种明暗自适应颜色、3,781 个 Unicode 16.0 emoji、中英文搜索、分类、随机选择、方向键导航和本地图片上传。
- 页面、侧栏、面包屑、搜索、数据库记录、表单、预览和提示块共用图标渲染器。旧 emoji 字符串保留；复杂肤色／组合 emoji 不被截断。
- 图标数据沿用 `icon` 和提示块 `props.emoji`，增加 `icon:<name>:<color>` 格式；`schema` 可发现全量名称与配色。错误编码返回 `INVALID_ICON`，不改变已保存内容。
- 提示块复用同一图标选择器；正文支持 `:fire` 等搜索插入 emoji。
- 正文、块背景与预览使用一致的明暗色板，保留既有页面颜色标记。封面新增九种纯色，页面图标跨封面边缘排列。
- 修复宿主环境因误判原生菜单而跳过快捷键的问题：新建、搜索、页面内查找、侧栏、主题、历史导航复用已有操作。
- 修复本地封面图片经宿主 URL 转换后不显示的问题。
- 修复块菜单组件身份不稳定、更新时重新挂载而关闭的问题；增加复制块、转换类型、搜索目标页面后移动块，分别调用已有 `block.duplicate`、`block.update`、`block.move`。

## 验证方式

```sh
npm --prefix PlugIns/mini-notion run typecheck
npm --prefix PlugIns/mini-notion run test:local
npm run docs:managers
npm run test:coverage
npm run build:plugins
npm run build
npm --prefix PlugIns/mini-notion run test:local-ui
```

`test:local` 使用临时文件夹与真实 CLI 子进程验证字段持久化、全部十色、图标目录完整性、非法编码拒绝、图片、复制与移动、服务重启回读。包含原有文件夹读写、冲突、回收站与目录边界回归。

`test:local-ui` 在隔离 `AGENTS_COMPANY_HOME` / 工作目录与隐藏 Electron 窗口中打开真实宿主插件，逐项操作后通过 CLI 回读。覆盖图标／emoji／图片、提示块、快捷键、正文颜色、封面上传、块菜单、数据库视图、窄窗口和关闭重开。断言无 renderer 异常、无外网请求；引擎为确定性 fixture，不调用模型。

安装后的验收通过 `AGENTS_COMPANY_TEST_APP='/Applications/Agents Company.app/Contents/MacOS/Agents Company'` 运行同一测试。截图保存于宿主 `artifacts/mininotion-local/` 或 `AGENTS_COMPANY_TEST_ARTIFACTS` 指定目录。

## 对照基准与边界

参考 Notion 官方的 [页面样式与图标](https://www.notion.com/help/customize-and-style-your-content)、[编辑基础](https://www.notion.com/help/writing-and-editing-basics)、[键盘快捷键](https://www.notion.com/help/keyboard-shortcuts)。图标数据来源与许可见 `THIRD_PARTY_NOTICES.md` 和 `UNICODE-LICENSE.txt`。

这里的矢量图标来自 Lucide，emoji 由系统字体显示，未捆绑 Notion 专有图标素材；颜色与版式按本轮代表场景核对，不能声称所有 Notion 页面、图标或像素百分百相同。数据库高级布局、公式全集、所有键盘组合、多窗口标签页等仍以现有功能为准，未在本轮穷举。不同系统的 emoji 字形和新字符支持可能不同。

## 本次结果 · 2026-09-27

- 插件与宿主类型检查通过；本地 Core/CLI 的 3 项场景测试通过，另有 UI 调用 schema 覆盖测试通过。
- 宿主 CLI/UI 覆盖检查：149 PASS / 0 FAIL。
- 候选安装包与实际安装包分别通过 13 组真实宿主隐藏窗口验收；图标操作、四种数据库视图、块菜单、快捷键、主题、窄窗口、图片、关闭重开均通过。
- 安装至 `/Applications/Agents Company.app`，宿主版本 0.49.0，MiniNotion 版本 1.16.0；安装包与候选 ASAR、插件文件核对一致。
- 安装前旧进程正常退出；保留升级前数据与旧 App 备份。后台恢复后，29 位员工 ID 和 10 个 Team 工作目录核对一致。
- 测试均使用临时数据与隐藏窗口，没有在真实数据中创建测试员工，没有模型推理，也未发布任何远程软件包。

本次实际安装截图与日志位于宿主 `artifacts/mininotion-local/installed/`、`artifacts/mininotion-local/installed-ui.log`。这里记录的是本轮通过的范围，不能等同于 Notion 全产品逐像素／全功能一致性证明。


## 1.17.0 · 继续完善

本次补齐的是编辑、搜索、导航的完整操作链：

| 对照项 | 实现与验证 |
| --- | --- |
| 多块操作 | 多选后整组复制、类型转换、文字/背景颜色、移动和删除；Core 按文档顺序处理选区根节点，父子不重复；跨页移动保留块评论；无效目标整批拒绝 |
| 块链接 | `block.get` 返回锚点 URL；菜单复制、正文点击、CLI `page.open --block-id` 使用同一页面/块定位，展开折叠父块并高亮 |
| 搜索 | 引号精确短语、仅标题、页面及后代范围、五种排序和日期范围；命中片段高亮，点击直达正文位置，UI/CLI 查询同源 |
| 页面内查找 | CLI 修改正文后即时重算匹配；切换页面重新建立范围，定位时可展开折叠块 |
| 数学公式 | 块公式与行内公式、LaTeX 编辑器和即时预览；本地 KaTeX/字体；错误输入保留并显示错误，重新编辑可恢复 |
| 书签与面包屑 | 本地书签链接/标题/说明编辑，不抓取远程元数据；面包屑随页面树变化并能导航 |
| 快捷键 | `> ` 折叠、引号引用；Cmd/Ctrl+D 复制；Alt+0…9 转换文本/标题/列表/代码/引用；Cmd/Ctrl+Enter 切换待办；Shift+H 重复最近块/斜杠颜色 |
| 斜杠菜单 | 公式、行内公式、书签、面包屑、复制、删除、文字与背景颜色均有入口 |
| 侧栏 | 原位更换图标；上下、Home/End 和左右键导航/展开页面树；粘贴 emoji 或输入精确名称优先匹配本身 |
| 标签页 | Cmd/Ctrl+T、新标签打开、切换/关闭、页面菜单和 Cmd/Ctrl 点击；`settings.pageTabs/activeTab` 持久化，CLI 可读写，关闭重开保留 |

同时修复非文本块点击跳转后的编辑器销毁时序异常：上游 BlockNote 的非选择块处理会延迟访问已销毁的 view。使用组件的事件边界避免该延迟路径，没有改写依赖库源代码。

### 本轮回归入口

```sh
npm --prefix PlugIns/mini-notion run typecheck
npm --prefix PlugIns/mini-notion run test:domain
npm --prefix PlugIns/mini-notion run test:local
npm --prefix PlugIns/mini-notion run test:editing-ui
npm --prefix PlugIns/mini-notion run test:local-ui
```

- `test:domain`：39 项既有模型、数据库、日期、公式、属性和同步测试。通过现有 esbuild 打包测试以正确解析 TS 扩展名，并给旧创建用例补显式必填颜色，未放宽产品颜色契约。
- `test:local`：7 项真实服务/CLI 场景，含图片图标兼容、多块原子操作、评论迁移、精确搜索、公式/书签/面包屑、标签偏好和错误路径。
- `test:editing-ui`：12 组新增隐藏宿主窗口流程；`test:local-ui`：13 组上一版界面回归。全部使用隔离数据，不运行模型。
- 1.17.0 时原有 `npm test` 尚有旧测试入口与数据契约问题；这些问题已在下面的 1.17.1 全量验收中修复，不再是当前未通过项。宿主插件仍不暴露独立 `agent.*` 入口。

截图与实际运行日志位于宿主 `artifacts/mininotion-editing/`。Notion 是持续更新的产品，本记录逐项列出已经运行的本地行为；不将没有对照过的页面、专有资产或联网能力写成已经验收。


### 1.17.0 实际安装结果

2026-09-27 已使用项目安装器安装至 `/Applications/Agents Company.app`。宿主版本 0.49.0，内置 MiniNotion 1.17.0。候选包和实际安装包分别通过 12 组编辑流程 + 13 组兼容流程；两套测试的退出码均为 0，未检测到 renderer 异常或插件外网请求。

39 项领域测试、7 项 Core/CLI 场景、1 项插件 UI 方法与 schema 覆盖检查以及宿主 149 项静态覆盖检查通过。新版本冷启动后已读取实际工作空间并验证隐藏主窗口渲染，29 位员工 ID 与 10 个 Team 工作目录和本次安装前快照一致。

可核查的日志：`artifacts/mininotion-editing/installed-editing.log`、`installed-compat.log`、`domain.log`、`core-cli.log`、`host-coverage.log`。实际安装截图在 `installed/` 和 `installed-compat/`。


## 1.17.1 · 全量回归修复

此前默认全量套件的已知失败已全部处理。没有新增 `skip`、`fixme` 或 `only`，也没有放宽产品权限或必填颜色校验。

### 修复的实现问题

1. Claude 常驻进程以 0 退出却未发出完成结果时，SDK 迭代器可以正常结束。原实现没有处理该路径，导致“运行中”永久不结束。现在报告连接结束并保留诊断输出；诊断不会成为助手正文。
2. 独立桌面版关闭时，已经持久保存的冲突草稿可以在重启后继续恢复。若最新草稿保存失败，预加载层会明确返回失败，窗口/应用不会关闭；不再把错误当作“已保存”，也不再产生未处理的 Promise 异常。
3. 重复点击关闭、重复退出或退出期间再次关窗，不能绕过正在进行的保存；回归同时注入存储失败验证窗口仍保留。
4. 存储 `DOMException` 跨 Electron context bridge 会丢失信息。现在先转换成普通 Error，使用户看到具体错误，而不是 `[object Object]`。

### 修复的测试基础

- `npm test` 自动发现并执行全部 `*.test.ts` / `*.test.cjs`；TypeScript 使用生产构建已有的 esbuild 解析，保留 source map。失败仍返回非零退出码。
- 旧创建数据补充当前必填的 `color`；颜色缺失的拒绝用例继续保留。
- 测试桩模拟当前 Claude SDK 双向流和 Codex App Server 协议，仍真实执行 scoped `mininotion` CLI、工具事件、错误、停止和历史恢复。它们不调用任何模型。
- 旧断言按已经明确实现的契约更新：顶层数据库拥有 Workspace、后台物理 `.gitignore` 可被 CLI 列出、忙时追加消息进入队列、Agent 面板默认停靠、活动折叠显示、日历事件采用统一跨周层。目录边界、错误、数据内容和持久化断言保留。
- 默认桌面全量测试全部使用隔离目录与隐藏窗口。新增存储失败演练，实际断言窗口仍存在、草稿仍保留，恢复存储后可以关闭并从 CLI 解决冲突。

### 完整默认套件结果

- `npm --prefix PlugIns/mini-notion test`：**152 passed，0 failed，0 skipped，0 cancelled**。
- `npm --prefix PlugIns/mini-notion run test:e2e`：**46 passed**，全部完成，包含原先没有完成的独立桌面流程。
- 两个命令退出码均为 0。显式收费/真实模型的 `test:agent:live` 不属于默认套件，也未运行。

日志与截图在宿主 `artifacts/mininotion-full-regression/`。结果只说明这里列出的全量回归与安装验收已经完成，不将其表述为对所有可能输入的“绝对完美”证明。


### 1.17.1 安装版复验

已通过项目安装器更新 `/Applications/Agents Company.app`，内置 MiniNotion 1.17.1。实际安装包再次通过 12 + 13 = **25 组宿主插件界面测试**，全部退出码为 0；ASAR 和插件运行时与通过验收的候选包逐字节一致。

安装前主应用已关闭，本次保持该状态。升级前已备份；真实 `sessions.json` 与 `schedules.json` 的 SHA-256 在安装和隔离验收前后完全一致，29 位员工和原有 Team 数据未改动。没有调用真实模型、没有创建测试员工到用户数据、没有发布远程包。

最终机器可读结果：`artifacts/mininotion-full-regression/result.json`。完整日志：`full-core.log`、`full-desktop.log`、`installed-editing.log`、`installed-compat.log`、`host-coverage.log`。
