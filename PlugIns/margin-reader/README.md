# Margin Reader

Agents Company 的独立、CLI-first 本地阅读与学习插件。提供文库、学习集、彩色摘录图片卡片和跨文档脑图；支持本地 FSRS 复习；不包含 OCR 或 DRM 解密。

v0.1.1：已修复大分块上传和博客保存。在 Mac 上使用用户下载的《AI Systems Performance Engineering》（22,817,987 字节、1,061 页、516 个目录项）完成真实 UI 导入；文件 SHA-256 一致，翻页、搜索、目录跳转和重开通过。英文博客 CLI 与中文博客 UI 导入及断外网重开均通过。验证记录见 [REPAIR_STATUS.md](REPAIR_STATUS.md)。

## 深度本地学习（v0.7.0）

OCR 按用户要求不做；其余工作围绕本地阅读、整理与复习展开，不需要联网或模型。

- **阅读与页面**：多文档标签、双文档独立滚动与定位、分页缩略图、可恢复折叠；组合多个原件的页面，重排、插入空白页、裁剪、旋转，生成可继续批注的新 PDF。
- **笔记与手写**：空白/横线/方格 PDF 笔记本；附带原文位置的留白卡片，页边、页后展开与折叠标记三种显示；手写图层的新建、显隐、锁定、重命名、合并和撤销；笔事件压感、套索选笔迹并移动/改色/换层。
- **摘录与脑图**：任意多边形套索摘录；脑图空白画布自由书写、卡片随动手写；Shift 多选后建立摘要或复合卡片，原始摘录和图片保留；向右/向下/放射布局、子树聚焦、跨学习集引用及标题关联。
- **卡片与复习**：安全的 Markdown/KaTeX 公式阅读；牌组命名、归档和恢复；`{{答案}}` 挖空、拖框遮挡图片、复习统计、自定义记忆保持率；至少 50 次跨日复习后，可在本机训练个性化 FSRS 参数。

业务仍统一走 93 个公开 CLI/Core 命令。页面编辑保留原件，笔记、笔迹、图层、关联、牌组和训练参数纳入共享状态与版本冲突检查。新增写入不依赖浏览器存储。

入口：阅读工具栏的「对照 / 页面 / 笔记本」、学习栏的「留白 / 套索摘录」、手写栏的「图层 / 套索」、脑图栏的「摘要 / 合并 / 聚焦子脑图 / 引用卡片 / 牌组与统计」。卡片菜单提供 Markdown/公式阅读与图像遮挡；脑图笔在卡片上书写时自动绑定卡片，在空白处书写时使用画布坐标。

验收范围与实现语义见 [LOCAL_PARITY.md](LOCAL_PARITY.md)，复现步骤见 [VERIFICATION.md](VERIFICATION.md)。

## 本地学习工作台（v0.6.0）

- 脑图、大纲、卡片盒、复习四种视图，可按文字、颜色和标签筛选。
- 独立笔记卡、子卡片、正文/笔记/标签编辑；同集跨分支单向或双向关联。
- 持久化撤销/重做，最多 30 步 / 8 MiB 元数据，覆盖卡片编辑、摘录、关联、手写和复习评分。
- 本地 FSRS 复习：编辑正反面、翻面、自评、下次到期安排、暂停与恢复。无需网络、API key 或模型。
- PDF 手写、颜色和粗细、整笔橡皮擦；缩放和重开保持页内定位，原 PDF 不改写。保存失败时保留当前笔画，可明确重试。
- 文档书签、重命名、可恢复删除，原文变化时明确标记定位失效。
- 拖动原文/学习面板分隔线调整比例，重开后恢复。

所有持久功能均来自公开 CLI/API。验证：`npm run test:workbench`、`npm test`、`npm run test:ui`、`npm run test:host`。

对照目标是 macOS MarginNote 4；0.7.0 的具体语义与验收范围见 [LOCAL_PARITY.md](LOCAL_PARITY.md)。功能测试通过不等价于对商业软件每个像素、参数与硬件行为作百分百相同的保证。

## 学习集、摘录与脑图（v0.5.0）

左侧「学习集」旁的 ＋ 可创建学习集，在集内用「添加文件」勾选文库中的文档。同一原件可以加入多个学习集；成员关系保存为稳定文档 ID，不重复复制原件。移除成员只移除关联，不删除原件、其他学习集或已有摘录。

在学习集中打开 PDF 或流式文档，用鼠标选择文字后会自动出现六色面板。点击颜色即由共享 Core 生成 PNG、保存原文定位和文字，并在右侧脑图中生成卡片。PDF 保存实际原页裁切图；HTML、Word、EPUB 等流式文档保存选中文字的排版图片与 UTF-16 选区偏移。PDF 的「框选摘录」也可捕获图表和扫描内容，扫描图片不会自动 OCR。

