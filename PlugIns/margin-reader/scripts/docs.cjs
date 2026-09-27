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

CLI-first、本地优先的文档阅读器。PDF 原页阅读，DOC/DOCX、EPUB、MOBI/KF8 和常见文本/图片读取；公开网页正文与图片离线保存；真实文件树、大文件夹视图；原文目录提取、自定义章节、缩进、退级、排序、全文搜索和阅读位置保存。
v0.7.0 提供图层/压感/套索、脑图手写、文档对照、笔记本/页面组合、留白、复合卡片、牌组/遮挡/挖空/参数训练，并保留学习集、摘录与独立笔记卡、标签检索、关联、大纲/卡片/脑图视图、撤销重做、离线 FSRS 复习、PDF 手写与文档书签；不含 OCR 或 DRM 解密。

## Workspace

独立运行时必须提供已有目录：\`node cli.cjs --workspace /absolute/library ...\`，也可使用 AGENTS_WORKSPACE。所有 API 路径均相对此目录，使用 / 分隔。根目录用 . 表示。
宿主 createPlugin 传入的 workspace 就是完整授权范围。不会读取父目录、同级员工或全局文库。路径穿越、绝对路径、软链接、硬链接、.git、.agents-company 和 .margin-reader 业务访问均被拒绝。
Work Team 使用本插件目录下 workspaces/<Team 名称>；员工入口固定到员工自己的子目录。员工 mailbox 使用宿主授予的身份，不回退到用户全局凭据，也不回退到另一个工作区。
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
./.agents-company/bin/margin-reader api fs.tree --data '{}'
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
目录编辑必须提交最近读取的 expectedRevision。冲突时重新 toc.list，对比后明确重试，不会自动覆盖。fs.write 更新已存在文本时必须提供 fs.list 返回的 expectedVersion。其他文件操作也拒绝覆盖目的地。阅读位置/设置采用最后写入者生效；多个进程用工作区文件锁串行提交。
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

study.view.set 保存 map/outline/cards/review 视图。study.undo/redo 在事务锁内恢复本学习集最近编辑（最多 30 步、8 MiB 元数据），revision 只递增；新编辑清空 redo。图片不复制、不删除。视图切换、打开/删除/恢复整个学习集及导出不进入编辑历史。该历史用于撤销，不是备份。大于历史容量的编辑仍可保存，但旧的撤销项会被移除。

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

study.search 在当前工作区的活动学习集中查找卡片；study.card.reference 保留目标 set/card UUID，通过来源跳转可回到对应子脑图。study.card.render 返回 Markdown/公式的消毒 HTML，并给出文字中命中其他卡片标题的 titleLinks；重复标题返回候选，不擅自选择。文本和公式渲染不执行脚本或下载外部图片。

study.deck.* 管理本地牌组及可恢复归档。review.configure 可指定 deckId、cloze（用 {{答案}} 标记）、occlusions（图片上的归一化矩形）；普通摘录图在翻面前隐藏，遮挡题只显示带遮罩的图片。review.stats 返回当前活动卡片的历史次数、每日计数和观察到的回忆成功率。review.settings 设置目标记忆保持率、最长间隔和当前牌组。review.optimize 使用固定版本 @open-spaced-repetition/binding 0.5.0 离线训练，至少需要 50 个跨日观察；训练期间出现其他编辑会拒绝保存并保留原参数。训练结果也可撤销。

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
- HOST_UNAVAILABLE、AUTH_REQUIRED、REQUEST_TIMEOUT：员工传输不可用。超时操作可能已经执行，先检查状态再重试。

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
