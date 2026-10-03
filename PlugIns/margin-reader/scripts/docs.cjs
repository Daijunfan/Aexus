'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { commands } = require('./contracts.cjs');
function generate() {
  const root = path.resolve(__dirname, '..'), version = require('../package.json').version;
  const text = `---
schema: agents-company.cli/v1
plugin: margin-reader
version: '${version}'
workspace: required
---

# Margin Reader CLI API

## Purpose

0.9.4统一移动、选择与父子关系工具的主题拖放预览；拖到目标主体修改父主题，拖出脑图松开取消，重叠旧位置不再挡住目标。保留完整资料封面、并排阅读与原文定位。公开接口和员工权限不变，见 docs/DRAG_COVER_FINISH.md。

0.9.3修复 Ctrl/Cmd+S 与退出，增加原文拖入、可撤销的所选节点删除、区域、大纲和主题任务时间图。新命令为 study.cards.remove、study.mindmap.tasks.plan/export、study.mindmap.zone.move；全部复用当前授权工作区的 Core，独立主题不要求原文来源。见 docs/MINDMAP_USABILITY.md。

0.9.2增加完整资料封面与统一主题拖放：主题A拖到B后B成为父主题，后代跟随；总览缩略节点也可直接操作。study.cards.move的expandParent可在同一次撤销操作中展开目标。界面提供文档阅读与无限脑图，可单独查看或并排阅读，并自由交换左右和调整分栏宽度；卡片盒、学习大纲和复习面板已退休，旧数据与API保留兼容。CLI-first、本地优先的文档阅读器。PDF 原页阅读，DOC/DOCX、EPUB、MOBI/KF8 和常见文本/图片读取；公开网页正文与图片离线保存；真实文件树、大文件夹视图；原文目录提取、自定义章节、缩进、退级、排序、全文搜索和阅读位置保存。
v0.7.0 提供图层/压感/套索、脑图手写、文档对照、笔记本/页面组合、留白、复合卡片、牌组/遮挡/挖空/参数训练，并保留学习集、摘录与独立笔记卡、标签检索、关联、大纲/卡片/脑图视图、撤销重做、离线 FSRS 复习、PDF 手写与文档书签；不含 OCR 或 DRM 解密。

## Workspace

独立运行时必须提供已有目录：\`node cli.cjs --workspace /absolute/library ...\`，也可使用 AGENTS_WORKSPACE。所有 API 路径均相对此目录，使用 / 分隔。根目录用 . 表示。
宿主 createPlugin 传入的 workspace 就是完整授权范围。不会读取父目录、同级员工或全局文库。路径穿越、绝对路径、软链接、硬链接、.git、.agents-company 和 .margin-reader 业务访问均被拒绝。保留目录名同时防止大小写、Unicode 兼容写法、尾随点/空格和元数据流别名绕过；公开列表、递归目录操作、备份清单与变更监听使用同一规则。
Work Team 的实际根目录由宿主提供；开发环境与打包环境的位置可能不同，不要自行拼接或假定固定路径。员工入口固定到其获授权的子目录，能够操作此范围内全部已声明功能，但不会因此取得 Team 根目录、同级员工或其他 Team 的内容。员工 mailbox 使用宿主授予的身份，不回退到用户全局凭据，也不回退到独立运行时或另一个工作区。\n用户查看员工成果时，使用 agents plugin open margin-reader --employee EMPLOYEE_ID 打开同一授权文库；省略作用范围的侧栏入口、Team 根目录和员工目录不是同一份学习集状态。
\`import FILE --to relative/path\` 在调用者已经有权限的 CLI 进程内读取 FILE，随后使用 import.begin/chunk/finish API 上传；运行时没有任意外部文件读取 API。原始来源文件不会移动或删除。

## Quick start

在插件目录执行：

\`\`\`sh
mkdir -p /tmp/my-reader-library
node cli.cjs --workspace /tmp/my-reader-library mkdir Books
node cli.cjs --workspace /tmp/my-reader-library api fs.write --data '{"path":"Books/welcome.md","content":"# Welcome\\n\\nRead locally.\\n\\n## Next\\n\\nAnother section."}'
node cli.cjs --workspace /tmp/my-reader-library open Books/welcome.md
node cli.cjs --workspace /tmp/my-reader-library tree
# 用 open 返回的 result.id 和 result.revision 替换下例值。
node cli.cjs --workspace /tmp/my-reader-library api toc.add --data '{"id":"DOCUMENT_ID","expectedRevision":1,"title":"自定义章节","locator":{"section":0}}'
node cli.cjs --workspace /tmp/my-reader-library read DOCUMENT_ID --text
node cli.cjs --workspace /tmp/my-reader-library import /path/to/book.pdf --to Books/book.pdf
node cli.cjs --workspace /tmp/my-reader-library url https://example.com --folder Books
node cli.cjs --workspace /tmp/my-reader-library serve
\`\`\`

serve 只输出本机令牌 URL，不自动打开浏览器。关闭时 Ctrl+C。完全无窗口的读取、管理和编辑不需要 serve。

宿主集成：

\`\`\`sh
agents plugin install /absolute/path/to/margin-reader/dist-plugin
agents plugin describe margin-reader
agents plugin call margin-reader fs.list --team 'Reader Team' --params '{"path":"."}'
agents plugin open margin-reader
# 员工使用自身的固定作用范围入口：
margin-reader help study.card.create\nmargin-reader schema study.search\nmargin-reader api fs.tree --data '{}' 
\`\`\`

API 返回完整 JSON-RPC 2.0：\`{"jsonrpc":"2.0","id":"request-id","result":{...}}\`。CLI 失败返回 error 且退出码非零。\`--data @file.json\` 或 \`--data -\` 可读取 JSON 文件/标准输入。\`--text\` 仅把 document.content 的正文输出为纯文本。

## Commands

机器可读的完整参数约束见 [schema.json](schema.json)。通用入口：
\`margin-reader --workspace DIR api METHOD --data JSON\`。
CLI、renderer HTTP、员工 mailbox 和 runtime.request 使用同一个实现与校验；不接受 schema 外的方法或参数。

${commands.map(c => `### ${c.method}\n\n${c.description}\n\n性质：${c.mutates ? '写入' : '读取'}；员工访问：workspace。\n\n${Object.keys(c.options || {}).length ? '| 参数 | 类型 | 必填 | 说明 |\n| --- | --- | --- | --- |\n' + Object.entries(c.options).map(([name, rule]) => `| ${name} | ${rule.type}${rule.nullable ? ' / null' : ''} | ${rule.required ? '是' : '否'} | ${rule.description.replace(/\|/g, '\\|')}${rule.enum ? ' 可选：' + rule.enum.join(', ') : ''} |`).join('\n') : '无参数。'}${c.examples ? '\n\n示例参数：\n\n```json\n' + JSON.stringify(c.examples[0], null, 2) + '\n```' : ''}`).join('\n\n')}

### Study sets, excerpt images and mind maps

study.create 创建学习集；study.documents.add 通过文库路径注册/关联文件而不复制原件。一个 documentId 可出现在多个学习集中；study.get 返回所有成员、卡片、sourceAvailable/sourceChanged/detached 标记及颜色表。study.open 设置 activeStudySet 和可选成员 lastDocument，省略 documentId 则打开学习集全幅脑图。退出学习集可 settings.set activeStudySet:null。移除成员不会删除原件或现有摘录；学习集及卡片删除均可通过对应 restore 恢复。

所有学习集写操作（除创建/打开/导出外）使用 expectedRevision。截图创建还要求 expectedSourceVersion（document.open/get 返回）和 captureId（调用者生成的 UUID）。相同 captureId 和相同参数重复请求会返回同一卡片；相同 UUID 换内容或卡片已删除时拒绝。版本冲突不能自动重试覆盖。

study.card.create 接收 documentId、text、color 和 locator。PDF selection.rects 是最多 2000 个矩形，每个包含 page（从 1 开始）、x/y/width/height（相对该旋转后显示页的 0–1 坐标）；最多覆盖 12 页。Core 使用原 PDF 页面渲染裁切并拼接为 PNG，不依赖 UI 画布上传。PDF 框选可传空 text；图中文字不自动 OCR。流式文档 selection.start/end 是 document.content.html 的 body.textContent 中 UTF-16 偏移，Core 会核验选中文字；图片按选中文字排版生成。CLI 也可省略 selection，直接从 text 生成图片，仍须有合法原文 locator。

示例：先 study.create 取得 SET_ID 和 revision，再 study.documents.add paths:["Books/book.pdf","article.html"] 取得成员 ID。使用 document.get 取得 SOURCE_VERSION，然后调用：

\`node cli.cjs --workspace /absolute/library api study.card.create --data '{"setId":"SET_ID","expectedRevision":2,"documentId":"DOCUMENT_ID","expectedSourceVersion":"SOURCE_VERSION","captureId":"GENERATED_UUID","text":"Selected passage","color":"yellow","locator":{"page":29},"selection":{"rects":[{"page":29,"x":0.15,"y":0.25,"width":0.7,"height":0.12}]}}'\`

study.card.move 的 parentId 为目标卡片 ID，null 表示顶层；index 可指定同级顺序。整个子树一起移动，跨集 parent 和环路被拒绝。study.card.update 可改 title/note/tags/color/collapsed；独立笔记卡还可改 text，摘录的原始 text、图像和源快照不被修改。每个学习集的高亮/笔记/层级独立，不写入 PDF/HTML 原件。

study.card.image 返回 PNG 的 MIME 和 canonical base64。也可通过稳定资产引用 data/study-card/<setId>/<cardId>.png 渲染。study.export 将成员、卡片和树关系写入新 JSON，includeImages:true 内嵌 PNG；从不覆盖目的文件。原文更新后旧图片保留，失效选区不再高亮于新内容；文库重命名/移动保留 ID，重新读取匹配内容后定位仍可用。

限制：每次添加 1–500 个文件、每集最多 10000 个文件及活动卡片、64 级层次。图像在最多两个隔离 Worker 中生成，单任务 90 秒，PNG 上限 8 MiB，原文仍受已有格式/容量/密码限制。任何失败都不应作为成功卡片显示。用户文档、卡片 PNG 和完整元数据都保留在授权工作区，禁止跨 Team 取图。

### Batch file operations and selection

普通单击文件/文件夹直接打开；顶部的选择模式只影响当前界面的勾选状态，不写业务数据。未选择时隐藏移动、复制、删除等批量操作；返回卡片只在子文件夹显示。选择的文件版本在勾选时固定，刷新不会自动批准对新版本操作。

\`fs.batch\` 参数：action 为 move/copy/trash；items 为 1–500 个 \`{path,expectedVersion}\`，版本来自 fs.list；move/copy 必须提供现存的 folder（根目录为 .），trash 不接受 folder。不能同时选中父目录和其子项，不接受重复、链接、越界或受保护路径。保留每个项目的原名称，遇到任意同名冲突或版本变化时在执行前拒绝整批请求。

\`node cli.cjs --workspace /absolute/library api fs.batch --data '{"action":"move","folder":"Books","items":[{"path":"one.pdf","expectedVersion":"VERSION_FROM_FS_LIST"},{"path":"two.html","expectedVersion":"VERSION_FROM_FS_LIST"}]}'\`

批量复用单文件操作代码，共用一次文件锁和状态提交；普通运行时错误回滚先前已完成的文件操作。成功返回 \`{action,count,items:[{source,path,version?,trashId?}]}\`，trashId 可用 fs.restore 恢复。异常断电不承诺跨文件 ACID；有失败回滚警告时保留文库备份再诊断。CONFLICT 的失败路径在 error.data.details.failedPath 中；重新读取并明确重新选择后再重试，不自动覆盖。

### Reading locators and concurrency

PDF 用一基页码 \`{"page":1,"offset":0}\`；offset 是页内可滚动范围的 0–1 比例。流式文档用零基章节 \`{"section":0,"anchor":"heading-id"}\`，anchor 可省略。document.content 返回 anchors；toc.list 返回现有章节与 locator。位置由 Core 验证，可由 CLI 直接跳转，界面通过事件同步。
CLI 的 settings.set lastDocument:null,currentFolder 可使已打开的界面返回指定文件夹；document.fold 和重新解析文档也会刷新当前可见内容，无需手动重载。宿主通信目录与缓存变化不被当作用户文库变化，避免 events.json 造成通知循环。\n目录编辑必须提交最近读取的 expectedRevision。冲突时重新 toc.list，对比后明确重试，不会自动覆盖。fs.write 更新已存在文本时必须提供 fs.list 返回的 expectedVersion。其他文件操作也拒绝覆盖目的地。阅读位置/设置采用最后写入者生效；多个进程用工作区文件锁串行提交。
分块上传最大 512 MiB、每块最多 4 MiB，offset 必须匹配 import.status 的 received。可断点续传。finish 可校验 SHA-256。finish 解析失败时原文件仍保留，error.data.details.savedPath 告知路径。密码仅随请求传递，不持久化；敏感密码建议通过标准输入传 JSON，避免 shell 历史。

### PDF modes, fitting and trackpad preferences

PDF 的两种阅读模式由 settings.set 的 pdfMode 控制：continuous 为连续竖向滚动（右侧常驻、可拖动的竖向进度条），paged 为单页翻页（底部横向进度条）。pdfFit=width 尽量占满可用宽度，pdfFit=page 在保留比例的前提下容纳整页。pdfZoom 为适配后的 0.5–3 倍倍率，与流式文字 fontSize 分开。pdfFocus=true 隐藏文件树与目录；关闭专注阅读恢复两侧面板。

pdfScrollSpeed 为上下触控板/滚轮的 0.25–4 倍速率。横向手势始终按一次一页处理，惯性事件合并到同一手势；竖向连续滚动允许跨页。翻页模式可上下平移长页，到达页边后新的竖向手势可继续翻页，单次手势不会连续翻过多页。修饰键滚轮不被翻页逻辑拦截。渲染窗口按可用区域实时重新计算比例，只渲染可见及相邻页面，最多保留 7 个页面画布、同时最多渲染 2 页。

CLI 示例：

\`\`\`sh
node cli.cjs --workspace /absolute/library api settings.set --data '{"pdfMode":"continuous","pdfFit":"width","pdfScrollSpeed":1.5}'
node cli.cjs --workspace /absolute/library api settings.set --data '{"pdfMode":"paged","pdfFit":"page","pdfZoom":1,"pdfFocus":false}'
node cli.cjs --workspace /absolute/library api reader.position.set --data '{"id":"DOCUMENT_ID","locator":{"page":531,"pageOffset":0.25}}'
\`\`\`

新增 pageOffset 表示页面顶部起算、相对整页高度的 0–1 比例，跨缩放和模式切换保持同一内容位置；同时适配整页时会钳制到可滚动范围。旧 offset 参数仍按页内可滚动范围解释，不能与 pageOffset 同时使用。新设置通过加法式默认值兼容旧文库，不删除旧状态、不改动原 PDF。

### Document thumbnails and quiet imports

\`document.preview {path,expectedVersion?}\` 无窗口生成 PNG：PDF 为真实第一页（保留页面比例），HTML/Markdown 为标题、本地图片和正文摘要的缩小预览。返回 kind=image、mimeType=image/png、contentBase64、width、height、title、version、cacheHit；PDF 另有 page=1、pageCount。其他情况返回 kind=fallback 及 reason（例如加密、损坏或格式不支持），文件仍可管理。路径越界、链接、原文件版本冲突仍按正式错误拒绝。

预览不注册文档，不改动 lastDocument、阅读位置或自定义目录，不为缩略图加载远程图片/脚本。派生缓存按路径与版本存入 cache/preview-v1-*.json，最多两个渲染 Worker；每张图不超过 360×480，单任务 30 秒，返回结果上限 1 MiB。旧缩略图可重建，不能将缓存当作用户原件。浏览器可见卡片按需请求，关闭窗口不等待这些无业务写入的预览任务。

\`node cli.cjs --workspace /absolute/library api document.preview --data '{"path":"Books/book.pdf"}'\`

\`document.open\` 与 \`import.finish\` 的 activate 默认 true。传 false 可解析/导入文档而不切换当前阅读位置；拖入指定文件夹使用此选项。目录导航仍用 settings.set currentFolder，文件管理仍用 fs.*，没有新增 UI 私有写入接口。

### 本地学习工作台（v0.6.0）

study.note.create 新建独立文本卡，source/image/imageAsset 为 null；UI 与 CLI 均无需先创建文档。study.cards.query 以 query/tag/color/documentId 交集筛选卡片。study.link.add/remove 维护同集跨分支的单向/双向关联，删除卡片时关联随卡片进入回收站，恢复时仅恢复两端仍有效的关联。

当前界面仅提供 documents/map。study.view.set 保存 documents/map；outline/cards/review 仅作为旧调用和数据的兼容值，不再提供对应界面。study.undo/redo 在事务锁内恢复本学习集最近编辑（最多 30 步、8 MiB 元数据），revision 只递增；新编辑清空 redo。图片不复制、不删除。视图切换、打开/删除/恢复整个学习集及导出不进入编辑历史。该历史用于撤销，不是备份。大于历史容量的编辑仍可保存，但旧的撤销项会被移除。

study.review.configure 设置正反面并加入或暂停复习。study.review.queue 使用服务端当前时间给出到期 cardIds；preview 返回 again/hard/good/easy 四个下次到期时间；grade 保存 ts-fsrs 5.4.2 计算的调度和日志。默认不启用随机扰动；可设置 retention/maximumInterval，并通过本机历史训练 w。全程离线、不调用模型；不复刻 MarginNote 的私有默认参数。每次评分必须携带当前 revision，重复提交不会重复计分。可通过 study.undo 撤销最近评分。

study.ink.add 保存按文档版本绑定的 PDF 页归一化笔画，study.ink.remove 擦除，study.undo 可撤销；本地笔画按学习集隔离，原始 PDF 不变。单笔 2–2048 个 [x,y] 点，每集最多 2000 笔；旧源文件变化后不显示过期坐标。PDF 笔画可携带第三个 0–1 压感分量；图层、套索移动与卡片/画布手写见下节。不做 OCR 或手写转文字。UI 保存失败保留草稿并要求明确重试或放弃。

bookmark.list/add/update 提供文档级书签。写操作使用文档 revision；deleted:true 可恢复删除，deleted:false 恢复。书签与文档 ID 绑定，重命名和重新解析不丢失；源内容改变时标记 unresolved，不能默默套用旧定位。

settings.set studyRatio:0.3–0.7 调整并保存文档/学习面板分栏比例，UI 拖动中间分隔线使用同一设置。

### 深度本地学习（v0.7.0）

pdf.compose 在同一工作区读取原 PDF，复制选定页、旋转、裁剪并插入空白/横线/方格页。结果写入新的 .pdf 路径，不覆盖或改写原件；可从多份原件组合页面。crop 坐标针对未旋转的原 CropBox，左上角起算。输出完成后通过原有文档解析器注册，继续使用相同的搜索、摘录、手写、目录 API。加密 PDF 的页面编辑受 pdf-lib 能力限制；不会绕过加密或输出猜测内容。

document.fold 使用文档 revision 保存折叠页列表；读者可点击折叠条展开。document.preview 的 page 参数生成指定页缩略图，不改变阅读位置。document.open 维护最近 20 个文档标签；reader.tabs.close 仅关闭标签，不删除文件。reader.comparison.set 独立持久化另一份文档和 locator，同一文件也能比较两个位置，不污染主阅读位置。

study.layer.* 管理最多 64 个手写图层，default 图层始终保留。study.ink.transform 可移动、改色、跨层转移选中的 PDF 笔画；锁定图层拒绝写入。隐藏和删除图层不删除原始笔迹，撤销可恢复。study.card.ink.* 使用卡片内归一化坐标，随卡片移动；study.canvas.ink.* 使用脑图世界坐标，布局变化时留在原画布位置。图层合并覆盖三种笔迹。

study.note.anchor 将独立笔记卡绑定到原文 locator 和内容 hash，display 可为 margin/embedded/collapsed。UI 的 embedded 在对应 PDF 页后展开；margin 在足够宽的阅读区显示页边笔记，窄窗口使用可打开的标记；collapsed 只显示标记。原文变化则标记失效，不套用旧定位。笔记本是本地真实 PDF，可写字、添加留白与摘录。

study.cards.group 创建带原始卡片 ID 的摘要父节点；study.cards.merge 创建复合节点，原卡片保留为可展开子卡片，所以所有图片、定位、笔迹都不会丢失。删除复合节点并提升子卡片可解除组合。study.map.configure 支持 tree/down/radial 与 focusId 子树聚焦；引用和折叠均不改动实际层级。

study.search 在当前工作区的活动学习集中按标题、正文、笔记和标签查找卡片；query 须为 1–1000 字符的非空文本。limit 默认为 500（1–500），offset 默认为 0；返回 cards、total、offset、limit、hasMore、truncated 和 nextOffset。继续传 nextOffset，直到 null，可读取超过 500 条的全部结果，不会静默截断。分页不修改状态，也不是跨请求的锁定快照；并发编辑期间应按 cardId 去重并重新查询。study.card.reference 保留目标 set/card UUID，通过来源跳转可回到对应子脑图。study.card.render 返回 Markdown/公式的消毒 HTML，并给出文字中命中其他卡片标题的 titleLinks；重复标题返回候选，不擅自选择。文本和公式渲染不执行脚本或下载外部图片。
标题词典支持以中文或英文分号分隔关键词别名；相同卡片的重复别名不产生虚假的多候选。study.card.render 会检查全部候选词条，不按标题长度只取前 1000 个。单次卡片正文、笔记和评论合计最多生成 200 处自动链接；linkStatus 返回 complete、rendered、limit 和 dictionaryTerms。达到上限保留完整文字并显示提示，剩余词条可由 study.catalog / library.search 检索。大小写不敏感匹配仍按原始 UTF-16 文本位置链接，不因 İ 等扩展小写字符偏移。
document.search 的流式结果除章节、锚点外，返回精确 textOffset；跳转可以直接使用 locator。snippet 的 matchOffset、matchLength 对应返回的原始文字。library.search 的定位只使用未被否定的正文搜索项。
大文库脑图保留完整布局，只挂载近视口节点；卡片盒与大纲每页 100 张，可跳页或全量检索。CLI 数据、导出、批量操作和稳定 ID 不因界面分页而截断。

study.deck.* 管理本地牌组及可恢复归档。review.configure 可指定 deckId、cloze（用 {{答案}} 标记）、occlusions（图片上的归一化矩形）；普通摘录图在翻面前隐藏，遮挡题只显示带遮罩的图片。review.stats 返回当前活动卡片的历史次数、每日计数和观察到的回忆成功率。review.settings 设置目标记忆保持率、最长间隔和当前牌组。review.optimize 使用固定版本 @open-spaced-repetition/binding 0.5.0 离线训练，至少需要 50 个跨日观察；训练期间出现其他编辑会拒绝保存并保留原参数。训练结果也可撤销。

### 本地音视频与演示触点

MOV/MP4/M4V/MP3/M4A/WAV/Ogg/WebM 可作为媒体文档导入，使用本机已安装的 FFmpeg/ffprobe 读取时长与流信息。依赖不可用时 system.info 将这些格式标为 unavailable，命令显式失败；插件不下载或捆绑未经再分发审查的二进制文件。

媒体 locator 为 {section:0,time:秒,endTime?:秒}，由相同的 reader.position、书签、目录和原文回链接口校验。document.av.info 读取媒体信息；study.av.excerpt 从视频原时间点生成 PNG，或从音频区间生成波形 PNG，并把卡片绑定到该时间区间。写入前后检查原件版本和学习集 revision；失败不覆盖旧笔记。一次时间摘录最长十分钟，原件仍遵循 512 MiB 文件上限，不做联网抓取、字幕识别或 OCR。

播放器使用受作用域约束的原件生成临时 Blob，兼容当前宿主不提供 HTTP Range 的资源接口；关闭或换文档释放 Blob。它会完整读取原件，长视频的流式资源接口与更多编解码器仍需后续专门验收，不能据小样本通过宣称全部媒体体验完成。

settings.set presentationPointers:true 开启本地演示触点：鼠标/触摸显示圆点，笔事件显示笔尖。关闭、失焦、指针取消时移除临时对象；只有开关保存在 Core 中。该模式与卡片幻灯片分开，不自行开启麦克风、录屏或广播。

### 复习内容绑定与分面批注

study.review.configure 的 frontMode 可选 title/card/emphasis/custom，backMode 可选 card/custom。新卡默认以标题提问、完整卡片作答，随 title、editedText/text、note、评论和媒体的修改显示最新内容。旧卡未声明 mode 时继续按原自定义问答显示；只读接口不重写旧数据。emphasis 使用显式 cloze 文本；从独立强调标记出题使用 study.review.generate。

study.review.render 是正反面的权威读取入口：返回消毒 HTML、纯文本、分面评论、媒体引用、笔迹和遮挡分组。front/back 存储字段保留独立问答草稿，完整卡片模式不依靠过时字符串快照。传入 sessionId 会校验当前题目并采用已保存的揭示状态，拒绝串题。界面通过原有 study.card.update 修改背面来源，源摘录使用 editedText，不重写原 PDF 或不可变截图。

study.comment.add/update、study.media.import 和 study.card.ink.add 支持 reviewSide:front/back/both；未声明的旧评论和整卡笔迹属于背面；绑定图片的普通笔迹属于图片内容，随图片在正反面显示，显式 reviewSide 仍控制其分面。图片/音频仍保存为已有工作区资产。删除、恢复、改面及手写保存经过原有版本检查与撤销。普通脑图不显示只属于复习正面的笔迹。

revealMode:sequential 在同一题上按组名（无名称时按数字组号）依次揭示，文字与图片的同号组同时显示；全部揭示前 session.grade 拒绝评分。reveal 不传 revealed 时展示下一组；revealed:true 展示全部，false 重新遮挡。状态随会话保存，可重开和撤销评分。独立排程模式继续可选，旧卡保留该模式；切换为逐组模式时旧分组排程存入 variantArchive，切回可恢复，不删除总日志。分组身份已改变的旧队列会明确提示重建，不能给不存在的题目评分。

study.view.set view:review 会创建或恢复公共 Core 复习会话。批量配置支持相同模式字段；批量 frontMode 提取保留手动定制的正面（lastReviewBatch.preservedFronts），显式 frontTemplate 则按请求替换。settings.set reviewDefaultFront / reviewDefaultReveal 控制当前文库中新卡的默认值，不改已有卡片规则。Anki 导出使用当前内容和分面批注；独立题目按稳定分组 ID 分别导出，保留公式语法与媒体。参数训练按实际题目分组拆分日志，不把不同题目的复习混成一条记忆曲线。

### 独立强调与从标记出题

study.card.emphasis.set 保存文字/图片强调，不修改原始内容，也不自动启用复习。文字以 field、UTF-16 start/end、quote、group 保存；field 可为 title/text/note/comment:UUID。显示时仅渲染仍与 quote 匹配的标记；过期或重叠选区拒绝写入。图片以归一化矩形和组名保存。UI 可选择文字、拖画图片区域、修改组名和移除标记，沿用版本检查与撤销。

study.review.generate 对所选卡片使用四项 rules：documentHighlighter、cardHighlighter、textEmphasis、imageEmphasis（默认启用）。生成会替换复习问题/遮罩，保留源卡片与 FSRS 记录。文字和图片的同名强调合为一组，组名按自然顺序排列；无可用标记的卡片保留原问题并在 lastReviewBatch.skipped 中说明；全部无标记则报 NO_EMPHASIS。默认 autoUpdate:true 将规则保存到 review.generation；后续标记、文字、荧光笔、图层和笔记本变化在同一 Core 事务内同步问题。autoUpdate:false 仅生成当前快照。读取接口不写入状态。

PDF 摘录保存 fragments，记录原页与裁剪图片的坐标映射；荧光笔按来源版本、页、笔记本和可见图层过滤，再投影成矩形遮罩。新卡片笔迹可保存 imageBounds 和 aspectRatio，从整卡坐标投影到图片；UI 自动记录实际图片区域。旧 PDF 摘录可经像素核验修复映射；旧笔迹缺少映射、无图片的文字卡片手写荧光笔仍有明确提示；不臆造坐标。复合摘录保留每个片段的来源文档、页、版本、笔记本及合成图位置，按片段匹配原页笔迹。当前矩形遮罩覆盖笔画包围框，任意曲线遮罩仍待完善。

### 自动直线与停笔图形

study.ink.settings 的 straighten 为 off/auto/always，perfectShape 控制自由手写的停笔图形整理。文档、卡片和画布的 *.ink.add 都把原始 points 交给 Core 处理；geometry 可覆盖本笔的 shape、rulerAngle、straighten、perfectShape、aspectRatio（物理高/宽）和 heldMs。省略覆盖项使用当前设置，heldMs 默认 0。显式形状预设优先，其后是停笔整理和直线辅助。

自动直线只整理接近直线的路径；始终直线使用起终点。自由手写开启 perfectShape 并停笔至少 500ms，可识别矩形、椭圆、圆、三角形、五边形、星形和心形，支持绘制方向和旋转。低置信度或未匹配的笔画保持原路径；这不是 OCR 或文字识别。图形整理使用稳定笔压，普通手写保留原采样压力。recognizedShape 记录创建时的处理结果，后续变换仍以 points 为准。

界面在停笔时预览，松开后由同一算法在 Core 生成并保存；不把已整形的闭合路径再次当作拖动起终点处理。取消手势或按 Escape 不保存预览，其余触点不会提前结束当前笔画。基本复习批注编辑器明确使用自由手写，不受脑图固定形状预设影响。

涂抹删除和完整的原版笔型/工具栏、交互尺子仍未在此项中实现。

### 橡皮擦与可见笔迹

study.ink.erase 支持 mode:stroke 和 mode:partial，省略时保留旧版 partial 行为。stroke 删除擦除路径碰到的整笔，可连续扫过多笔；partial 只分割路径覆盖的部分。文档、卡片、图片绑定笔迹和自由画布使用同一 Core 操作，保留撤销。隐藏或锁定的图层、文档笔记本不参与擦除。

卡片可用 side:front/back 限定当前可见复习面；普通脑图传 back，避免删除只属于复习正面的笔迹。PDF 的 bands 可传入可见原页区间 [{start,end}]，界面按折叠布局自动传入。完全藏在折叠区的笔迹不会因跨越折叠条而被擦掉；整笔模式若碰到该笔在可见区的部分，仍按整笔操作。

study.ink.settings eraserAutoCancel 控制一次成功擦除后回到此前笔刷，默认关闭。界面保留原颜色、笔型及透明度；失败、冲突或取消时不自动切换。鼠标/笔拖动时显示实际擦除光标。嵌入笔记的手写由卡片接口处理，不把手势写到背后的 PDF。套索按线段相交选择，能够选中仅有两个端点的长直线。

### 图片手写绑定

study.card.ink.add 支持 imageBound 与 imageBounds。points 使用参考卡片坐标，imageBounds 表示该参考坐标中图片的实际内容区域；CLI 可将 imageBounds 设为单位矩形，直接以图片归一化坐标书写。显式 imageBound:true 会裁去图片外的手势段，压力作为可选第三分量保留。不传 imageBound 时，整笔位于所给 imageBounds 内即绑定；false 明确保留整卡坐标。没有 imageBounds 的普通卡片笔迹保持原行为。

图片裁剪、旋转和可匹配的摘录区域变换会同步处理绑定笔迹，保留仍存在的笔画身份；必要时分段。替换图片时这些笔迹随旧图片移出当前卡片，撤销会恢复。源 PNG 不烘焙笔迹。布局、尺寸和图片显示比例变化仅改变投影，既不改写笔迹，也不推进版本。仅旧记录中具有完整 imageBounds、且整笔位于其中的笔迹会按图片绑定投影；读取不会迁移磁盘状态。

study.ink.batch 的 imageBound 可绑定/解绑所选卡片笔迹；imageBounds 可提供当前展示的图片矩形。移动、复制、局部擦除及解绑回画布使用同一投影；省略矩形时使用 Core 的标准脑图图片位置，study.map.geometry 的 positions[].imageBounds 返回该位置。自定义文档留白视图可传自己的显示矩形。绑定图片需为本卡片所有的图片；引用卡图片的独立绑定还未支持。

普通卡片预览、复习及 HTML/Markdown/Word/PDF/Anki 导出会在图像上绘制绑定笔迹。review.render 将其分别返回为 frontImageInk / backImageInk，避免同时在空白手写面板再绘制一次。图层可见性、分面、撤销和可移植包继续有效。

### 旧摘录定位修复

study.excerpt.repair 对选中的旧摘录重建缺少的 fragments/tiles，仅在像素核验通过后补写元数据，原图与原文件不改写。单片段比较完整解码图像，允许 PNG 编码/元数据不同；复合图比较尺寸及每个嵌入片段的位置和像素，不要求历史外层标题文字格式相同。返回 mappingRepair 的 repairedCardIds、repairedParts、unchanged 和 skipped（含 cardId/partId/code/message）。无需修复时不推进版本或写入历史。

PDF 原件必须仍与摘录的源哈希一致，并通过当前文件版本和作用范围检查；提交前再次核对文档版本和学习集版本。图片不一致、来源变化、锁定笔记本等项目明确跳过。可恢复地补写映射，study.undo/redo 恢复修复前后状态。password 仅供本次解锁 PDF，不写入状态或报告。

study.review.generate 在启用文档荧光笔规则时自动准备旧映射，修复与出题在同一事务和同一撤销步骤提交；没有可生成题目的失败请求不会遗留半次修复。界面的「连续摘录」菜单也提供单独的「修复旧摘录定位」。无法验证的截图保留，仍可使用已有重新选择/绑定流程。

### 自动出题的编辑语义

自动题目保留原卡片 ID、排程和日志；只在问题内容或分组发生变化时重新遮挡当前题目。标签、收藏等不改变问题的编辑保留揭示进度。跨学习集引用的源变化也会更新引用题目的学习集版本，旧评分请求会冲突；只在当前工作区状态内处理。

没有可用标记时 generation.status 为 empty，无法生成合法题目时为 invalid，并返回 warnings；原始编辑仍正常保存。此类自动题目不进入复习队列，不能评分，复习日志保留；恢复可用标记或撤销源编辑后自动回到 ready。enabled 仍表达用户的暂停意愿，自动更新不会擅自恢复用户暂停的卡片。

手工修改 front/back、cloze、正反面来源、遮罩、组名或分组方式后退出自动生成；study.review.configure autoUpdate:false 可冻结当前问题。只改变牌组或暂停不会关闭自动更新。界面显示当前出题方式，修改内容与 CLI 使用同一契约。重新调用 study.review.generate 可再次启用规则。

### 图片编辑与标记坐标

study.media.transform 会用与图片相同的先裁剪、再顺时针旋转操作变换 emphasis.images 和 review.occlusions。越过裁剪边界的区域截断，完全裁掉的区域移出当前图；保留分组编号，仍存在的分组沿用 FSRS 排程，被移除分组的记录留在 variantArchive。图片绑定的笔迹随图片坐标一起变换，返回 lastMedia.imageMarks.transformedInk。明确采用整卡坐标的笔迹保持原位置，其过期图片投影移除并计入 unmappedInk。

study.media.import 直接替换已有图片时，移除旧图片强调、遮罩及图片绑定笔迹，保留文字强调、正文、批注、整卡笔迹与复习历史。返回 lastMedia.imageMarks 的 before/after/removed 计数。study.undo/redo 同步恢复图片和标记；原资产仍保持不可变。

连续摘录的追加、片段删除和修订也会重映射图像标记。未变片段按稳定片段身份和捕获版本匹配；重新选择的 PDF 区域按原文档、版本、页、笔记本与重叠范围映射。不相交的新来源不能沿用旧遮罩。同一组跨片段的区域可分成多个矩形，仍一起揭示；超过 100 个区域的编辑拒绝并回滚。

### Segmented local backups and preflight

library.backup.plan {path} 只读预估数据、最大文件、可用空间和旧版 ZIP 是否能容纳；预估空间不构成磁盘预留。library.backup.create 可传 format:segmented，生成完整的 .mrbackup 目录包；省略 format 仍使用旧版 ZIP。界面默认分块目录包，检查和恢复自动识别两种格式。

分块格式 margin-reader.backup/v2 使用 4 MiB 数据块和逐文件 SHA-256 校验，按块读写，不把全部原件装入内存。数据预算为 1 TiB / 100000 个文件 / 128 层目录；状态与清单各限 64 MiB，并应用结构校验预算。预算上限不等于已完成此容量的实测。加密包采用 scrypt + AES-256-GCM；清单、文件名映射和内容加密，磁盘块名使用带密钥摘要，独立包不可直接交换密文块。原始字节数、块数和加密头仍可观察；插件不把口令写入文库状态或备份内容。员工 mailbox 按宿主协议临时写入请求，调用者应保护其目录权限；敏感口令优先使用标准输入，不放入 shell 历史。

创建时冻结元数据，结束前检查工作区版本及文件清单。检测到并发改动返回 CONFLICT，不发布混合快照。恢复只接受新目录，不覆盖已有空目录或文库；缺块、校验失败和磁盘满不会发布正常状态的恢复目录。全库备份包含学习集、原件、摘录资源、版本与可恢复回收站；排除员工凭据、其他备份包、活动上传和派生预览。

分块备份必须复制整个 .mrbackup 目录，不能只复制 header.json。一次性 library.backup.create 不提供续做；可暂停/恢复请使用下文 library.backup.job 系列接口。一次性操作被硬中断后可能留下 .margin-reader/backup-staging 中的私有暂存文件，不能当作已完成包使用。REQUEST_TIMEOUT 仍须按请求编号核对结果，勿盲目重发。

### Document dictionaries and submap scopes

study.links.settings 的 sources 可指定最多 256 个 {setId,rootId,color}，rootId 为空表示主脑图及所有后代，或使用子脑图 UUID。不同来源可用 blue / green / red / purple，嵌套时更具体的子脑图颜色优先。sources:[] 明确禁用来源；sources:null 恢复旧 dictionarySetIds 规则。外部学习集仅限同一授权 workspace，跨集移动的稳定子脑图身份仍可解析。自有学习包默认包含字典依赖并重映射其身份。

study.dictionary.match {setId,text,offset,limit} 在 Core 匹配标题/标签/分号别名，返回原始 UTF-16 区间；最多输入 262144 个 UTF-16 单元、每页 200 处命中。重复词条每处先返回 20 个候选及 targetTotal，用 study.dictionary.lookup {setId,term,offset,limit} 取得所有候选，直到 nextOffset:null。两个接口均只读，不改原始正文或学习状态。

PDF 文字层和流式正文通过独立下划线图层展示词条，不拆改文字节点。单击弹出词条内容，重复标题先选择候选，查阅和编辑词条时保留原文位置；明确打开词条才执行跳转。文字拖选、原文摘录菜单和键盘操作保留。密集正文每组最多 200 处，后续词条按钮继续读取；documentLinks:false 只隐藏正文词条，不删除卡片中的链接或已保存标注。该功能不做 OCR，扫描图片没有原生文字时不会伪造词条。

### Visual appearance and title-keyword boards

settings.set uiPalette 提供 azure/mint/violet/rose/amber/coral/iris/graphite 八套强调色，配合既有 theme:light/dark/sepia 使用。uiBackdrop 为 plain/glow/dots/contour，只装饰文库和卡片盒，不改 PDF 页面、原始图片、摘录颜色或笔迹。uiMotion 为 system/full/reduced；系统减少动态始终优先。上述设置仅作用于当前 workspace。旧文库读取时获得默认值，不产生迁移写入。

界面“外观”提供本地示例实时预览、明确应用和恢复默认。预览未提交时不会写设置；取消保留当前界面。提交仅发送用户改过的外观字段，保留其它客户端的字号、位置等调整。动画为短暂反馈，不在文档或脑图世界坐标上应用装饰性变换。

study.board.query、study.workspace.query 和 study.board.save 支持 groupBy:keyword。该维度使用卡片标题的分号别名，按完整词条、不区分大小写分组；同卡重复别名去重，不修改原始标题。标题为空别名或少于两个 UTF-16 单元时归为“无标题词条”。它使用标题而非正文命中，也不随字典 keywordSource:tags 切换为标签分组。

filter.titleKeyword 可精确过滤某个标题别名，仍支持与其它条件组合。多别名卡可以属于多个组，total、分页和勾选按唯一卡片计算；跨学习集保留 ownerSetId 和 ownerRevision。分组成员总量超过 100000 时明确返回 TOO_LARGE，调用者须缩小筛选。关闭标题链接的学习集不能使用 keyword 分组，返回 TITLE_LINKS_DISABLED；可改选启用的学习集。精确 titleKeyword 过滤仍可独立使用。

保存的词条看板可通过 study.board.materialize 生成实时引用脑图，保留原卡片、版本检查和撤销，并随自有学习包导入导出。词条弹窗的“检索相关卡片”使用全库正文查询，查阅过程不自动切走原文；明确打开结果时才跳转。

### Direct editing, portable themes and resumable backup jobs

顶部“外观”现在支持 uiCustomAccent / uiCustomGlow（#RRGGBB 或 null），uiBackgroundStrength（0–1）。自定义强调色会导出适配当前背景的可读文字色和按钮色，原始文档、截图与标注颜色不变。appearance.get 返回仅覆盖外观字段的 version；settings.set 可传 expectedAppearanceVersion，冲突时不覆盖已有外观，其它客户端修改页码、字号不会导致此版本冲突。

appearance.theme.export 写入新的 JSON 文件，默认导出当前外观，也可导出 settings 指定的未提交预览。格式为 margin-reader.theme/v1，仅含 schema/title/settings，不包含执行代码、CSS、URL、图片、字体文件、文档路径或凭据。appearance.theme.inspect 接受工作区 path 或客户端上传的 content，二者互斥，最多 64 KiB；只检查不应用。appearance.theme.import 需要预检返回的 expectedSha256 和 appearance.get 返回的 expectedAppearanceVersion，检查后只合并外观。界面导入也先检查，只在明确“应用外观”后保存；取消不写入。

Cmd/Ctrl K 的工具检索复用原有操作入口，按学习集、卡片和文档状态说明不可用原因。工具区支持按场景分组，所有操作仍可从“全部”恢复。阅读工具保持单行，可横向滚动并通过键盘访问；没有为了缩短工具栏删除功能。

选中卡片后 F2 或“详情”打开非模态卡片编辑。标题、正文、笔记、标签、颜色保存走 study.card.update / expectedRevision。摘录正文保存为 editedText，原文及截图保留；实时引用的标题与正文在原卡片中编辑。Cmd/Ctrl Enter 保存。遇到并发修改、延迟返回或导航尝试时保留编辑草稿，明确放弃才删除草稿；宿主关闭检查也拒绝未保存草稿。草稿仅在当前窗口内存中，不保证浏览器崩溃后的自动恢复。

在学习集中打开 PDF，可使用“文本框”然后单击原页，或在空白处右击，再创建定位文本框；拖入纯文本先显示确认内容。取消不产生笔记。定位调用既有 study.note.place，使用原始页内坐标和文档版本；折叠页面的显示坐标会映射回原件。此入口要求当前学习集已包含该 PDF，不声称已经提供独立文档的所有创建手势。

library.backup.job.create 接受调用者生成的稳定 jobId 和新的 .mrbackup path，冻结创建时的元数据及文件清单，并返回 revision 与进度。相同 UUID 的重试恢复同一个任务。list 只列出 UUID、时间和加密状态；加密任务 get/step/publish 每次需要口令，checkpoint 中不存明文口令。job API 不修改实时文库的 revision；任务 revision 独立。

library.backup.job.step 显式推进复制/校验。复制按 4 MiB 块，maxChunks 默认8、最多32；首次处理文件先用原生 SHA-256 读取完整文件，最终校验也以整个文件为单位，故“批次数”不是处理时长上限。maxFiles 默认1、最多4。中断后复制从已提交的块继续；当前尚未完成的整文件哈希或验证会重做该文件。后台没有持续运行的备份服务；界面暂停/关闭后不发出后续批次，正在运行的当前批次会完成。进程异常退出的安全锁最长约120秒后可重试。

ready 后调用 library.backup.job.publish 发布为标准 margin-reader.backup/v2 目录包，可用原有 inspect/restore。没有通过完整校验之前不会发布可用备份。已发布结果的重复请求可恢复同一任务回执；超时或发布后回执写入失败必须先 get，不要创建新 UUID。已有同名空目录也不覆盖。极短的“已预留空目录、尚未 rename”进程中断窗口可能留下空目标目录；插件会报 ALREADY_EXISTS 并保留检查点，需要用户核对该空目录后处理，不能据此宣称完全覆盖断电恢复。

快照语义：元数据固定为准备时版本。已复制完整的文件独立保留；后续新建文件、实时笔记编辑不加入本次备份；尚未复制完成的原件发生版本变化时拒绝混合备份。检查点有32任务上限，metadata 64 MiB 结构预算，完整备份沿用 1 TiB / 100000 文件预算；预算上限不表示已实测该容量。library.backup.job.discard 仅清理这个任务的私有检查点与临时副本，保留原件、学习数据及已发布备份，损坏检查点也能显式清理。

员工使用获授权的同一 CLI 入口调用这些 API；含口令的 JSON 优先从标准输入传入，勿写入 shell 历史。宿主 mailbox 会按标准协议临时落盘请求，权限和生命周期仍由宿主负责。真实断电、外置盘热拔插和其它操作系统不是模拟进程结束测试的等价证明。

${fs.readFileSync(path.join(root,'docs/BOOK_LIBRARY.md'),'utf8')}

${fs.readFileSync(path.join(root,'docs/MINDMAP_STUDIO.md'),'utf8')}

## Files

用户原文件保留在实际目录中，可用 Finder/终端管理。文本以 UTF-8 为推荐，兼容 UTF-16 BOM 和 GB18030 回退。直接修改文件后，刷新/重新打开文档重建索引；旧内容读取会返回 SOURCE_CHANGED。原始文件重命名请优先用 fs.move，才能保留稳定文档 ID；外部重命名会被视作新路径。

内部状态：\`.margin-reader/state.json\` 保存文档 ID、目录、阅读位置、设置、上传与回收站索引；\`cache/\` 保存可重建的解析结果；\`uploads/\` 是未完成上传；\`trash/<id>/item\` 是可恢复删除的原件。内部状态只能通过 API 修改，不要手改 JSON 或锁目录。
学习集和卡片保存在 state.json 的 studySets；持久 PNG 在 .margin-reader/study-assets/<setId>/<cardId>.png。study-assets 属于用户数据，不是可清理的派生缓存；完整备份必须连同 state.json 保存。软删除仍保留快照文件供恢复。
自定义目录不写回 PDF/EPUB/Word 原件。外部正文变化后自定义目录保留，失效定位标记 unresolved，需明确重新绑定。toc.reset 才会用原文目录替换自定义目录。
web.import 生成自包含 HTML，记录原 URL、保存时间和可下载的内嵌图片。没有必要依赖原网站即可读取已保存正文；失败图片以占位和警告说明。仅抓取用户指定页面，不递归爬整站，不使用已有浏览器登录状态。
完整备份：停止写入后复制整个 workspace（含 .margin-reader）。只复制原件不会带走自定义目录、阅读位置和回收站。JSON 导出携带当前目录，HTML/TXT/Markdown 为便携阅读导出。PDF 的此类导出仅含文本层，扫描页没有 OCR 文字。原 PDF 可直接从文件夹复制。

## Errors

错误格式：\`{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"...","data":{"code":"CONFLICT","details":{}}}}\`。
- -32600 / INVALID_REQUEST：无效 JSON-RPC 请求；-32601 / METHOD_NOT_FOUND：未声明方法；-32602 / INVALID_PARAMS：参数缺失、类型或范围错误。
- SCOPE_DENIED、INVALID_PATH、PERMISSION_DENIED：越界、链接、受保护目录或系统权限拒绝。
- NOT_FOUND、ALREADY_EXISTS、CONFLICT、SOURCE_CHANGED：路径/数据已变化，重新读取后明确重试。
- UNSUPPORTED_FORMAT、INVALID_DOCUMENT、DRM_UNSUPPORTED、PASSWORD_REQUIRED、DEPENDENCY_MISSING：格式、损坏文件、版权保护或解析依赖限制。
- NOT_MEMBER：文档未加入当前学习集，先增加关联；CAPTURE_FAILED/CAPTURE_TIMEOUT：摘录图像生成失败，原件和已保存卡片保持不变。
- TOO_LARGE、PARSE_TIMEOUT、UPLOAD_LIMIT、INCOMPLETE_UPLOAD、CHECKSUM_MISMATCH：容量、资源或上传校验失败。
- URL_BLOCKED、INVALID_URL、HTTP_ERROR、NETWORK_ERROR、FETCH_TIMEOUT、TOO_MANY_REDIRECTS、ARTICLE_UNAVAILABLE：链接下载或正文提取失败。不会绕过付费墙/验证码/登录。
- STATE_CORRUPT、CACHE_CORRUPT：内部状态或缓存损坏；不自动清空用户数据。state 需从备份恢复；缓存可 document.open refresh:true 重建。
- HOST_UNAVAILABLE、AUTH_REQUIRED、REQUEST_TIMEOUT：员工传输不可用。宿主退出或凭据丢失明确失败，不创建另一个独立文库。\n- INVALID_RESPONSE：宿主返回格式错误或请求 ID 不匹配；RUNTIME_CLOSED：传输已关闭。已提交的请求可能已经执行，error.data.details 的 requestId、method、mayHaveCompleted 用于核对；先检查业务状态，不自动重发或覆盖。

并发提交使用原子写入、fsync、文件锁与失败回滚。异常断电不能承诺跨多个磁盘文件的完整事务；发生崩溃后应保留工作区备份和 uploads/trash 原件再诊断。默认没有永久清空回收站接口。

## Compatibility

Agents Company CLI Plugin Contract v1；CommonJS runtime/CLI；Node >=22.13。运行依赖锁定并随 build:plugin 产物携带。UI 是相对静态资源，使用宿主 rpc/events/data 路由；独立 serve 使用等价的令牌回环服务，无 Electron 依赖。UI 完成初始化发送 ready；关闭先 flush 未完成写入，未保存草稿或保存失败会明确拒绝 flush。宿主仅负责窗口，不参与领域逻辑。

PDF 使用 PDF.js 原页画布与可选择文本层；Core 使用同版本提取原目录/全文。DOC 为纯文本读取（不保留旧 Word 图文版式）；DOCX、EPUB、MOBI/KF8 为流式正文，不能承诺所有排版与商业阅读器逐像素一致。RTF 需要 macOS 系统 textutil，其余核心格式不需要 Calibre/Office。ODT/FB2 是结构化文本读取。DRM 电子书不支持。扫描 PDF 可看原页，OCR 不在本轮范围。
网页抓取只允许公开 HTTP(S) 资源；每次重定向与图片下载都检查地址，拒绝内网和 DNS 重绑定。页面本体/图片大小、数量与超时有界。需要登录、客户端渲染或反爬验证的页面可能无法自动提取。项目不代表 MarginNote 官方，不兼容其私有数据库；图标为独立绘制的相近蓝白视觉。
宿主当前插件栏只渲染名称首字母，未提供自定义图标字段。本插件提供页面与 favicon 图标，不修改宿主的图标协议。
`;
  fs.writeFileSync(path.join(root, 'API.md'), text);
}
if (require.main === module) generate();
module.exports = { generate };