卡片拖到另一张卡片上时显示接收高亮，松手后成为其子卡片，连带子树一起移动；拖到空白处移到顶层。支持展开/折叠、Tab 缩进、Shift+Tab 提升级别、缩放及滚动浏览。来源按钮可切换到原文件的摘录位置；三点菜单可编辑标题、笔记、颜色、提升层级或恢复性删除。学习集首页展示全幅脑图；阅读时展示原文与脑图分栏，可临时切换到章节目录。

高亮和卡片按学习集独立保存，不会出现在引用同一文档的其他学习集中。文件通过文库重命名/移动后保持 ID；原文内容改变时旧截图保留，失效定位会标记，不套用到新内容。删除卡片或学习集进入各自回收站，可恢复。导出 JSON 可携带所有 PNG、文字、笔记、成员和关系。

新增的所有业务操作都声明在 `study.*` CLI/API 中；图像生成不依赖窗口，也不上传浏览器截图。`captureId` 保证相同保存请求重试不生成重复卡片；学习集版本冲突会保留错误并要求明确重试。存储位于 `.margin-reader/state.json` 的 studySets 和 `.margin-reader/study-assets/<setId>/<cardId>.png`，完整备份必须包含这两部分，不能把 study-assets 当缓存清理。

为控制资源：一次添加最多 500 份，单集最多 10000 份文件/10000 张活动卡片，层级最多 64 层；一次 PDF 摘录最多 12 页，单图最大 8 MiB，捕获任务最多 90 秒。同一个文库可创建多个学习集。加密 PDF 需先在文库中用密码打开；生成原页裁切图时也需在本次读取期间提供密码，密码不持久化。

验证入口：`npm run test:study`、`npm run test:study:native`。测试使用本机真实 1061 页 PDF、离线 HTML、真实鼠标输入、隔离工作区，不改动用户原件。

## 单击阅读与批量选择（v0.4.0）

根目录不显示「返回」卡片，也不占位；进入子文件夹后才显示固定的返回卡片。普通模式下单击文件即可阅读，单击文件夹即可进入。三点菜单仍只操作对应文件，不触发阅读。

顶部常态仅显示「选择」。进入后，卡片/列表出现复选框，点击文件只勾选，不打开。选中至少一项才显示移动、复制、移入回收站；仅选中一项时额外显示重命名。支持全选、取消全选、Shift 连续选择、Command/Ctrl 点击选择和 Escape 退出。切换大图标/列表或刷新保留当前选择，切换文件夹则清空，避免跨目录误操作。

批量操作通过公共 `fs.batch` 实现，单次最多 500 项。先检查整批文件版本和目标冲突，再在同一个工作区锁中使用原文件管理实现执行；一般执行错误会回滚先前完成项，不覆盖目标文件。删除均进入可恢复回收站。异常断电仍需依靠完整文库备份，不能视为跨文件系统的断电事务。来源发生变化时，请取消对话框后重新勾选该文件，不会在刷新时偷偷接受新版本。

验证入口：`npm run test:selection` 与 `npm run test:selection:native`。

## 文库视图（v0.3.0 起）

大图标展示 PDF 第一页的真实封面；HTML 使用正文标题、首张可用本地图片和摘要生成缩略图。缩略图由无窗口 Core 的 `document.preview` 生成，按文件版本缓存；不会为浏览封面而打开文档、改变阅读位置或索引整本书。仅为可见卡片请求预览，同时最多两个任务，缓存有数量和内存上限。损坏、加密或不支持预览的文件保留格式图标，不影响文件管理。

「返回」是一张与文件卡片相同大小的独立导航卡片，固定在左上角，滚动文件时仍可点击。点击只返回一级；v0.4.0 起在文库根目录隐藏卡片，不能越出授权工作区。左侧文件树增至 14px 字号、20px 图标、至少 37px 行高。

大图标、紧凑列表和文件树的文件及文件夹均有常显三点菜单；列表菜单固定在最右侧。菜单支持打开、重命名、移动、复制和移入可恢复回收站，并保留右键、键盘导航及 Escape 关闭。

拖动时，目标文件夹的卡片与左侧树行同时高亮，松手前显示「松开移动到…」或「松开导入到…」。无效的自身/子目录目标显示红色拒绝状态。拖入文件夹后保留当前视图；外部导入通过 `import.finish` 的 `activate:false` 完成，全部写操作仍使用现有 CLI/Core API。

验证：`npm run test:library`、`npm run test:library:native`；原生验证使用真实 Agents Company 应用、隔离临时文库及隐藏窗口。详情见 [VERIFICATION.md](VERIFICATION.md)。

## PDF 阅读模式（v0.2.0）

阅读工具栏可切换「连续滚动」和「逐页翻页」。连续模式右侧始终显示可拖动的竖向进度条；翻页模式改为底部横向进度条。Mac 双指上下滚动支持 0.25–4 倍速度；横向手势及其惯性合并为一次翻页。长单页可上下平移，到边缘后新的竖向手势继续翻页；键盘左右方向键、Page Up / Page Down 也可翻页。

默认适合宽度，四周仅保留 8 像素阅读边距，取消旧版缩放上限；也可选适合整页或专注阅读，隐藏两侧面板。窗口和侧栏尺寸变化自动重新适配，不裁剪、不拉伸原 PDF。PDF 缩放与其他文档的文字字号分开保存，跨模式及重开恢复阅读位置。

全部设置通过 `settings.set` 和 `reader.position.set` 暴露给 CLI；参数见 [API.md](API.md)。连续阅读只为可见与相邻页保留画布，上限 7 页，同时渲染上限 2 页，避免一次性创建千页画布。验证入口 `npm run test:pdf-modes` 使用默认文库中那本 1,061 页的实际 PDF，在隔离临时目录测试，不修改原件；通过 `PDF_MODES_NATIVE=1 PDF_MODES_PLUGIN_ROOT=/absolute/installed/plugin` 验证实际宿主原生窗口。

## 功能

- **阅读**：PDF 原始页面与可选文字层；DOC、DOCX、EPUB、MOBI/AZW/KF8、Markdown、HTML、TXT、RTF、ODT、FB2，以及常见文本和图片。原始文件保留，正文与目录索引独立保存。
- **离线网页**：输入公开博客或文档链接，自动提取正文、保存原 URL/时间与可下载图片，生成自包含 HTML。直接 PDF/EPUB/Word 下载链接也可导入。
- **文件管理**：左侧可展开文件树 + 大文件夹/文件卡片视图，也提供列表。新建文件夹、重命名、移动、复制、拖放导入和可恢复回收站；操作对应真实磁盘文件。
- **可编辑目录**：提取 PDF/EPUB 自带目录及正文标题；添加、修改、删除、排序、增加/减少缩进、任意换父章节、拖动排序、点击跳转。Tab 缩进，Shift+Tab 退级，Alt+上下箭头排序。按住 Option/Alt 拖到章节上可以设为子章节。原件不被改写。
- **阅读辅助**：全文检索、页码/章节导航、阅读位置保存、主题（浅色/深色/护眼）、字号、侧栏宽度、便携内容导出。

## 架构与契约

```text
CLI / 员工 mailbox / Renderer RPC
                │
       schema.json 参数校验
                │
       runtime.cjs request()
                │
 文件服务 · 解析器 · 可编辑目录 · 阅读位置
                │
真实文件 + .margin-reader/state.json + 可重建缓存
```

CLI 与 UI 不存在平行实现。UI 只调用公共 API 并渲染，未使用 localStorage/宿主私有业务接口。UI 的所有持久化操作都可以用 `api METHOD --data JSON` 完整执行。

93 个 API 命令和完整参数在 [API.md](API.md) / [schema.json](schema.json)。`scripts/contracts.cjs` 是 manifest/schema 的源文件；`scripts/docs.cjs` 生成契约手册。

## 构建

需要 Node >=22.13。固定依赖版本与锁文件已包含。

```sh
cd PlugIns/margin-reader
npm ci --ignore-scripts
npm run build:plugin
```

独立产物在 `dist-plugin/`，包含运行依赖和 PDF 渲染器，不依赖宿主的 node_modules。宿主构建脚本可自动发现本插件：

```sh
npm run build:plugin -- --out ../../build/plugins/margin-reader
```

`build:plugin` 不修改宿主源码，不构建或替换其他插件。构建生成的 `ui/vendor/` 不纳入源码 Git；依赖许可证保留在产物中。

## 接入 Agents Company

```sh
node ../../bin/agents plugin install \
  ./dist-plugin
```

安装使用宿主的标准命令；默认工作区、Work Team 绑定、员工入口与窗口生命周期均沿用宿主机制。不要把员工 API 指向父目录或其他 Team。相同插件的不同工作区相互隔离。

本次交付还将构建产物放在标准插件发现目录 `~/AgentsCompany/plugins/margin-reader/`。Agents Company 下次启动或刷新插件列表时可自动发现；无需改动宿主源码。宿主服务未运行时，不会为了展示插件而启动你的模型会话。

本目录拥有独立 `.git`；宿主忽略插件源码目录。只在本目录提交。插件名称和 SVG 图标为独立作品，不代表 MarginNote 官方或其商业产品。蓝白图标参考其阅读器视觉，在插件界面与 favicon 中使用。宿主现有插件栏只显示名称首字母，当前协议没有自定义图标字段；此插件不会擅自修改宿主协议。

## CLI 独立使用

```sh
mkdir -p /tmp/reader-library
node cli.cjs --workspace /tmp/reader-library mkdir Books
node cli.cjs --workspace /tmp/reader-library import /path/to/book.pdf --to Books/book.pdf
node cli.cjs --workspace /tmp/reader-library tree
node cli.cjs --workspace /tmp/reader-library open Books/book.pdf
# 用上一步 result.id 替换 ID
node cli.cjs --workspace /tmp/reader-library read ID --page 1 --text
node cli.cjs --workspace /tmp/reader-library search ID '关键词'
node cli.cjs --workspace /tmp/reader-library api toc.list --data '{"id":"ID"}'
node cli.cjs --workspace /tmp/reader-library api toc.add \
  --data '{"id":"ID","expectedRevision":1,"title":"自定义章节","locator":{"page":1}}'
node cli.cjs --workspace /tmp/reader-library url https://example.com --folder Books
```

所有命令均可不打开窗口执行。错误返回 JSON-RPC error 和非零退出码。支持 `--data @params.json`、`--data -`。已有工作区不能省略、不会自动扩大到父级。受沙箱限制的员工通过宿主 mailbox 执行，不读取用户全局控制凭据。

需要查看 UI 时：

```sh
node cli.cjs --workspace /tmp/reader-library serve
```

命令输出仅限本机访问的随机令牌 URL，手动打开即可。Ctrl+C 关闭服务。宿主中则由 Agents Company 管理渲染服务及窗口。

## 数据与安全

用户文档在真实文件夹中；内部 `.margin-reader/` 保存目录、阅读位置、缓存、待完成上传和回收站。备份整个工作区才能包含自定义目录。原件单独复制不会携带目录编辑信息。

目录更新要求 `expectedRevision`，文本覆盖要求 `expectedVersion`。文件锁跨进程串行写入，JSON 原子替换、fsync 与失败回滚避免常见冲突。外部编辑文档后重新解析，保留自定义目录并标记失效定位。缓存可重建，状态损坏不会自动清空。突发断电不是跨文件 ACID 事务，重要资料仍应备份。

禁止越界路径、符号链接、硬链接和 Git/宿主元数据操作。导入只复制，不移动外部原件。网页拒绝内网、环回、云元数据地址及 DNS 重绑定；重定向逐次校验，不使用登录 Cookie，不执行网页脚本。HTML 清理后隔离渲染，图片保存为安全栅格格式，解析在受内存和时间限制的 Worker 中运行。

## 兼容性边界

| 格式/来源 | 本版本行为 |
| --- | --- |
| PDF | 看原页、文字层、页码和原目录；扫描 PDF 可看，但没有 OCR 搜索文字 |
| DOC | 已验证旧 Word 二进制解析；正文/脚注文字，不承诺原始版式、图片和标题样式 |
| DOCX | 流式正文、标题、表格与常见内嵌图片，不是 Word 逐像素排版 |
| EPUB | EPUB2 NCX / EPUB3 nav 原目录、章节、内链和可内嵌栅格图片 |
| MOBI/AZW/AZW3/KF8 | 非 DRM 电子书解析；不同出版器生成的变体需用具体文件验证 |
| RTF | macOS 使用系统 textutil；其他平台返回清楚的依赖缺失错误 |
| ODT/FB2 | 结构化文字阅读，复杂排版不保留 |
| 网页 | 公开静态正文提取和离线 HTML；登录、付费墙、验证码、复杂客户端渲染不绕过 |

默认原文件最大 512 MiB，分块上传 4 MiB；解析最长 120 秒、归档展开有上限。大量图片或极大文档可能触及资源限制，原件仍保留。网页图片抓取失败会给出警告，不伪装为完整下载。当前不含 OCR、DRM 破解或 MarginNote 私有数据库导入。

## 验证

```sh
npm run check
npm test
npm run test:ui
npm run test:host
# 显式联网验证公开网页及真实 MOBI/AZW3（测试下载会自动删除）
npm run test:live
```

单元/契约测试使用隔离临时工作区与合成文档。UI 测试使用无头 Playwright（默认可复用宿主已有测试依赖，也可设置 PLAYWRIGHT_MODULE 指定安装），不打开可见窗口。宿主集成测试使用临时控制目录，不创建模型员工，不改动真实团队。截图和验证输出位于忽略的 artifacts/。

v0.1.1 验证：25 组无窗口测试、16 项界面检查、12 项宿主集成检查，以及真实本地书籍和中英文博客的验收。旧版 [VERIFICATION.md](VERIFICATION.md) 保留历史记录；本次见 [REPAIR_STATUS.md](REPAIR_STATUS.md)。

```sh
# 必须在拥有本地下载书籍的 Mac 上显式运行
npm run test:acceptance
npm run test:blog-ui
```

第三方组件与来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
