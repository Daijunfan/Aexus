---
schema: agents-company.cli/v1
plugin: margin-reader
version: '0.7.0'
workspace: required
---

# Margin Reader CLI API

## Purpose

CLI-first、本地优先的文档阅读器。PDF 原页阅读，DOC/DOCX、EPUB、MOBI/KF8 和常见文本/图片读取；公开网页正文与图片离线保存；真实文件树、大文件夹视图；原文目录提取、自定义章节、缩进、退级、排序、全文搜索和阅读位置保存。
v0.7.0 提供图层/压感/套索、脑图手写、文档对照、笔记本/页面组合、留白、复合卡片、牌组/遮挡/挖空/参数训练，并保留学习集、摘录与独立笔记卡、标签检索、关联、大纲/卡片/脑图视图、撤销重做、离线 FSRS 复习、PDF 手写与文档书签；不含 OCR 或 DRM 解密。

## Workspace

独立运行时必须提供已有目录：`node cli.cjs --workspace /absolute/library ...`，也可使用 AGENTS_WORKSPACE。所有 API 路径均相对此目录，使用 / 分隔。根目录用 . 表示。
宿主 createPlugin 传入的 workspace 就是完整授权范围。不会读取父目录、同级员工或全局文库。路径穿越、绝对路径、软链接、硬链接、.git、.agents-company 和 .margin-reader 业务访问均被拒绝。保留目录名同时防止大小写、Unicode 兼容写法、尾随点/空格和元数据流别名绕过；公开列表、递归目录操作、备份清单与变更监听使用同一规则。
Work Team 的实际根目录由宿主提供；开发环境与打包环境的位置可能不同，不要自行拼接或假定固定路径。员工入口固定到其获授权的子目录，能够操作此范围内全部已声明功能，但不会因此取得 Team 根目录、同级员工或其他 Team 的内容。员工 mailbox 使用宿主授予的身份，不回退到用户全局凭据，也不回退到独立运行时或另一个工作区。
用户查看员工成果时，使用 agents plugin open margin-reader --employee EMPLOYEE_ID 打开同一授权文库；省略作用范围的侧栏入口、Team 根目录和员工目录不是同一份学习集状态。
`import FILE --to relative/path` 在调用者已经有权限的 CLI 进程内读取 FILE，随后使用 import.begin/chunk/finish API 上传；运行时没有任意外部文件读取 API。原始来源文件不会移动或删除。

## Quick start

在插件目录执行：

```sh
mkdir -p /tmp/my-reader-library
node cli.cjs --workspace /tmp/my-reader-library mkdir Books
node cli.cjs --workspace /tmp/my-reader-library api fs.write --data '{"path":"Books/welcome.md","content":"# Welcome\n\nRead locally.\n\n## Next\n\nAnother section."}'
node cli.cjs --workspace /tmp/my-reader-library open Books/welcome.md
node cli.cjs --workspace /tmp/my-reader-library tree
# 用 open 返回的 result.id 和 result.revision 替换下例值。
node cli.cjs --workspace /tmp/my-reader-library api toc.add --data '{"id":"DOCUMENT_ID","expectedRevision":1,"title":"自定义章节","locator":{"section":0}}'
node cli.cjs --workspace /tmp/my-reader-library read DOCUMENT_ID --text
node cli.cjs --workspace /tmp/my-reader-library import /path/to/book.pdf --to Books/book.pdf
node cli.cjs --workspace /tmp/my-reader-library url https://example.com --folder Books
node cli.cjs --workspace /tmp/my-reader-library serve
```

serve 只输出本机令牌 URL，不自动打开浏览器。关闭时 Ctrl+C。完全无窗口的读取、管理和编辑不需要 serve。

宿主集成：

```sh
agents plugin install /absolute/path/to/margin-reader/dist-plugin
agents plugin describe margin-reader
agents plugin call margin-reader fs.list --team 'Reader Team' --params '{"path":"."}'
agents plugin open margin-reader
# 员工使用自身的固定作用范围入口：
margin-reader help study.card.create
margin-reader schema study.search
margin-reader api fs.tree --data '{}' 
```

API 返回完整 JSON-RPC 2.0：`{"jsonrpc":"2.0","id":"request-id","result":{...}}`。CLI 失败返回 error 且退出码非零。`--data @file.json` 或 `--data -` 可读取 JSON 文件/标准输入。`--text` 仅把 document.content 的正文输出为纯文本。

## Commands

机器可读的完整参数约束见 [schema.json](schema.json)。通用入口：
`margin-reader --workspace DIR api METHOD --data JSON`。
CLI、renderer HTTP、员工 mailbox 和 runtime.request 使用同一个实现与校验；不接受 schema 外的方法或参数。

### system.info

Report parser capabilities, limits, plugin version and workspace.

性质：读取；员工访问：workspace。

无参数。

### fs.list

List the immediate contents of a folder.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | Folder path; default is . |

### fs.tree

Read the expandable filesystem tree with explicit truncation information.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | Root folder; default is . |
| depth | number | 否 | Maximum tree depth; default 32. |

### fs.mkdir

Create a real folder and any missing ancestors without overwriting files.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |

### fs.write

Create or update a UTF-8 text document. Updating requires expectedVersion.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| content | string | 是 | UTF-8 document text. |
| expectedVersion | string | 否 | Version from fs.list; required when the destination already exists. |

### fs.move

Move or rename a file/folder; preserve document IDs and refuse existing destinations.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| target | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| expectedVersion | string | 否 | Optional source version for optimistic concurrency. |

### fs.copy

Copy a file/folder without overwriting. Copied documents get independent IDs when opened.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| target | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |

### fs.trash

Move a file/folder into recoverable plugin trash, never permanently delete it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| expectedVersion | string | 否 | Optional source version for optimistic concurrency. |

### fs.batch

Move, copy or recoverably trash selected workspace files with preflight checks and rollback.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| action | string | 是 | Batch operation. 可选：move, copy, trash |
| items | array | 是 | 1-500 items: {path,expectedVersion}. Read source versions from fs.list. |
| folder | string | 否 | Existing destination folder for move/copy. Omit for trash. Names are preserved. |

### fs.trash.list

List recoverable deleted items.

性质：读取；员工访问：workspace。

无参数。

### fs.restore

Restore a trashed item. Refuse conflicts; optionally select a new target.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| trashId | string | 是 | Trash ID. |
| target | string | 否 | New relative path; default is the original path. |

### import.begin

Begin a resumable file upload; bytes remain in private staging until finish.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| totalBytes | number | 是 | Exact file size; maximum 512 MiB. |

### import.status

Read a pending upload and its next expected byte offset.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| uploadId | string | 是 | Upload ID. |

### import.chunk

Append one base64 chunk, checking its exact sequential offset.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| uploadId | string | 是 | Upload ID. |
| offset | number | 是 | Expected byte offset. |
| contentBase64 | string | 是 | Canonical base64, at most 4 MiB decoded. |

### import.finish

Finalize an upload, verify length/hash, save the original and parse it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| parse | boolean | 否 | False stores an uploaded original without registering a document. MRPKG files are always stored without parsing. |
| uploadId | string | 是 | Upload ID. |
| sha256 | string | 否 | Optional expected lowercase SHA-256 digest. |
| password | string | 否 | Optional PDF password, never persisted. |
| activate | boolean | 否 | Select the imported document for reading; default true. False imports without changing the current document. |

### import.abort

Remove a pending upload, leaving existing documents untouched.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| uploadId | string | 是 | Upload ID. |

### web.import

Save a public article or document URL offline, including downloadable raster images.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| url | string | 是 | Public HTTP(S) URL. No login/paywall bypass. |
| folder | string | 否 | Destination folder; default is . |
| name | string | 否 | Optional saved document name. |

### document.open

Parse a workspace file, import its original outline and return stable metadata.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| password | string | 否 | Optional PDF password, never persisted. |
| refresh | boolean | 否 | Rebuild the parsed cache while preserving custom outline edits. |
| activate | boolean | 否 | Select the document for reading; default true. False leaves navigation unchanged. |

### document.preview

Render a bounded PNG cover/thumbnail without changing document registration, reading position or outline. Derived cache is disposable.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |
| expectedVersion | string | 否 | Optional version from fs.list; stale requests fail with CONFLICT. |
| page | number | 否 | One-based PDF thumbnail page; default 1. |

### document.get

Get document metadata and whether the source changed externally.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |

### document.content

Read one section/page as sanitized HTML and searchable plain text.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| section | number | 否 | Zero-based section; default 0. |
| page | number | 否 | One-based PDF page; overrides section. |

### document.search

Find literal text across the document and return jumpable reading locators.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| query | string | 是 | Search text. |
| caseSensitive | boolean | 否 | Case-sensitive matching; default false. |
| limit | number | 否 | Maximum matches; default 100. |

### document.export

Export searchable content to a new portable text, Markdown, HTML or JSON file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| format | string | 是 | Export format. 可选：txt, md, html, json |
| path | string | 是 | Workspace-relative path. Absolute paths, traversal and reserved metadata are rejected. |

### toc.list

Get the editable document outline and revision.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |

### toc.add

Add a chapter at any valid locator and hierarchy position.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| title | string | 是 | Chapter title, 1–500 characters. |
| locator | object | 是 | PDF: {page:1,pageOffset:0}; legacy offset remains accepted; audio/video: {time:0,endTime?:10}; flow document: {section:0,anchor:"heading-id"}. |
| parentId | string / null | 否 | Parent chapter ID; null means top level. |
| index | number | 否 | Zero-based sibling insertion index; omitted means append. |

示例参数：

```json
{
  "id": "DOCUMENT_ID",
  "expectedRevision": 1,
  "title": "Introduction",
  "locator": {
    "page": 1
  }
}
```

### toc.update

Edit a chapter title and/or its jump target.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| nodeId | string | 是 | Chapter ID returned by toc.list. |
| title | string | 否 | New chapter title. |
| locator | object | 否 | PDF: {page:1,pageOffset:0}; legacy offset remains accepted; audio/video: {time:0,endTime?:10}; flow document: {section:0,anchor:"heading-id"}. |

### toc.remove

Delete a chapter; promote its children by default, or remove its whole subtree.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| nodeId | string | 是 | Chapter ID returned by toc.list. |
| mode | string | 否 | Child handling; default promote. 可选：promote, subtree |

### toc.move

Reparent or reorder a chapter with its entire subtree. Cycles are rejected.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| nodeId | string | 是 | Chapter ID returned by toc.list. |
| parentId | string / null | 否 | Parent chapter ID; null means top level. |
| index | number | 否 | Zero-based sibling insertion index; omitted means append. |

### toc.indent

Indent under the preceding sibling while preserving descendants.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| nodeId | string | 是 | Chapter ID returned by toc.list. |

### toc.outdent

Outdent one level and place immediately after the former parent.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| nodeId | string | 是 | Chapter ID returned by toc.list. |

### toc.reset

Replace the custom outline with the original parsed document outline.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |

### reader.position.get

Get the durable reading position.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |

### bookmark.list

List local document bookmarks with source validity and optional recoverable deleted entries.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| includeTrashed | boolean | 否 | Include removed bookmarks. |

### bookmark.add

Bookmark a validated page/section without modifying the original file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| title | string | 是 | Bookmark title, 1–200 characters. |
| locator | object | 是 | PDF: {page:1,pageOffset:0}; legacy offset remains accepted; audio/video: {time:0,endTime?:10}; flow document: {section:0,anchor:"heading-id"}. |

### bookmark.update

Rename, recoverably remove or restore a bookmark.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| expectedRevision | number | 是 | Current document outline revision. Stale revisions fail with CONFLICT. |
| bookmarkId | string | 是 | Bookmark UUID. |
| title | string | 否 | New title, 1–200 characters. |
| deleted | boolean | 否 | True removes recoverably; false restores. |

### reader.position.set

Validate and persist a jump/reading position. Positions use last-write-wins.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Stable document ID returned by document.open. |
| locator | object | 是 | PDF: {page:1,pageOffset:0}; legacy offset remains accepted; audio/video: {time:0,endTime?:10}; flow document: {section:0,anchor:"heading-id"}. |

### settings.get

Get durable reader appearance and navigation preferences.

性质：读取；员工访问：workspace。

无参数。

### settings.set

Persist preferences through the same API used by the renderer.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| theme | string | 否 | Reader theme. 可选：light, dark, sepia |
| view | string | 否 | Large folder tiles or compact list. 可选：grid, list |
| uiCustomAccent | string / null | 否 | Optional custom #RRGGBB seed; readable text/button shades are derived, null restores the preset. |
| uiCustomGlow | string / null | 否 | Optional custom #RRGGBB decorative glow; null restores the preset. |
| uiBackgroundStrength | number | 否 | Decorative backdrop strength, 0–1. Never changes source paper or ink. |
| expectedAppearanceVersion | string | 否 | Optional fingerprint from appearance.get; compare appearance only and never persist this control field. |
| uiPalette | string | 否 | Visual accent palette; never changes document or annotation colors. 可选：azure, mint, violet, rose, amber, coral, iris, graphite |
| uiBackdrop | string | 否 | Decorative library/card-box backdrop; reading paper is unaffected. 可选：plain, glow, dots, contour |
| uiMotion | string | 否 | Interface motion preference. Operating-system reduced motion always takes precedence. 可选：system, full, reduced |
| fontSize | number | 否 | Flow text size. |
| lineHeight | number | 否 | Flow line height. |
| sidebarWidth | number | 否 | Explorer width. |
| outlineWidth | number | 否 | Outline width. |
| pdfMode | string | 否 | PDF layout: continuous vertical scroll or single-page navigation. 可选：continuous, paged |
| pdfTurnEffect | string | 否 | Paged reading animation; book uses a bounded 3D paper transition; reduced-motion overrides it. 可选：book, none |
| homeSection | string | 否 | Default browser section, independent of the selected reading document. 可选：library, studies |
| studyFolder | string / null | 否 | Current study-folder UUID or null for root. |
| studyLibraryView | string | 否 | Study collection presentation. 可选：grid, list |
| studyDocumentsView | string | 否 | Document presentation within a study set. 可选：grid, list |
| pdfFit | string | 否 | Fit available width or the whole page, without distortion or cropping. 可选：width, page |
| pdfZoom | number | 否 | PDF zoom relative to fit; independent of flow font size. |
| pdfScrollSpeed | number | 否 | Vertical wheel/trackpad speed multiplier. Horizontal gestures always turn one page. |
| pdfFocus | boolean | 否 | Hide explorer and outline to use the full reading width. |
| activeStudySet | string / null | 否 | Active study set UUID or null. |
| studyRatio | number | 否 | Document fraction of the document/mind-map split. |
| brightness | number | 否 | Document brightness multiplier. |
| pdfDarkMode | string | 否 | PDF display colors; original preserves image colors. 可选：original, invert |
| readingMode | string | 否 | Normal or immersive reading. 可选：normal, immersive |
| studyLayout | string | 否 | Document and map arrangement. 可选：columns, rows, document, map |
| studyOrder | string | 否 | Relative document/map order. 可选：document-first, map-first |
| comparisonDirection | string | 否 | Comparison pane arrangement. 可选：auto, columns, rows |
| comparisonRatio | number | 否 | Primary pane fraction. |
| comparisonSecondaryRatio | number | 否 | Second pane fraction of the comparison area in a three-pane view. |
| reviewDefaultFront | string | 否 | Default question source for new review cards in this workspace; existing cards keep their rule. 可选：title, card |
| reviewDefaultReveal | string | 否 | Default group mode for newly configured cards; existing schedules are preserved. 可选：sequential, independent |
| presentationPointers | boolean | 否 | Show transient click/touch points and a pen cursor for local demonstrations; default false. |
| mediaRate | number | 否 | Audio/video playback speed. |
| currentFolder | string | 否 | Current folder path. |
| lastDocument | string / null | 否 | Last open document ID or null. |

### study.mindmap.catalog

Read all map structures, original themes, node shapes, line/arrow styles and creation templates.

性质：读取；员工访问：workspace。

无参数。

### study.mindmap.configure

Configure compact mind-map rendering without replacing the original study cards; undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| patch | object | 是 | enabled; theme; structure; line; lineWidth .5–12; colorMode branch/level/single; #RRGGBB background/textColor; spacing 12–100; branchSpacing 30–220; autoBalance, sameLevelWidth, gradient, shadow, showImages, showTags, motion, minimap; numbering none/decimal/hierarchy/roman/alpha; fontFamily; fontSize 12–32; topicShape, rootShape; topicWidth 100–600. Null resets an override. See catalog for enums. |

### study.mindmap.topics.update

Atomically style selected topics, markers, task labels and non-overlapping rich-title runs.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| cardIds | array | 是 | 1–1000 existing card UUIDs; source snapshots and card IDs are preserved. |
| reset | boolean | 否 | Clear explicit topic styles before applying the patch. |
| patch | object | 是 | shape; fill/textColor/borderColor/branchColor #RRGGBB; borderWidth 0–10; borderDash solid/dash/dot; fontFamily/fontSize 10–48; bold/italic/underline/strike; align left/center/right; width 100–800; structure; side auto/left/right; numbering; branchLine/branchWidth .5–12; shadow/gradient/showImage/showNote; priority 0–9, progress 0–100, status none/todo/doing/done/blocked, symbol, flagColor; task {start,due YYYY-MM-DD,assignee,estimate}; runs [{start,end,bold,italic,underline,strike,color}] use sorted disjoint UTF-16 ranges, at most 100. Null resets a field. |

### study.mindmap.decoration.set

Create or edit a source-preserving boundary, callout or summary bracket. Summary creates an editable topic which can have subtopics.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| decorationId | string | 否 | Existing annotation UUID; omit to create. |
| kind | string | 否 | Required for creation. 可选：boundary, summary, callout |
| cardIds | array | 否 | 1–1000 existing card UUIDs; source snapshots and card IDs are preserved. |
| style | object | 否 | title; shape from catalog.boundaries; color/fill/textColor #RRGGBB; opacity 0–1; dash solid/dash/dot; width .5–10; fontSize 10–32; padding 8–80. Callout requires one topic. Summary requires attached siblings. |

### study.mindmap.decoration.remove

Remove only a visual grouping; the associated topics and summary text remain and the edit is undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| decorationId | string | 是 | Map annotation UUID. |

### study.mindmap.relationship.update

Style or reconnect an existing same-map relationship through the same versioned Core used by drag handles.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| linkId | string | 是 | Existing relationship UUID. |
| from | string | 否 | Optional new source topic UUID. |
| to | string | 否 | Optional new destination topic UUID. |
| label | string | 否 | Optional description, max 200 UTF-16 units. |
| reset | boolean | 否 | Clear custom visual style first. |
| patch | object | 否 | line from catalog.lines; color/textColor #RRGGBB; width .5–12; dash solid/dash/dot; start/end from catalog.arrows; fontSize 10–32; bold; followTopic; bendX/bendY -1000..1000; optional normalized startX,startY,endX,endY. |

### study.mindmap.template.apply

Append an editable original diagram template; never deletes existing cards or documents.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| template | string | 是 | ID from catalog.templates. |
| title | string | 否 | Optional root topic title. |

### study.mindmap.export

Export the shared complete geometry as SVG, PNG or image-based PDF to a new workspace file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| format | string | 是 | Output format. 可选：svg, png, pdf |
| path | string | 是 | New workspace-relative file; extension must match format. Existing destinations are rejected. |
| scope | string | 否 | all expands all topics; visible preserves focus and collapse state. 可选：all, visible |
| rootId | string | 否 | Optional branch root UUID. |
| includeImages | boolean | 否 | Include immutable excerpt images, default true. SVG budget 64 MiB, images 32 MiB; PNG/PDF at most 24 MP and 8192 pixels per dimension. |

### study.mindmap.query

Search and filter the complete topic graph by text, markers, progress, notes or task dates with explicit pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| filter | object | 否 | query, priority 0–9, status none/todo/doing/done/blocked, symbol, progressMin/progressMax 0–100, hasNote, hasImage, dueBefore YYYY-MM-DD, rootId. |
| offset | number | 否 | Zero-based offset. |
| limit | number | 否 | Result count; default 100. |

### study.mindmap.replace

Preview literal topic replacement by default; apply:true changes titles, notes or displayed text atomically and preserves source snapshots.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| query | string | 是 | Literal find text, 1–1000 characters. |
| replacement | string | 是 | Literal replacement; dollar signs have no template meaning. |
| field | string | 否 | Text field. 可选：title, note, display |
| caseSensitive | boolean | 否 | Case-sensitive matching; default false. |
| cardIds | array | 否 | Optional selected card IDs; omitted means the entire study. |
| apply | boolean | 否 | False/omitted previews with no state writes. True applies at the expected revision and supports undo. |

### study.mindmap.outline.import

Append editable topics from indented text or Markdown headings, retaining all existing content.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the current authorized workspace. |
| expectedRevision | number | 是 | Current study revision. A stale edit is rejected without retry. |
| text | string | 是 | Up to 1 MiB, one topic per nonempty line. Two spaces or a tab indent one level; Markdown headings are also accepted. No more than 10000 total cards per study. |
| parentId | string | 否 | Optional existing parent topic UUID. |

### study.mindmap.xmind.inspect

Inspect an unencrypted JSON-based XMind ZIP without creating any study or extracting archive paths.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Existing workspace-relative .xmind file. |
| expectedVersion | string | 否 | Optional file version from fs.list or previous inspection. |

### study.mindmap.xmind.import

Import inspected JSON XMind sheets into independent studies with new identities. Unknown features require explicit allowLossy.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Existing workspace-relative .xmind file. |
| expectedVersion | string | 是 | Required sourceVersion from inspection to prevent stale imports. |
| sheetIds | array | 否 | Optional inspected sheet IDs; omitted imports all sheets. |
| folderId | string | 否 | Optional existing study folder UUID. |
| allowLossy | boolean | 否 | Accept the inspection warnings. No external images, AI, vendor artwork or XML conversion. |
| activate | boolean | 否 | Open the first imported study; default false. |

### study.mindmap.xmind.export

Export one or more studies as a public JSON XMind workbook; source bindings are retained as readable notes, not foreign live reader links.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setIds | array | 是 | 1–50 study UUIDs, one sheet per study. |
| expectedRevisions | object | 是 | Current revision keyed by every selected study UUID. |
| path | string | 是 | New workspace-relative .xmind file; refuses overwrites. |

### study.library.get

Read all study-folder metadata and study summaries. Does not write defaults or read document bytes.

性质：读取；员工访问：workspace。

无参数。

### study.folder.create

Create a named study folder without moving or duplicating any original documents.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| expectedRevision | number | 是 | Current study-library revision from study.library.get; independent of card edits. |
| title | string | 是 | Folder name, 1–100 characters. |
| parentId | string / null | 否 | Study-folder UUID; null means the study library root. |

### study.folder.update

Rename or move a study folder; reject duplicate names, cycles and hierarchy depth above 64.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| expectedRevision | number | 是 | Current study-library revision from study.library.get; independent of card edits. |
| folderId | string | 是 | Existing study-folder UUID. |
| title | string | 否 | New name. |
| parentId | string / null | 否 | Study-folder UUID; null means the study library root. |

### study.folder.remove

Move an empty study folder to recoverable folder trash. Move its studies and child folders first.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| expectedRevision | number | 是 | Current study-library revision from study.library.get; independent of card edits. |
| folderId | string | 是 | Existing empty study-folder UUID. |

### study.folder.restore

Restore a removed study folder, optionally choosing a new valid parent or name.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| expectedRevision | number | 是 | Current study-library revision from study.library.get; independent of card edits. |
| folderId | string | 是 | Deleted study-folder UUID. |
| parentId | string / null | 否 | Study-folder UUID; null means the study library root. |
| title | string | 否 | Optional new name if the original name is occupied. |

### study.library.move

Move 1–500 study sets to a study folder or the root atomically; preserve set/card IDs, histories and original files.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| expectedRevision | number | 是 | Current study-library revision from study.library.get; independent of card edits. |
| setIds | array | 是 | Study set UUIDs. |
| folderId | string / null | 是 | Study-folder UUID; null means the study library root. |

### library.backup.job.create

Prepare a resumable local backup with frozen metadata and original-file versions. Does not copy the full library or publish an archive.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| jobId | string | 是 | Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response. |
| path | string | 是 | New workspace-relative .mrbackup destination. |
| password | string | 否 | Encrypted checkpoint passphrase. Required again after restart; never stored in the checkpoint. |

### library.backup.job.list

List workspace-local checkpoint UUIDs, creation times and encryption flags without exposing encrypted paths or source filenames.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| offset | number | 否 | Offset. |
| limit | number | 否 | Page size; default 32. |

### library.backup.job.get

Read exact resumable backup progress; recover a publication receipt after an interrupted reply without writing data.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| jobId | string | 是 | Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response. |
| password | string | 否 | Encrypted checkpoint passphrase. Required again after restart; never stored in the checkpoint. |

### library.backup.job.step

Advance one committed chunk batch or verify whole files. No hidden background worker. Copying resumes at committed chunks; interrupted file hashing/verification restarts that file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| jobId | string | 是 | Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response. |
| password | string | 否 | Encrypted checkpoint passphrase. Required again after restart; never stored in the checkpoint. |
| expectedRevision | number | 是 | Latest backup-job revision from create/get/step, independent of the live library revision. |
| maxChunks | number | 否 | Copy at most 1–32 chunks of 4 MiB; default 8. Initial native hashing of a file is additional work. |
| maxFiles | number | 否 | Verify at most 1–4 complete files per request; default 1. Memory remains chunk-bounded; duration depends on file size. |

### library.backup.job.publish

Publish a fully verified checkpoint as a standard segmented backup without replacing existing directories. Repeating an interrupted publication recovers the same result.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| jobId | string | 是 | Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response. |
| password | string | 否 | Encrypted checkpoint passphrase. Required again after restart; never stored in the checkpoint. |
| expectedRevision | number | 是 | Latest backup-job revision from create/get/step, independent of the live library revision. |

### library.backup.job.discard

Explicitly remove only this job’s private scratch copies and checkpoint. Preserve every original and all already-published backups. Also cleans a damaged checkpoint.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| jobId | string | 是 | Caller-generated stable UUID within this workspace. Reuse it to recover an uncertain creation response. |

### appearance.get

Read portable appearance and its optimistic-concurrency fingerprint without writing or opening a window.

性质：读取；员工访问：workspace。

无参数。

### appearance.theme.inspect

Validate a local theme before applying; reject executable CSS, URLs, assets, unknown keys and malformed data.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | Existing JSON theme path in this workspace; exclusive with content. |
| content | string | 否 | Client-uploaded theme JSON, at most 64 KiB; exclusive with path. |

### appearance.theme.export

Export only presentation fields to a new JSON file; no navigation, documents, credentials or font files.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | New workspace-relative .json file; never overwrite an existing file. |
| title | string | 否 | Portable theme name, 1–80 characters. |
| settings | object | 否 | Optional preview appearance fields: theme, uiPalette, uiBackdrop, uiMotion, uiCustomAccent, uiCustomGlow, uiBackgroundStrength. Omit for saved appearance. |

### appearance.theme.import

Apply an inspected theme atomically after checking its bytes and current appearance version. Preserve all nonappearance settings.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 否 | Existing JSON theme path in this workspace; exclusive with content. |
| content | string | 否 | Client-uploaded theme JSON, at most 64 KiB; exclusive with path. |
| expectedSha256 | string | 是 | SHA-256 from appearance.theme.inspect. |
| expectedAppearanceVersion | string | 是 | Fingerprint from appearance.get. Unrelated navigation does not invalidate it. |

### study.canvas.ink.add

Draw a freehand stroke in mind-map world coordinates; independent of node layout.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| points | array | 是 | 2–2048 [x,y] or [x,y,pressure] world points in 0–100000; pressure 0–1. |
| color | string | 是 | Palette color. |
| width | number | 否 | World-unit stroke width. Omit to use canvasWidth, default 3. |
| layerId | string | 否 | Layer ID. |
| geometry | object | 否 | Optional raw-stroke intent: shape, straighten (off/auto/always), perfectShape, heldMs, aspectRatio (physical height/width), rulerAngle. Omitted settings follow study.ink.settings; heldMs defaults 0. The Core computes the saved path. Explicit scribbleErase:true permits a held dense scribble to erase; scribbleScope is scope or map, eraseRadius controls its radius, and document bands constrain visible source intervals. ruler optionally supplies {edges:[{a:[x,y],b:[x,y],group:top/bottom,t0:0..1,t1:0..1}],tolerance}; endpoints and tolerance use stroke coordinates. Edge positions t0/t1 permit discontinuous source segments across folded regions. Core snaps only a nearby along-edge gesture. |
| brush | string | 否 | Saved brush style. 可选：pen, pencil, highlighter |
| opacity | number | 否 | Stroke opacity. |

### study.canvas.ink.remove

Erase canvas handwriting with undo support.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| strokeId | string | 是 | Stroke ID. |

### study.card.ink.add

Add handwriting bound to a card; it follows card moves and is undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| cardId | string | 是 | Card UUID. |
| imageBound | boolean | 否 | Bind handwriting to the image; clipping, image edits and layout changes retain its image location. Default attaches a stroke wholly inside supplied imageBounds; false keeps card-frame ink. |
| imageBounds | object | 否 | Image bounds normalized to the card frame at drawing time; enables precise highlighter-to-image mapping. |
| aspectRatio | number | 否 | Card frame width / height at drawing time. |
| points | array | 是 | 2–2048 normalized card [x,y] or [x,y,pressure] points; pressure is 0–1. Card-owned gestures may extend outside the card (coordinates within ±1000); image-bound gestures are clipped to imageBounds. |
| color | string | 是 | Palette color. |
| reviewSide | string | 否 | Optional dedicated flashcard handwriting side; omission keeps ordinary card ink. 可选：front, back, both |
| width | number | 否 | Normalized stroke width. Omit to use cardWidth, or the legacy shared width, default 0.004. |
| layerId | string | 否 | Layer ID; default is default. |
| geometry | object | 否 | Optional raw-stroke intent: shape, straighten (off/auto/always), perfectShape, heldMs, aspectRatio (physical height/width), rulerAngle. Omitted settings follow study.ink.settings; heldMs defaults 0. The Core computes the saved path. Explicit scribbleErase:true permits a held dense scribble to erase; scribbleScope is scope or map, eraseRadius controls its radius, and document bands constrain visible source intervals. ruler optionally supplies {edges:[{a:[x,y],b:[x,y],group:top/bottom,t0:0..1,t1:0..1}],tolerance}; endpoints and tolerance use stroke coordinates. Edge positions t0/t1 permit discontinuous source segments across folded regions. Core snaps only a nearby along-edge gesture. |
| brush | string | 否 | Saved brush style. 可选：pen, pencil, highlighter |
| opacity | number | 否 | Stroke opacity. |

### study.card.ink.remove

Erase a card-bound stroke with undo support.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| cardId | string | 是 | Card UUID. |
| strokeId | string | 是 | Stroke UUID. |

### document.list

List registered document metadata without parsing full document caches or changing reading state.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| ids | array | 否 | Optional document IDs to return. |

### document.fold

Collapse selected PDF pages into expandable strips, preserving their contents and annotations.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| pages | array | 是 | Complete list of folded page numbers; empty restores all. |

### pdf.compose

Create a new PDF by combining, reordering, cropping, rotating or inserting pages; preserve all source files.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | New workspace-relative PDF filename. |
| title | string | 否 | Document title. |
| pages | array | 是 | 1–2000 page specs: {documentId,expectedSourceVersion,page,rotation?:0\|90\|180\|270,crop?:{x,y,width,height}}; crop is normalized to the unrotated source CropBox with top-left origin. Blank pages: {blank:true,width?,height?,paper?:plain\|lined\|grid}. |
| activate | boolean | 否 | Select the new document; default true. |

### reader.comparison.set

Persist an independent comparison document/position without moving the primary reader.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| documentId | string / null | 是 | Document UUID, or null to close comparison. |
| locator | object | 否 | PDF page/pageOffset or flow section/anchor; required when documentId is non-null. |
| slot | number | 否 | Comparison pane slot; 1 is the second document, 2 is the third. |

### reader.tabs.close

Close a document tab without deleting its source or reading position.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |

### study.layer.create

Create an independent visible/unlocked handwriting layer and select it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| title | string | 是 | Layer name. |

### study.layer.update

Rename, hide/show, lock/unlock or select a handwriting layer.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| layerId | string | 是 | Layer ID, including default. |
| title | string | 否 | New name. |
| visible | boolean | 否 | Layer visibility. |
| locked | boolean | 否 | Protect strokes from edits. |
| active | boolean | 否 | Select for new handwriting. |

### study.layer.remove

Hide a layer recoverably; strokes remain stored and undo restores it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| layerId | string | 是 | Layer ID, including default. |

### study.layer.merge

Move all strokes to another unlocked layer, then recoverably retire the source.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| layerId | string | 是 | Layer ID, including default. |
| targetId | string | 是 | Layer ID, including default. |

### study.ink.transform

Move selected strokes in page coordinates, recolor or move them to another layer.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| strokeIds | array | 是 | Stroke IDs. |
| dx | number | 否 | Normalized horizontal translation. |
| dy | number | 否 | Normalized vertical translation. |
| color | string | 否 | Palette color. |
| layerId | string | 否 | Target layer ID. |

### study.note.anchor

Attach a note to a source position as an extended note, or detach it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| cardId | string | 是 | Card UUID. |
| documentId | string / null | 是 | Member document UUID, or null to detach. |
| locator | object | 否 | Validated source locator. |
| display | string | 否 | Extended-note presentation. 可选：margin, embedded, collapsed, overlay |
| height | number | 否 | Inserted note height in PDF points; default 150. |
| rect | object | 否 | Overlay box in normalized original-page coordinates: x,y,width,height. |
| layerId | string | 否 | Optional handwriting layer binding. |

### study.map.configure

Change branch layout or focus on a subtree without moving cards.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| layout | string | 否 | Branch layout. 可选：tree, down, radial |
| focusId | string / null | 否 | Focused subtree root; null restores full map. |

### study.cards.group

Create a summary parent for selected cards.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| cardIds | array | 是 | 1–500 card IDs; do not select both an ancestor and descendant. |
| title | string | 是 | Summary/composite title. |

### study.cards.merge

Combine selected cards into a composite card; original excerpts remain attached as collapsible children.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| cardIds | array | 是 | 1–500 card IDs; do not select both an ancestor and descendant. |
| title | string | 是 | Summary/composite title. |

### study.card.render

Render card Markdown and mathematical formulas as sanitized offline HTML.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| cardId | string | 是 | Card UUID. |

### study.search

Search cards across all active study sets in this exact workspace, with explicit pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| query | string | 是 | Case-insensitive literal query of title, text, note and tags; 1–1000 characters. |
| limit | number | 否 | Page size; default 500. |
| offset | number | 否 | Zero-based match offset; default 0. Continue with nextOffset until null. |

### study.card.reference

Create a reference card pointing to a card in another study set in this workspace.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| targetSetId | string | 是 | Study set UUID. |
| targetCardId | string | 是 | Card UUID. |

### study.deck.create

Create a named local review deck.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| title | string | 是 | Deck title. |

### study.deck.update

Rename or recoverably archive/restore a deck; preserve card schedules.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| deckId | string | 是 | Deck UUID. |
| title | string | 否 | New title. |
| deleted | boolean | 否 | Archive or restore. |

### study.review.optimize

Train personalized FSRS parameters locally from at least 50 across-day review observations; reject concurrent edits.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |

### study.review.stats

Read local review counts, daily activity and observed recall rate.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |

### study.review.settings

Configure local FSRS target retention, maximum interval and active deck filter.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision. Conflicts require explicit retry. |
| retention | number | 否 | Desired recall probability. |
| maximumInterval | number | 否 | Maximum interval in days. |
| deckId | string / null | 否 | Active deck UUID or null for all. |

### study.ink.add

Save a PDF handwriting stroke scoped to this study set and source version, without editing the PDF.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| documentId | string | 是 | Member PDF document UUID. |
| expectedSourceVersion | string | 是 | Source version from document.open/get. |
| layerId | string | 否 | Target handwriting layer; default selected layer. |
| page | number | 是 | One-based PDF page. |
| points | array | 是 | 2–2048 normalized [x,y] points, each coordinate between 0 and 1. |
| color | string | 是 | Highlight color. |
| width | number | 否 | Stroke width as a fraction of page width. Omit to use document width, default 0.004. |
| geometry | object | 否 | Optional raw-stroke intent: shape, straighten (off/auto/always), perfectShape, heldMs, aspectRatio (physical height/width), rulerAngle. Omitted settings follow study.ink.settings; heldMs defaults 0. The Core computes the saved path. Explicit scribbleErase:true permits a held dense scribble to erase; scribbleScope is scope or map, eraseRadius controls its radius, and document bands constrain visible source intervals. ruler optionally supplies {edges:[{a:[x,y],b:[x,y],group:top/bottom,t0:0..1,t1:0..1}],tolerance}; endpoints and tolerance use stroke coordinates. Edge positions t0/t1 permit discontinuous source segments across folded regions. Core snaps only a nearby along-edge gesture. |
| brush | string | 否 | Saved brush style. 可选：pen, pencil, highlighter |
| opacity | number | 否 | Stroke opacity. |

### study.ink.remove

Erase one stroke. study.undo restores it within the bounded edit history.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| strokeId | string | 是 | Stroke UUID from study.get.ink. |

### study.note.create

Create an independent text card without requiring a source document or image.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| title | string | 是 | Card title. |
| text | string | 否 | Note body, at most 20000 characters. |
| color | string | 否 | Highlight color. |
| tags | array | 否 | At most 30 unique text tags, each 1–60 characters. |
| submap | boolean | 否 | Create an empty submap root. |
| parentId | string | 否 | Optional parent card UUID. |

### study.cards.query

Find cards by literal text, tag, color and source document within a study set.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| query | string | 否 | Case-insensitive title, text, note and tags query. |
| color | string | 否 | Highlight color. |
| tag | string | 否 | Exact tag. |
| documentId | string | 否 | Source document UUID. |

### study.view.set

Remember the study workbench view for this study set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| view | string | 是 | Workbench view. 可选：map, outline, cards, review |

### study.undo

Undo the latest study edit, including card capture or review rating. Revisions remain monotonic.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |

### study.redo

Redo an undone study edit. New edits clear redo; history is bounded to 30 entries/8 MiB per set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |

### study.link.add

Link two cards across branches without changing their hierarchy.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| from | string | 是 | Card UUID in this study set. |
| to | string | 是 | Card UUID in this study set. |
| toSetId | string | 否 | Optional target study UUID; default this study. |
| label | string | 否 | Link label up to 200 characters. |
| bidirectional | boolean | 否 | Two-way link; default true. |
| curve | array | 否 | Optional drawn path: up to 64 [x,y] world points. |

### study.link.remove

Remove an association; cards remain intact and undo restores the link.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| linkId | string | 是 | Link UUID. |

### study.review.configure

Enable/suspend a flashcard and set front/back text, retaining FSRS schedule.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| cardId | string | 是 | Card UUID in this study set. |
| autoUpdate | boolean | 否 | False freezes the currently generated question. Use study.review.generate to enable automatic rules; editing question content also switches to manual. 可选：false |
| groupNames | object | 否 | Optional group number to display name mapping. Names determine sequential reveal order. |
| frontMode | string | 否 | Question source; new cards follow workspace defaults (title by default). emphasis requires explicit cloze text. Existing unspecified modes retain custom text. 可选：title, card, emphasis, custom |
| backMode | string | 否 | Answer source; new cards default to live full card. 可选：card, custom |
| revealMode | string | 否 | Sequential groups on one question (new default), or independently scheduled groups. Legacy and archived group schedules remain available when switching modes. 可选：sequential, independent |
| enabled | boolean | 是 | Include card in the review queue. |
| front | string | 否 | Question, 1–20000 characters. |
| back | string | 否 | Answer, 1–20000 characters. |
| cloze | string | 否 | Use {{answer}} or grouped {{c1::answer::hint}}. Empty string clears cloze without discarding the saved question/answer. |
| deckId | string / null | 否 | Review deck UUID or null. |
| occlusions | array | 否 | Normalized image masks [{x,y,width,height}], at most 100. |
| occlusionGroups | array | 否 | One group number per image mask. Matching text/image group numbers reveal together in sequential mode; independent mode schedules separate questions. |

### study.review.queue

Get due card IDs, total enrolled cards and earliest due time using the server clock.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| deckId | string | 否 | Optional deck filter. |

### study.review.preview

Preview the four FSRS due times without recording an answer.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| cardId | string | 是 | Card UUID in this study set. |
| variantId | string | 否 | Optional cloze/image question group ID; default earliest due question. |

### study.review.grade

Record an answer and its FSRS schedule/log atomically; stale/repeated submissions fail.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| cardId | string | 是 | Card UUID in this study set. |
| rating | string | 是 | Recall rating. 可选：again, hard, good, easy |
| variantId | string | 否 | Optional cloze/image question group ID; default earliest due question. |

### study.list

List independent study sets without duplicating source files.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| includeTrashed | boolean | 否 | Include recoverable deleted sets. |

### study.create

Create an empty study set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| title | string | 是 | Study set title, 1–200 characters. |
| description | string | 否 | Optional description, up to 4000 characters. |
| folderId | string / null | 否 | Optional study-folder UUID; null or omitted creates at the root. |

### study.get

Read a study set, document memberships, cards, mind map hierarchy and source availability.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |

### study.open

Open the study set overview or a member document through shared navigation state.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| documentId | string | 否 | Optional member document UUID; omit to show the full mind map. |

### study.update

Rename or describe a study set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| title | string | 否 | New title. |
| description | string | 否 | New description. |

### study.remove

Move a study set to recoverable study-set trash; preserve all originals and card images.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |

### study.restore

Restore a deleted study set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |

### study.documents.add

Reference workspace files in a study set. One source may belong to many sets.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| paths | array | 是 | 1–500 relative file paths per request. Existing membership is deduplicated. |

### study.documents.remove

Remove memberships only; original documents and existing cards are preserved.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| documentIds | array | 是 | 1–500 member document UUIDs. |

### study.card.create

Create a colored excerpt and durable PNG snapshot in the shared headless Core.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| documentId | string | 是 | Member document UUID. |
| expectedSourceVersion | string | 是 | Version returned by document.open/get. |
| captureId | string | 是 | Client-generated UUID. Replaying the identical capture is idempotent. |
| text | string | 是 | Selected text, up to 12000 characters. Empty only for PDF region captures. |
| locator | object | 是 | PDF {page,pageOffset?}; flow {section,anchor?}. |
| selection | object | 否 | PDF {rects:[{page,x,y,width,height}]} normalized to the rendered page, or {polygon:{page,points:[[x,y],...]}} for lasso capture. Flow {start,end} UTF-16 offsets in sanitized article textContent. Omit for text-only CLI cards. |
| color | string | 是 | Highlight color. |
| title | string | 否 | Optional card title. |
| parentId | string | 否 | Optional parent card UUID. |
| password | string | 否 | PDF password for this request only; never saved. |

### study.card.update

Edit card title, note, tags, highlight color or collapsed state.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| cardId | string | 是 | Card UUID in this study set. |
| title | string | 否 | Card title, 1–200 characters. |
| note | string | 否 | Plain-text note, at most 20000 characters. |
| text | string | 否 | Body of independent note cards only, at most 20000 characters. Excerpt text remains immutable. |
| editedText | string | 否 | Editable display transcription, at most 20000 characters; keeps immutable original quote and PNG. |
| tags | array | 否 | At most 30 unique text tags, each 1–60 characters. |
| color | string | 否 | Highlight color. |
| collapsed | boolean | 否 | Collapse or expand child cards. |

### study.card.move

Reparent/reorder a card with its descendants; reject cross-set parents and cycles.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| cardId | string | 是 | Card UUID in this study set. |
| parentId | string / null | 否 | Parent card UUID; null/omitted makes a root. |
| index | number | 否 | Zero-based sibling index; omitted appends. |
| x | number | 否 | Optional root world x; provide with y. |
| y | number | 否 | Optional root world y. |

### study.card.remove

Remove a card recoverably; promote its children or remove its subtree.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| cardId | string | 是 | Card UUID in this study set. |
| mode | string | 否 | Default promote. 可选：promote, subtree |

### study.card.restore

Restore a removed card group and its durable images.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| expectedRevision | number | 是 | Current study-set revision; stale writes fail with CONFLICT. |
| trashId | string | 是 | Card-trash group UUID from study.get. |

### study.card.image

Read the durable card PNG as canonical base64, usable without a renderer.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| cardId | string | 是 | Card UUID in this study set. |

### study.export

Export study membership, cards and hierarchy to a new JSON file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study set UUID. |
| path | string | 是 | New workspace-relative JSON filename; never overwritten. |
| includeImages | boolean | 否 | Embed PNG images for portable export; default false. |

### document.av.info

Read duration, media streams and the saved playback position of a local audio/video document.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered media document UUID. |

### study.av.excerpt

Create a durable video frame or audio waveform card from a local media interval, linked to its original timeline.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| documentId | string | 是 | Member media document UUID. |
| expectedSourceVersion | string | 是 | Version from document.open/get. |
| start | number | 是 | Starting time in seconds. |
| end | number | 否 | Ending time in seconds; omit for a point marker. Maximum interval is 600 seconds. |
| title | string | 否 | Optional card title. |
| text | string | 否 | Optional note text, at most 20000 characters. |
| color | string | 否 | Palette or #RRGGBB color. |

### study.card.activate

Select a card and follow the configured document/mind-map linkage, with exact source positioning.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| cardId | string | 是 | Active card UUID in the study set. |
| origin | string | 否 | Interaction origin; default map. 可选：map, document |
| force | boolean | 否 | Explicit source action ignores the automatic linkage preference. |
| excerptId | string | 否 | Optional excerpt part UUID; default first part. |

### study.navigation.set

Configure one-way, two-way or disabled automatic card/document linkage.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| mode | string | 是 | Automatic linkage; default both. 可选：both, map-to-document, document-to-map, off |

### study.annotation.update

Hide/restore an excerpt highlight without deleting the card, or change its annotation style. Undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardId | string | 是 | Active card UUID in the study set. |
| visible | boolean | 否 | False cancels only the document annotation; true restores it. |
| style | string | 否 | Document annotation appearance. 可选：highlight, underline, strike, box |

### study.document.ensure

Get/create the document-only note collection idempotently; a user need not manually create a study set.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered document UUID. |
| activate | boolean | 否 | Activate the document notes; default true. |

### study.cards.batch

Atomically edit selected cards and optional descendants; preserve originals and images.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardIds | array | 是 | 1–10000 stable card IDs; bounded by study capacity. |
| descendants | boolean | 否 | Apply to complete subtrees. |
| patch | object | 是 | color,tags,addTags,removeTags,favorite,collapsed,inMap,annotationVisible,editedText (one card),style. |

### study.cards.copy

Copy cards/subtrees with independent IDs and durable images within authorized study sets.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardIds | array | 是 | 1–10000 stable card IDs; bounded by study capacity. |
| descendants | boolean | 否 | Include descendants; default true. |
| targetSetId | string | 否 | Destination set UUID; default this set. |
| targetRevision | number | 否 | Required for another destination set. |
| parentId | string | 否 | Destination parent UUID. |
| keepSchedule | boolean | 否 | Copy FSRS schedule/logs; default false. |

### study.cards.organize

Build/reuse document or original-outline branches; file selected excerpts by source chapter.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardIds | array | 是 | 1–10000 stable card IDs; bounded by study capacity. |
| by | string | 是 | Grouping mode. 可选：document, toc |

### study.card.position

Save free world position of a root card or direct submap child.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardId | string | 是 | Active card UUID in the study set. |
| x | number | 是 | World x. |
| y | number | 是 | World y. |
| reset | boolean | 否 | Return to automatic layout. |

### study.cards.sort

Reorder siblings by metadata without changing parent relationships.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| parentId | string | 否 | Parent UUID; omitted means roots. |
| by | string | 是 | Sort criterion. 可选：title, created, updated, color, source |
| direction | string | 否 | Default asc. 可选：asc, desc |

### study.submap.configure

Create/dissolve a submap boundary, rename or enter it; preserve card IDs and sources.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardId | string | 是 | Active card UUID in the study set. |
| enabled | boolean | 否 | True creates a submap; false restores the branch. |
| title | string | 否 | New title. |
| open | boolean | 否 | Enter the submap. |

### study.submap.open

Switch current submap; null returns to main map.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardId | string / null | 是 | Submap root UUID or null. |

### study.summary.create

Create a cross-branch summary linked to selected cards without reparenting them.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardIds | array | 是 | 1–10000 stable card IDs; bounded by study capacity. |
| title | string | 是 | Summary title. |
| text | string | 否 | Summary body, up to 20000 characters. |

### study.card.split

Split text into child notes at UTF-16 offsets; preserve original excerpt/image.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| cardId | string | 是 | Active card UUID in the study set. |
| offsets | array | 是 | 1–100 text offsets within the card body. |

### study.board.query

Query cards with compound filters, two-level grouping, sorting and pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| boardId | string | 否 | Saved board UUID. |
| filter | object | 否 | query,titleKeyword (exact semicolon alias; case-insensitive),tags/tagMode,colors,documentIds,kind,inMap,favorite,reviewEnabled,hasImage,createdAfter/Before; compound all/any/not. |
| groupBy | array | 否 | Up to two: color,tag,keyword,document,chapter,created,updated,kind,inMap. |
| sort | string | 否 | outline,title,created,updated,color,source. |
| direction | string | 否 | Default asc. 可选：asc, desc |
| limit | number | 否 | Page size, default 200. |
| offset | number | 否 | Zero-based offset. |

### study.board.save

Create/update a named durable smart card board.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| boardId | string | 否 | Existing board UUID; omit to create. |
| title | string | 是 | Board title. |
| filter | object | 否 | Same filter as study.board.query. |
| groupBy | array | 否 | Up to two grouping fields. |
| sort | string | 否 | Sort criterion. |

### study.board.remove

Remove a board definition without removing cards; undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| boardId | string | 是 | Board UUID. |

### study.board.materialize

Create a grouped map from current board results using linked reference cards.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| boardId | string | 是 | Board UUID. |
| title | string | 否 | Branch title. |

### study.capture.settings

Configure excerpt automation: map assignment, tags/color, destination, style and review enrollment.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| tags | array | 否 | Default tags. |
| color | string | 否 | Palette name or #RRGGBB. |
| inMap | boolean | 否 | Add excerpts to the map. |
| parentId | string / null | 否 | Default parent UUID or null. |
| organize | string | 否 | Automatic grouping. 可选：none, document, toc |
| review | boolean | 否 | Enroll new excerpts in review. |
| deckId | string / null | 否 | Deck UUID or null. |
| annotationStyle | string | 否 | Annotation style. 可选：highlight, underline, strike, box |

### study.appearance.set

Configure study map/card appearance without altering content.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study-set UUID in this workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail with CONFLICT. |
| branchStyle | string | 否 | Branch arrangement. 可选：tree0, tree1, tree2, tree3, tree4, line0, line1, line2, both, frame |
| cardStyle | object | 否 | fontFamily(system/serif/mono or an installed local font family),fontSize(10–36),bold,background(#RRGGBB),width(160–800),height(100–1000),fontScale(.5–2),titleOnly,uppercase,showLinks,compact. |
| inkBehind | boolean | 否 | Place canvas handwriting behind cards. |
| background | string | 否 | Map background #RRGGBB. |
| paper | string | 否 | Map paper pattern. 可选：dots, grid, plain, lined |

### study.links.list

List outgoing and incoming associations, including cross-study targets and unavailable references.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| cardId | string | 是 | Card UUID. |
| limit | number | 否 | Page size, default 100. |
| offset | number | 否 | Zero-based result offset. |

### study.catalog

Read lightweight card identities across the authorized workspace; empty query lists all with pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 否 | Optional study UUID filter. |
| query | string | 否 | Literal title/body/note/tag query; at most 1000 characters. |
| limit | number | 否 | Page size, default 100. |
| offset | number | 否 | Zero-based result offset. |

### study.card.backlinks

List active cards linking or referring to this card across study sets, without expanding workspace scope.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| cardId | string | 是 | Card UUID. |
| limit | number | 否 | Page size, default 100. |
| offset | number | 否 | Zero-based result offset. |

### study.dictionary.lookup

List every exact keyword candidate in the selected dictionaries with explicit pagination, including duplicate card titles.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| term | string | 是 | Exact keyword, 2–200 UTF-16 units; obeys dictionary case preference. |
| limit | number | 否 | Page size, default 100. |
| offset | number | 否 | Zero-based result offset. |

### study.dictionary.match

Match supplied reading text against this workspace dictionary. Return original UTF-16 ranges, source colors and match pagination. Each hit includes at most 20 candidates plus targetTotal; study.dictionary.lookup pages through the rest. Never modifies text or state.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| text | string | 是 | Text to match, at most 262144 UTF-16 code units. No file path is read. |
| offset | number | 否 | Zero-based match offset. |
| limit | number | 否 | Match page size, default 200. |

### study.links.settings

Configure automatic dictionary/title links for this study.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| titleLinks | boolean | 否 | Enable title links; default true. |
| documentLinks | boolean | 否 | Show dictionary links on PDF text layers and flow documents; default true. |
| sources | array / null | 否 | Explicit dictionary scopes [{setId,rootId:null\|SUBMAP_ID,color:blue\|green\|red\|purple}]; up to 256. Overrides dictionarySetIds; an empty array disables all sources; null restores the legacy dictionarySetIds rule. |
| dictionarySetIds | array | 否 | Legacy study UUIDs used as dictionaries when sources is omitted; empty means all active studies. |
| keywordSource | string | 否 | Dictionary keywords. 可选：title, tags |
| caseSensitive | boolean | 否 | Case-sensitive title matching. |
| wholeWords | boolean | 否 | Require word boundaries for Latin terms. |

### study.link.update

Edit an existing association label, direction or drawn path.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| linkId | string | 是 | Association UUID. |
| label | string | 否 | Label, at most 200 characters. |
| bidirectional | boolean | 否 | Two-way when true, one-way when false. |
| curve | array | 否 | Up to 64 [x,y] world-coordinate points; empty restores automatic geometry. |

### link.create

Create a stable, credential-free reader URI. The current workspace remains the authorization boundary.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| kind | string | 是 | Target kind. 可选：card, study, document |
| id | string | 是 | Target UUID. |
| setId | string | 否 | Required for a card target. |
| locator | object | 否 | Optional validated PDF/flow locator for a document. |

### link.resolve

Resolve a stable URI inside this exact workspace without changing navigation.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| uri | string | 是 | margin-reader://card/SET/CARD, study/SET or document/DOC?locator. |

### link.open

Follow a stable URI through the same public navigation state used by the UI.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| uri | string | 是 | Credential-free margin-reader URI. |

### study.comment.list

List ordered card comments and their attachment metadata.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| cardId | string | 是 | Card UUID. |
| includeDeleted | boolean | 否 | Include recoverable deleted comments. |
| reviewSide | string | 否 | Optional front/back filter; includes both-side comments. 可选：front, back |

### study.comment.add

Append a Markdown/formula/text or media comment to a card.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| cardId | string | 是 | Card UUID. |
| reviewSide | string | 否 | Flashcard comment side; old and omitted comments belong to back. 可选：front, back, both |
| text | string | 否 | Comment text, at most 20000 characters. |
| mediaId | string | 否 | Optional existing attachment UUID in this study. |

### study.comment.update

Edit, soft-delete or restore one comment without changing other card content.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| cardId | string | 是 | Card UUID. |
| commentId | string | 是 | Comment UUID. |
| reviewSide | string | 否 | Change the flashcard side. 可选：front, back, both |
| text | string | 否 | Replacement text, at most 20000 characters. |
| deleted | boolean | 否 | True deletes recoverably; false restores. |

### study.comment.move

Reorder an active comment within its card.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| cardId | string | 是 | Card UUID. |
| commentId | string | 是 | Comment UUID. |
| index | number | 是 | Zero-based insertion index among active comments. |

### study.media.import

Import a sanitized image or bounded audio attachment into a card/comment; no external source path is read.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| cardId | string | 否 | Existing card UUID; omit to create an independent card. |
| kind | string | 是 | Attachment type. 可选：image, audio |
| target | string | 否 | Image destination; audio always becomes a comment. 可选：primary, comment |
| title | string | 否 | New card title. |
| name | string | 否 | Display filename. |
| reviewSide | string | 否 | Flashcard attachment side for a comment. 可选：front, back, both |
| text | string | 否 | Optional comment text. |
| mimeType | string | 否 | Required audio MIME: audio/wav,mpeg,mp4,ogg,webm. |
| anchor | object | 否 | Optional source placement: documentId,expectedSourceVersion,locator,display,height,rect,layerId; saved in the same transaction. |
| contentBase64 | string | 是 | Canonical Base64; at most 8 MiB image or 16 MiB audio. |

### study.media.get

Read a saved attachment with MIME, integrity hash and canonical Base64.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| mediaId | string | 是 | Attachment UUID. |

### study.media.transform

Crop/rotate an attached image card and its emphasis/review masks into a new immutable asset; group schedules survive, and undo restores image plus marks.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision; stale edits fail. |
| cardId | string | 是 | Card UUID. |
| crop | object | 否 | Normalized crop {x,y,width,height} inside the image. |
| rotation | number | 否 | Clockwise rotation. 可选：0, 90, 180, 270 |

### study.package.export

Export a complete portable .mrpkg ZIP with original documents, images, audio, histories and related study sets. Optional passphrase uses local authenticated encryption.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the authorized workspace. |
| path | string | 是 | Relative package path inside the authorized workspace. |
| password | string | 否 | Optional local package passphrase; never stored in library settings. |
| expectedRevision | number | 否 | Optional latest study revision guard. |
| includeDependencies | boolean | 否 | Include linked/reference studies and dictionaries; default true. |
| includeDocuments | boolean | 否 | Include original files and self-contained reading views; default true. |

### study.package.inspect

Validate a package and all content hashes, then list studies, documents and warnings without modifying library state.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Relative package path inside the authorized workspace. |
| password | string | 否 | Optional local package passphrase; never stored in library settings. |

### study.package.import

Import a verified package into a NEW folder with remapped identities. Preserve histories, media and internal links; never overwrite existing content.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Relative package path inside the authorized workspace. |
| password | string | 否 | Optional local package passphrase; never stored in library settings. |
| folder | string | 是 | New relative folder for restored original files. Must not exist. |
| title | string | 否 | Optional new title for the primary imported study. |
| activate | boolean | 否 | Open the imported study; default true. |

### study.export.file

Export a study, selected cards or branch to offline HTML, Markdown, OPML, Word, Anki deck or printable mind-map PDF. Media remain local; destinations are never overwritten.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| path | string | 是 | New relative export filename matching format. |
| format | string | 是 | Interoperable output format. 可选：html, md, opml, docx, apkg, pdf |
| expectedRevision | number | 否 | Optional latest study revision guard. |
| rootId | string | 否 | Optional subtree root card. |
| cardIds | array | 否 | Optional selection, at most 2000 IDs. |
| filter | object | 否 | Optional study.board.query filter. |
| includeImages | boolean | 否 | Include source images and media; default true. |
| reviewOnly | boolean | 否 | Export only enabled review cards. |
| expanded | boolean | 否 | Expand collapsed branches in the exported map. |
| poster | boolean | 否 | One large map page; default is tiled landscape A3 sheets. |
| deckName | string | 否 | Optional Anki deck name. |

### document.pdf.export

Create a new PDF with visible excerpt marks and handwriting flattened onto the original pages, preserving original selectable text. Extended notes are appended as readable note pages.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedSourceVersion | string | 是 | Current sourceVersion. |
| path | string | 是 | New relative .pdf filename. |
| setIds | array | 否 | Annotation study UUIDs, at most 64; default all member studies in this workspace. |
| pages | array | 否 | Optional ordered page numbers, at most 2000. |
| omitFolded | boolean | 否 | Exclude completely folded pages. |
| includeNotes | boolean | 否 | Append anchored note text; default true. |
| password | string | 否 | Optional PDF password, never persisted. |

### study.ink.binding.set

Configure automatic card binding, writing selection and focus-only handwriting visibility for the mind map.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| autoBind | boolean | 否 | Bind writing on a selected card; default true. |
| autoSelect | boolean | 否 | Select and bind the card under a new stroke; default true. |
| doubleTapFocus | boolean | 否 | Double-click/tap a card to focus it; mouse/touch taps select and drags write. Pen tips still draw dots. Default false. |
| hideFocusInk | boolean | 否 | Hide focus-created map handwriting outside its focus; selecting the owner previews it translucently. Default false. |

### study.map.ink.add

Write in mind-map world coordinates. Core chooses free canvas, automatic card binding or the focused card, without changing the explicit canvas/card operations.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| selectedCardId | string | 否 | Optional current selected card in this study; does not grant authority. |
| points | array | 是 | 2–2048 [x,y] world points in 0–100000, with optional pressure in 0–1. |
| color | string | 是 | Palette name or #RRGGBB. |
| width | number | 否 | Mind-map world-unit width; default inkSettings.canvasWidth. Omit to use canvasWidth, default 3. |
| layerId | string | 否 | Target layer; default current layer. |
| geometry | object | 否 | Optional raw-stroke intent: shape, straighten (off/auto/always), perfectShape, heldMs, aspectRatio (physical height/width), rulerAngle. Omitted settings follow study.ink.settings; heldMs defaults 0. The Core computes the saved path. Explicit scribbleErase:true permits a held dense scribble to erase; scribbleScope is scope or map, eraseRadius controls its radius, and document bands constrain visible source intervals. ruler optionally supplies {edges:[{a:[x,y],b:[x,y],group:top/bottom,t0:0..1,t1:0..1}],tolerance}; endpoints and tolerance use stroke coordinates. Edge positions t0/t1 permit discontinuous source segments across folded regions. Core snaps only a nearby along-edge gesture. |
| brush | string | 否 | Saved brush style. 可选：pen, pencil, highlighter |
| opacity | number | 否 | Stroke opacity. |

### study.ink.settings

Save pen, opacity, color, shape/ruler and eraser preferences shared by CLI and the handwriting UI.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| brush | string | 否 | Laser strokes are temporary and never saved. 可选：pen, pencil, highlighter, laser |
| color | string | 否 | Palette name or #RRGGBB. |
| opacity | number | 否 | Stroke opacity. |
| width | number | 否 | Document pen width; default 0.004. Changing it retains the current card width. |
| cardWidth | number | 否 | Independent normalized card/review pen width; initially 0.004. Legacy records and saved tools retain their prior shared width. |
| vanish | boolean | 否 | UI strokes disappear after one second without movement, using the selected brush and color; not submitted as saved ink. Explicit ink.add calls remain persistent. |
| canvasWidth | number | 否 | Canvas pen width; default 3 world units. |
| pressure | boolean | 否 | Use stylus pressure. |
| straighten | string | 否 | Line assistance: off, auto for nearly straight strokes, or always. 可选：off, auto, always |
| perfectShape | boolean | 否 | Recognize closed shapes or an explicitly enabled scribble erase when the raw gesture is held still for at least 500 ms. |
| shape | string | 否 | Geometric drawing mode. 可选：free, line, rectangle, ellipse, ruler |
| rulerAngle | number | 否 | Ruler angle in degrees. |
| eraserAutoCancel | boolean | 否 | Return to the previous pen after one successful eraser gesture; default false. |
| eraser | string | 否 | Erase complete strokes or only swept portions. 可选：stroke, partial |

### study.ink.ruler.set

Save an independent on-screen ruler for a document, mind map, card or review area. Pose changes never move existing ink.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| context | string | 是 | Drawing area. 可选：document, map, card, review |
| enabled | boolean | 否 | Show the ruler in this area. |
| x | number | 否 | Center as a fraction of the drawing viewport width. |
| y | number | 否 | Center as a fraction of the drawing viewport height. |
| angle | number | 否 | Clockwise angle in degrees. |
| length | number | 否 | Length relative to the drawing viewport width. |
| cover | boolean | 否 | Use an opaque ruler body to temporarily cover content; never changes originals. |

### study.ink.batch

Atomically move, resize, rotate, copy, recolor, hide or remove selected handwriting in any supported coordinate space.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| scope | string | 是 | Coordinate space. Document/card use normalized dimensions; canvas uses world units. 可选：document, canvas, card |
| cardId | string | 否 | Required for card scope or a binding destination. |
| imageBound | boolean | 否 | Card scope only: bind selected ink to the image, or detach into the current card frame. |
| imageBounds | object | 否 | Optional current image bounds in the card frame; defaults to the canonical map image placement. |
| strokeIds | array | 是 | 1–2000 selected stroke UUIDs. |
| action | string | 是 | Operation. 可选：transform, copy, remove |
| dx | number | 否 | Horizontal displacement. |
| dy | number | 否 | Vertical displacement. |
| scaleX | number | 否 | Horizontal scale around origin. |
| scaleY | number | 否 | Vertical scale around origin. |
| angle | number | 否 | Rotation in degrees. |
| origin | array | 否 | Optional [x,y] center; default selected bounds center. |
| color | string | 否 | New palette color or #RRGGBB. |
| opacity | number | 否 | New opacity. |
| layerId | string | 否 | Destination unlocked layer. |
| hidden | boolean | 否 | Hide/show these strokes in every context. |
| mapHidden | boolean | 否 | Card only: hide outside focus; selecting the card previews it translucently on the map. Does not hide card/editor content. |
| aspectRatio | number | 否 | Physical height / width for normalized page/card rotations. |

### study.ink.erase

Erase intersecting whole strokes or only their swept portions. Hidden/locked layers and document notebooks are untouched.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| scope | string | 是 | Document/card normalized coordinates, canvas world coordinates, or map world coordinates covering visible canvas and card ink. 可选：document, card, canvas, map |
| cardId | string | 否 | Required for card scope or a binding destination. |
| side | string | 否 | Card only: constrain erasing to a visible review side; omitted covers all sides. 可选：front, back |
| mode | string | 否 | partial (legacy default) or stroke: remove every touched stroke completely. 可选：partial, stroke |
| bands | array | 否 | Document only: optional visible original-page intervals [{start,end}]. Prevents crossing folded areas from erasing wholly hidden strokes. |
| imageBounds | object | 否 | Current image bounds for card erasing; defaults to the canonical map image placement. |
| documentId | string | 否 | Required for document scope. |
| page | number | 否 | Document page. |
| path | array | 是 | 2–256 [x,y] eraser points in the selected coordinate space. |
| radius | number | 是 | Eraser radius in x-coordinate units. |
| aspectRatio | number | 否 | Physical height / width for normalized pages/cards; default 1. |

### study.ink.bind

Bind free canvas strokes to a visible card; handwriting moves with the card, including marks beside its bounds.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| scope | string | 是 | Source space. 可选：canvas |
| cardId | string | 是 | Destination card UUID. |
| strokeIds | array | 是 | 1–2000 selected stroke UUIDs. |
| copy | boolean | 否 | Keep originals when true; default moves. |

### study.ink.detach

Move card-bound handwriting back to canvas world coordinates without moving its card.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| cardId | string | 是 | Source card UUID. |
| imageBounds | object | 否 | Current image bounds for detaching image ink; default is its canonical map placement. |
| strokeIds | array | 是 | 1–2000 selected stroke UUIDs. |
| copy | boolean | 否 | Keep originals when true; default moves. |

### study.ink.toCard

Create a note card from selected document/canvas handwriting, preserving source linkage without OCR.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision; stale writes fail. |
| scope | string | 是 | Source space. 可选：document, canvas |
| strokeIds | array | 是 | 1–2000 selected stroke UUIDs. |
| title | string | 否 | New card title. |
| copy | boolean | 否 | Keep originals by default; false moves strokes. |

### study.map.geometry

Read deterministic card positions, branch connections and map dimensions without opening a GUI.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |

### document.region.list

List reversible partial-page folds and layout undo/redo status.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| includeDeleted | boolean | 否 | Include recoverably removed definitions. |

### document.region.set

Create or update a partial-page fold without changing original coordinates or PDF bytes. Intersecting active folds are rejected.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| expectedRevision | number | 是 | Current document revision. |
| regionId | string | 否 | Existing fold UUID; omitted creates one. |
| page | number | 否 | One-based source page; required when creating. |
| start | number | 否 | Top position as original page-height fraction. |
| end | number | 否 | Bottom position as original page-height fraction. |
| folded | boolean | 否 | Fold or expand the region; default true for new regions. |

### document.region.remove

Recoverably remove a partial fold; document layout undo can restore it.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| expectedRevision | number | 是 | Current document revision. |
| regionId | string | 是 | Fold UUID. |

### document.layout.undo

Undo/redo a page fold layout change while keeping document revision monotonic.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| expectedRevision | number | 是 | Current document revision. |

### document.layout.redo

Undo/redo a page fold layout change while keeping document revision monotonic.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| expectedRevision | number | 是 | Current document revision. |

### document.layout.get

Compute source/display geometry for partial folds and inserted note bands without a GUI. Returned source positions always address original PDF coordinates.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| page | number | 是 | One-based source page. |
| width | number | 是 | Rendered page width in CSS pixels. |
| setId | string | 否 | Optional study whose embedded note bands are shown. |

### study.note.place

Atomically create or update a positioned text/image note, with source and layer validation.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current document revision. |
| cardId | string | 否 | Existing independent note; omit to create. |
| documentId | string | 是 | PDF document UUID. |
| expectedSourceVersion | string | 是 | Current original version. |
| title | string | 否 | Note title; required for a new note. |
| text | string | 否 | Markdown body, at most 20000 characters. |
| locator | object | 是 | Validated original PDF/flow position. |
| display | string | 否 | Display mode. 可选：margin, embedded, collapsed, overlay |
| height | number | 否 | Note height in PDF points. |
| rect | object | 否 | Original-page normalized overlay rectangle. |
| layerId | string | 否 | Unlocked layer binding. |

### document.fold.chapters

Fold or unfold complete selected chapter ranges and their descendants atomically.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | PDF document UUID. |
| expectedRevision | number | 是 | Current document revision. |
| nodeIds | array | 是 | 1–500 current outline IDs. |
| folded | boolean | 否 | False unfolds; default true. |

### reader.comparisons.list

List saved local two/three-pane arrangements and original-source availability.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| documentId | string | 否 | Optional member document UUID. |
| includeDeleted | boolean | 否 | Include recoverable removed arrangements. |

### reader.comparisons.save

Save independent source positions and pane layout without moving either document.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| viewId | string | 否 | Existing saved-view UUID; omit to create. |
| expectedRevision | number | 否 | Required for an existing arrangement. |
| title | string | 是 | Saved view name. |
| primary | object | 否 | Primary {documentId,locator}; default current document. |
| panes | array | 否 | One or two {documentId,locator} comparison panes; default current panes. |
| direction | string | 否 | Split orientation. 可选：auto, columns, rows |
| ratio | number | 否 | Primary pane fraction. |

### reader.comparisons.open

Restore a saved arrangement after validating every original source and locator.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| viewId | string | 是 | Saved arrangement UUID. |

### reader.comparisons.update

Rename, archive or restore an arrangement without deleting documents.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| viewId | string | 是 | Saved arrangement UUID. |
| expectedRevision | number | 是 | Current revision; stale changes fail. |
| title | string | 否 | New name. |
| deleted | boolean | 否 | Archive or restore. |

### reader.tabs.set

Reorder/close document tabs and choose their capacity through shared navigation state.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| ids | array | 是 | Ordered unique registered document IDs. |
| limit | number | 否 | Tab capacity; default retains current value. |

### reader.notebook.create

Atomically create and register a local PDF notebook linked page-by-page to a source document.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| sourceId | string | 是 | Registered document UUID in this workspace. |
| expectedSourceVersion | string | 是 | Current source version. |
| path | string | 是 | New workspace-relative PDF filename. |
| title | string | 否 | Notebook title. |
| paper | string | 否 | Page paper. 可选：plain, lined, grid, dots |
| setId | string | 否 | Optional study to receive the notebook. |
| expectedRevision | number | 否 | Required for a study membership change. |
| activate | boolean | 否 | Open alongside the source; default true. |

### reader.notebook.source

Resolve a notebook page or saved stroke back to its validated original location.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered document UUID in this workspace. |
| page | number | 否 | Notebook page. |
| setId | string | 否 | Study holding an optional stroke. |
| strokeId | string | 否 | Optional notebook stroke UUID. |

### reader.notebook.unlink

Detach a notebook, preserving the PDF, notes and saved historical source references.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered document UUID in this workspace. |
| expectedRevision | number | 是 | Current revision; stale changes fail. |

### document.pages.query

Browse pages filtered by bookmarks, handwriting or source cards, with explicit pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered document UUID in this workspace. |
| setId | string | 否 | Optional study filter. |
| kind | string | 否 | Page filter; default all. 可选：all, bookmarks, ink, cards |
| query | string | 否 | Literal page text query. |
| offset | number | 否 | Zero-based result offset. |
| limit | number | 否 | Result size; default 50. |

### document.meta.update

Set a display title, category/tags or favorite state without renaming the file.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Registered document UUID in this workspace. |
| expectedRevision | number | 是 | Current revision; stale changes fail. |
| title | string | 否 | Custom display title. |
| tags | array | 否 | At most 30 text tags. |
| category | string | 否 | Category, up to 100 characters. |
| favorite | boolean | 否 | Favorite document. |

### study.card.emphasis.set

Replace independent text/image emphasis marks without changing the original excerpt or enabling review. Undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardId | string | 是 | Card UUID. |
| text | array | 否 | Text marks [{field,start,end,quote,group}]. field is title/text/note/comment:UUID; UTF-16 offsets and quote must match current content; group is a 1–60 character name. |
| images | array | 否 | Image marks [{x,y,width,height,group}] in normalized card-image coordinates. |

### study.review.generate

Generate questions from selected text/image emphasis and visible document/card highlighters, retaining FSRS history. Replaces the selected cards question/masks; source content is preserved.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardIds | array | 否 | Selected card UUIDs; omission selects every card. |
| descendants | boolean | 否 | Include descendants. |
| password | string | 否 | Optional PDF password when repairing old excerpt mappings before generation; never persisted. |
| autoUpdate | boolean | 否 | Keep this question synchronized with its source marks; default true. False creates a fixed snapshot. |
| rules | object | 否 | Optional booleans documentHighlighter,cardHighlighter,textEmphasis,imageEmphasis; defaults true. Stored automatic rules share the source edit transaction; unavailable questions leave the queue without losing records. |

### study.review.render

Render the current source-bound question/answer, sided comments and handwriting as safe HTML and scoped asset references.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| cardId | string | 是 | Card UUID. |
| variantId | string | 否 | Optional question group identity. |
| sessionId | string | 否 | Use the active session reveal state; mismatched question/session fails. |

### study.review.batch

Configure multiple review cards atomically, including a complete branch or filtered board result.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardIds | array | 否 | Optional selected card IDs; absent means all matching cards. |
| descendants | boolean | 否 | Include descendants of selected cards. |
| filter | object | 否 | Same compound filter as study.board.query. |
| patch | object | 是 | enabled,deckId,frontMode,backMode,revealMode,frontTemplate,backTemplate,cloze,occlusions,occlusionGroups. Templates substitute {title}, {text} and {note}. Bulk frontMode extraction preserves custom fronts; an explicit frontTemplate replaces them. |

### study.review.session.start

Start a persistent, deterministic review or practice session with a stable question order. Practice does not change FSRS.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardIds | array | 否 | Optional selected card IDs; absent means all matching cards. |
| descendants | boolean | 否 | Include descendants of selected cards. |
| filter | object | 否 | Same compound filter as study.board.query. |
| mode | string | 否 | Scheduled FSRS or non-scheduled practice. 可选：scheduled, practice |
| deckId | string | 否 | Optional active deck UUID. |
| dueOnly | boolean | 否 | Scheduled mode defaults to due questions only. |
| sort | string | 否 | Question order. 可选：due, outline, title, created, source, random |
| direction | string | 否 | Order direction. 可选：asc, desc |
| seed | string | 否 | Optional deterministic shuffle seed. |
| limit | number | 否 | Maximum questions in this session. |

### study.review.session.get

Read the current review question, progress and persisted answer visibility.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |

### study.review.session.action

Reveal, navigate, favorite or grade the current session question. Hidden/repeated grading is rejected.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| sessionId | string | 否 | Optional expected session UUID. |
| action | string | 是 | Session operation. 可选：reveal, previous, next, goto, grade, favorite, finish |
| index | number | 否 | Zero-based question index for goto. |
| revealed | boolean | 否 | Explicit true reveals all, false re-hides all. Omit to reveal the next ordered group, or the answer when ungrouped. |
| favorite | boolean | 否 | Explicit favorite flag; default toggles. |
| rating | string | 否 | Recall rating for grade. 可选：again, hard, good, easy |

### study.review.log

Read review records including cloze/image question-group identities with pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| cardId | string | 否 | Optional card filter. |
| offset | number | 否 | Zero-based offset. |
| limit | number | 否 | Result size; default 100. |

### study.recall.set

Enable document/map active recall masks without modifying source excerpts or FSRS schedules.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| enabled | boolean | 否 | Enable recall mode. |
| scope | string | 否 | Where masks are shown. 可选：document, map, both |
| mode | string | 否 | Recall presentation. 可选：mask, blur, titles |
| cardIds | array | 否 | Optional subset; empty applies to all cards. |
| reset | boolean | 否 | Hide all previously revealed answers. |

### study.recall.reveal

Reveal or re-hide one card in document/map recall; persistent and undoable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardId | string | 是 | Card UUID. |
| visible | boolean | 否 | Reveal by default; false hides. |

### study.presentation.start

Present an ordered card/branch selection without losing the normal map layout.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| cardIds | array | 否 | Optional selected card IDs; absent means all matching cards. |
| descendants | boolean | 否 | Include descendants of selected cards. |
| filter | object | 否 | Same compound filter as study.board.query. |
| showNotes | boolean | 否 | Include notes/comments; default true. |
| showImages | boolean | 否 | Include images; default true. |
| mode | string | 否 | Presentation format. map shows an animated branch context; cards preserves the original rich-card slides. 可选：cards, map |

### study.presentation.action

Move or close a local presentation through the same state observed by all viewers.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in this exact workspace. |
| expectedRevision | number | 是 | Current study revision; stale requests fail. |
| action | string | 是 | Presentation action. 可选：previous, next, goto, stop |
| index | number | 否 | Zero-based index for goto. |

### study.excerpt.repair

Restore missing source/image mappings only when re-rendered pixels match the immutable old excerpt. Preserves originals; returns repaired and skipped items. Undoable and idempotent when already mapped.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| cardIds | array | 否 | Optional source-excerpt card IDs; omitted means all cards. |
| descendants | boolean | 否 | Include selected descendants. |
| password | string | 否 | Optional PDF password for this request only; never persisted. |

### study.excerpt.list

List every original source fragment in a continuous/multi-document excerpt card, including stale-source status.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| cardId | string | 是 | Existing source-excerpt card UUID. |

### study.excerpt.image

Read one immutable excerpt-fragment PNG; all reads remain within the study workspace.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| cardId | string | 是 | Existing source-excerpt card UUID. |
| partId | string | 是 | Excerpt part UUID. |

### study.excerpt.append

Append a text/image selection to the same card; preserve every source, immutable part image and the card UUID.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| cardId | string | 是 | Existing source-excerpt card UUID. |
| expectedRevision | number | 是 | Current study revision. |
| documentId | string | 是 | Current source-document UUID. |
| expectedSourceVersion | string | 是 | Source file version returned by document.get. |
| captureId | string | 是 | New UUID for this edit; retries are idempotent. |
| text | string | 是 | Selected text, at most 12000 characters. |
| locator | object | 是 | Validated PDF/flow source locator. |
| selection | object | 是 | PDF rectangles/polygon/bands or flow start/end offsets. |
| password | string | 否 | Optional PDF password for this request only. |

### study.excerpt.revise

Explicitly replace or rebind one selected fragment while preserving the card, comments, links and review records. Undo restores the previous snapshot.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| cardId | string | 是 | Existing source-excerpt card UUID. |
| expectedRevision | number | 是 | Current study revision. |
| documentId | string | 是 | Current source-document UUID. |
| expectedSourceVersion | string | 是 | Source file version returned by document.get. |
| captureId | string | 是 | New UUID for this edit; retries are idempotent. |
| text | string | 是 | Selected text, at most 12000 characters. |
| locator | object | 是 | Validated PDF/flow source locator. |
| selection | object | 是 | PDF rectangles/polygon/bands or flow start/end offsets. |
| password | string | 否 | Optional PDF password for this request only. |
| partId | string | 否 | Fragment UUID; omitted replaces the first fragment. |

### study.excerpt.remove

Remove one fragment from a multi-part card; preserve at least one fragment and all immutable snapshots for undo.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| cardId | string | 是 | Existing source-excerpt card UUID. |
| expectedRevision | number | 是 | Current study revision. |
| partId | string | 是 | Excerpt part UUID. |

### system.fonts

List local font family names available to the offline renderer. No font files are exported.

性质：读取；员工访问：workspace。

无参数。

### study.tool.list

List named capture/pen tools and three stable base pens, including optional archived tools. Reading does not write defaults.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| includeDeleted | boolean | 否 | Include recoverably deleted tools. |

### study.tool.save

Create or update a named capture/pen preset; omission of settings copies the current tool settings.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| toolId | string | 否 | Existing tool UUID, including a base pen; omit to create a copy. |
| apply | boolean | 否 | Apply the saved preset in the same revision; default false. |
| pin | boolean | 否 | Pen only: pin/unpin in the 3–12 tool toolbar, preserving one pen, highlighter and pencil. |
| kind | string | 否 | Tool type. 可选：capture, ink |
| title | string | 是 | Tool name. |
| settings | object | 否 | Same fields as study.capture.settings or study.ink.settings, without setId/revision. |

### study.tool.apply

Use a saved tool as the study default for subsequent captures or ink strokes.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| toolId | string | 是 | Saved tool UUID. |

### study.tool.remove

Recoverably archive or restore a saved tool, preserving prior strokes and excerpts.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| toolId | string | 是 | Saved tool UUID. |
| restore | boolean | 否 | Restore instead of archive. |

### study.ink.toolbar.set

Persist per-context floating/docked handwriting toolbar geometry and optional pen order; base pens need no initialization write.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| widthMode | string | 否 | Pen-width control mode; default continuous. 可选：continuous, steps |
| context | string | 否 | Drawing area, required with placement. 可选：document, map, card, review |
| placement | object | 否 | Placement: {dock:left/right/top/bottom/free,orientation:horizontal/vertical,x:0..1,y:0..1}; positions are fractions of the available travel within the area. |
| toolIds | array | 否 | Optional ordered 3–12 active pen IDs from study.tool.list; retain at least one pen, highlighter and pencil. |

### study.palette.set

Set the study color palette for card/excerpt and ink pickers.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| colors | array | 是 | 1–32 unique {color,title} entries; color is a palette name or #RRGGBB. |

### study.menu.set

Pin and reorder frequent card/selection menu actions. All other actions remain accessible.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| cardActions | array | 否 | Ordered card action IDs: source,image,edit,preview,parts,occlude,child,links,review,annotation,unmerge,batch,copy,submap,un-submap,split,outdent,root,remove. |
| selectionActions | array | 否 | Ordered selection actions: new,append,revise,note,toc,copy,research. |

### study.template.export

Export portable appearance, palette, menu and tool settings without documents, credentials, or font files.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 否 | Optional expected study revision. |
| path | string | 是 | New JSON filename within the workspace. |

### study.template.import

Validate and apply an offline style/tool template atomically; custom tools receive new IDs and base-pen overrides retain their stable IDs.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| path | string | 是 | Existing style JSON path inside the workspace. |

### study.workspace.query

Query and group cards across selected studies in this exact workspace, with stable owner identities and explicit pagination.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setIds | array | 否 | Optional study UUIDs; omit for all active studies. |
| filter | object | 否 | Same compound filter as study.board.query. |
| groupBy | array | 否 | Up to two: study,color,tag,keyword,document,chapter,created,updated,kind,inMap. |
| sort | string | 否 | outline,title,created,updated,color,source. |
| direction | string | 否 | Sort direction. 可选：asc, desc |
| offset | number | 否 | Match offset. |
| limit | number | 否 | Page size; default 100. |

### study.workspace.batch

Atomically edit selected cards across studies; any stale owner revision aborts the complete batch.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| targets | array | 是 | 1–10000 {setId,cardId} targets. |
| expectedRevisions | object | 是 | Map of study UUID to latest revision for every selected owner. |
| patch | object | 是 | Same patch fields as study.cards.batch. |
| descendants | boolean | 否 | Include selected card subtrees. |

### library.index

Index readable workspace files without activating them; continue nextOffset until null.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| offset | number | 否 | File offset. |
| limit | number | 否 | Files per batch; default 20. |

### library.search

Search documents and cards with phrases, Boolean AND/OR/NOT and title/text/note/tag/color/path/type/category fields.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| query | string | 是 | Literal query, 1–1000 characters. |
| kind | string | 否 | Search domain. 可选：all, cards, documents |
| setId | string | 否 | Optional study restriction. |
| caseSensitive | boolean | 否 | Case-sensitive matching. |
| offset | number | 否 | Match offset. |
| limit | number | 否 | Page size; default 100. |

### toc.batch

Apply a batch of chapter edits atomically.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current revision. |
| operations | array | 是 | 1–500 objects: action add/update/remove/move/indent/outdent and parameters. |

### toc.generate

Restore original headings or detect numbered headings locally.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current revision. |
| strategy | string | 是 | Outline source. 可选：original, numbered |

### toc.undo

Undo the latest outline edit.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current revision. |

### toc.redo

Redo the latest outline edit.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current revision. |

### study.toc.import

Create or reuse chapter cards directly from a document outline.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current revision. |
| documentId | string | 是 | Document UUID. |
| nodeIds | array | 否 | Optional selected chapter IDs. |
| title | string | 否 | Root-card title. |

### study.cards.move

Move selected branches together with stable IDs, cycle prevention and one reversible transaction.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision. |
| cardIds | array | 是 | 1–10000 selected card UUIDs; nested selections are moved only once. |
| parentId | string / null | 否 | Destination parent, null means roots. |
| index | number | 否 | Sibling insertion index. |
| positions | array | 否 | Optional {cardId,x,y} for each selected root in world coordinates. |

### study.card.insert

Create an adjacent sibling, parent or child in one undoable operation.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision. |
| cardId | string | 是 | Anchor card UUID. |
| relation | string | 是 | Position relative to the anchor. 可选：before, after, parent, child |
| title | string | 是 | New card title. |
| text | string | 否 | New card body, at most 20000 characters. |
| index | number | 否 | Child insertion index. |

### study.clipboard.set

Prepare a clone, live reference or cut without deleting source cards. Clipboard stays in this workspace.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision. |
| cardIds | array | 是 | 1–10000 card UUIDs. |
| mode | string | 是 | Copy semantics. 可选：clone, reference, cut |
| descendants | boolean | 否 | Include descendants; default true. Cut always includes complete subtrees. |

### study.clipboard.get

Read pending workspace card clipboard identities and validity, never system clipboard contents.

性质：读取；员工访问：workspace。

无参数。

### study.clipboard.clear

Clear only the clipboard receipt that the caller has read.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| clipboardId | string | 是 | Current clipboard UUID. |

### study.clipboard.paste

Paste using the original source revision; cross-study cuts move stable IDs and update links atomically. Linked undo restores all affected studies together.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision. |
| clipboardId | string | 是 | Receipt from study.clipboard.get/set. |
| parentId | string / null | 否 | Destination parent; null means roots. |
| index | number | 否 | Sibling insertion index. |
| x | number | 否 | Optional top-level placement x. |
| y | number | 否 | Optional top-level placement y. |

### study.map.preferences

Persist map interaction tools without creating a private GUI-only editing path.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID in the assigned workspace. |
| expectedRevision | number | 是 | Latest study revision. |
| mode | string | 否 | Current map tool. 可选：hand, select, clone, reference, cut, link-one, link-both, curve, hierarchy |
| quickMerge | boolean | 否 | Allow explicit merge gestures. |
| selectionShape | string | 否 | Selection tool shape. 可选：rectangle, lasso |

### study.notebook.list

List independent annotation notebooks for one document, separately from handwriting layers.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| documentId | string | 是 | Member document UUID. |
| includeDeleted | boolean | 否 | Include recoverable archived notebooks. |

### study.notebook.create

Create a document annotation notebook; optionally copy notes and ink without copying the original document.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| documentId | string | 是 | Member document UUID. |
| expectedRevision | number | 是 | Current study revision. |
| title | string | 是 | Notebook title. |
| copyFrom | string | 否 | Existing notebook UUID or default to duplicate. |

### study.notebook.update

Rename, show/hide, lock/unlock or recoverably archive/restore a document notebook.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| documentId | string | 是 | Member document UUID. |
| expectedRevision | number | 是 | Current study revision. |
| notebookId | string | 是 | Notebook UUID or default. |
| title | string | 否 | New title. |
| visible | boolean | 否 | Overlay this notebook in the document. |
| locked | boolean | 否 | Prevent note, annotation and document-ink edits. |
| deleted | boolean | 否 | Recoverable archive or restore. |

### study.notebook.select

Choose the notebook that receives new excerpts, placed notes and document strokes; optionally show/hide other notebooks.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| documentId | string | 是 | Member document UUID. |
| expectedRevision | number | 是 | Current study revision. |
| notebookId | string | 是 | Notebook UUID or default. |
| showOthers | boolean | 否 | Whether other active notebooks remain visible. |

### study.notebook.assign

Move selected document notes into another notebook without changing card IDs or source geometry.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| documentId | string | 是 | Member document UUID. |
| expectedRevision | number | 是 | Current study revision. |
| notebookId | string | 是 | Notebook UUID or default. |
| cardIds | array | 是 | 1–10000 card IDs referring to this document. |
| descendants | boolean | 否 | Include note subtrees. |

### speech.voices

List installed local macOS speech voices without downloading a voice or playing audio.

性质：读取；员工访问：workspace。

无参数。

### speech.render

Synthesize bounded text to WAV bytes using an installed local voice. Does not play audio or modify source documents.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| text | string | 是 | 1–6000 characters. |
| voice | string | 否 | Exact installed voice ID from speech.voices. |
| rate | number | 否 | Words per minute; default 180. |

### dictionary.lookup

Look up a word or phrase through the public macOS Dictionary Services API, returning plain text.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| term | string | 是 | 1–256 characters. |

### study.speech.attach

Render a card field as local speech and save it as an immutable audio comment, with a revision check before and after synthesis.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Current study revision. |
| cardId | string | 是 | Card UUID. |
| field | string | 否 | Card field to read; default text. 可选：title, text, note, front, back |
| voice | string | 否 | Installed local voice. |
| rate | number | 否 | Words per minute. |

### document.virtual.create

Create a linked page collection in a small .mrv reference file; originals remain in place.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | New relative .mrv path. |
| title | string | 否 | Collection title. |
| pages | array | 是 | 1–2000 PDF page references: documentId,expectedSourceVersion,page,crop,rotation; blank pages use blank:true,width,height,paper. |
| includeAnnotations | boolean | 否 | Show projected source-study annotations; default true. |
| activate | boolean | 否 | Activate after creation; default true. |

### document.virtual.update

Replace/append virtual references or undo/redo page assembly without altering originals.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current document revision. |
| action | string | 否 | Update mode. 可选：replace, append, undo, redo |
| pages | array | 否 | New page references. |
| title | string | 否 | Updated title. |
| includeAnnotations | boolean | 否 | Show source-study annotations. |
| activate | boolean | 否 | Activate after editing; default true. |

### document.virtual.refresh

Reopen changed originals and rebuild the virtual cache, retaining stale-source warnings on old annotations.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| expectedRevision | number | 是 | Current document revision. |
| activate | boolean | 否 | Activate after refresh; default true. |

### document.virtual.source

Resolve a virtual point/page to its original PDF location.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| id | string | 是 | Document UUID. |
| page | number | 是 | One-based page. |
| point | array | 否 | Optional normalized x,y pair; default top left. |

### study.versions.list

List named/automatic historical versions without modifying the active study.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| includeArchived | boolean | 否 | Include archived versions. |
| offset | number | 否 | Offset. |
| limit | number | 否 | Page size; default 50. |

### study.versions.get

Inspect a version and compare added, removed and changed card identities.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| versionId | string | 是 | Saved version UUID. |
| includeContent | boolean | 否 | Return snapshot metadata, never Base64 assets. |

### study.versions.create

Save an immutable named snapshot that retains references to original excerpt/media assets.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Latest study revision. |
| title | string | 否 | Version title. |

### study.versions.restore

Restore a historical study state; preserve originals and checkpoint the current state for undo.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Latest study revision. |
| versionId | string | 是 | Saved version UUID. |

### study.versions.update

Rename/archive/restore a version record without deleting its immutable data.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Latest study revision. |
| versionId | string | 是 | Saved version UUID. |
| title | string | 否 | New title. |
| archived | boolean | 否 | Archive or unarchive. |

### study.versions.policy

Enable change-triggered automatic metadata versions; all referenced original assets remain durable.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| setId | string | 是 | Study UUID. |
| expectedRevision | number | 是 | Latest study revision. |
| enabled | boolean | 是 | Enable automatic versions. |
| intervalSeconds | number | 否 | Minimum interval, default 600 seconds. |

### library.backup.plan

Estimate full-library data and disk space without writing files; identify whether the legacy 256 MiB ZIP limit is sufficient.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Proposed new .mrbackup path inside the workspace. |

### library.backup.create

Create an optionally encrypted local backup of this exact library; exclude credentials and active uploads. Segmented mode streams bounded chunks to a directory package.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | New .mrbackup path. |
| password | string | 否 | Optional passphrase, at least eight characters. |
| format | string | 否 | zip (legacy, default, 256 MiB) or segmented (v2 directory, 4 MiB chunks, 1 TiB data / 100000 files / 64 MiB metadata validation budget). Copy the entire directory when using segmented mode. 可选：zip, segmented |

### library.backup.inspect

Verify every file/chunk checksum and inspect a legacy ZIP or segmented directory backup without restoring files.

性质：读取；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Existing .mrbackup path. |
| password | string | 否 | Passphrase when encrypted. |

### library.backup.restore

Restore a verified backup into a new workspace subfolder. Existing library data are never overwritten.

性质：写入；员工访问：workspace。

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| path | string | 是 | Backup path. |
| folder | string | 是 | New destination folder inside the authorized workspace. |
| password | string | 否 | Passphrase when encrypted. |

### Study sets, excerpt images and mind maps

study.create 创建学习集；study.documents.add 通过文库路径注册/关联文件而不复制原件。一个 documentId 可出现在多个学习集中；study.get 返回所有成员、卡片、sourceAvailable/sourceChanged/detached 标记及颜色表。study.open 设置 activeStudySet 和可选成员 lastDocument，省略 documentId 则打开学习集全幅脑图。退出学习集可 settings.set activeStudySet:null。移除成员不会删除原件或现有摘录；学习集及卡片删除均可通过对应 restore 恢复。

所有学习集写操作（除创建/打开/导出外）使用 expectedRevision。截图创建还要求 expectedSourceVersion（document.open/get 返回）和 captureId（调用者生成的 UUID）。相同 captureId 和相同参数重复请求会返回同一卡片；相同 UUID 换内容或卡片已删除时拒绝。版本冲突不能自动重试覆盖。

study.card.create 接收 documentId、text、color 和 locator。PDF selection.rects 是最多 2000 个矩形，每个包含 page（从 1 开始）、x/y/width/height（相对该旋转后显示页的 0–1 坐标）；最多覆盖 12 页。Core 使用原 PDF 页面渲染裁切并拼接为 PNG，不依赖 UI 画布上传。PDF 框选可传空 text；图中文字不自动 OCR。流式文档 selection.start/end 是 document.content.html 的 body.textContent 中 UTF-16 偏移，Core 会核验选中文字；图片按选中文字排版生成。CLI 也可省略 selection，直接从 text 生成图片，仍须有合法原文 locator。

示例：先 study.create 取得 SET_ID 和 revision，再 study.documents.add paths:["Books/book.pdf","article.html"] 取得成员 ID。使用 document.get 取得 SOURCE_VERSION，然后调用：

`node cli.cjs --workspace /absolute/library api study.card.create --data '{"setId":"SET_ID","expectedRevision":2,"documentId":"DOCUMENT_ID","expectedSourceVersion":"SOURCE_VERSION","captureId":"GENERATED_UUID","text":"Selected passage","color":"yellow","locator":{"page":29},"selection":{"rects":[{"page":29,"x":0.15,"y":0.25,"width":0.7,"height":0.12}]}}'`

study.card.move 的 parentId 为目标卡片 ID，null 表示顶层；index 可指定同级顺序。整个子树一起移动，跨集 parent 和环路被拒绝。study.card.update 可改 title/note/tags/color/collapsed；独立笔记卡还可改 text，摘录的原始 text、图像和源快照不被修改。每个学习集的高亮/笔记/层级独立，不写入 PDF/HTML 原件。

study.card.image 返回 PNG 的 MIME 和 canonical base64。也可通过稳定资产引用 data/study-card/<setId>/<cardId>.png 渲染。study.export 将成员、卡片和树关系写入新 JSON，includeImages:true 内嵌 PNG；从不覆盖目的文件。原文更新后旧图片保留，失效选区不再高亮于新内容；文库重命名/移动保留 ID，重新读取匹配内容后定位仍可用。

限制：每次添加 1–500 个文件、每集最多 10000 个文件及活动卡片、64 级层次。图像在最多两个隔离 Worker 中生成，单任务 90 秒，PNG 上限 8 MiB，原文仍受已有格式/容量/密码限制。任何失败都不应作为成功卡片显示。用户文档、卡片 PNG 和完整元数据都保留在授权工作区，禁止跨 Team 取图。

### Batch file operations and selection

普通单击文件/文件夹直接打开；顶部的选择模式只影响当前界面的勾选状态，不写业务数据。未选择时隐藏移动、复制、删除等批量操作；返回卡片只在子文件夹显示。选择的文件版本在勾选时固定，刷新不会自动批准对新版本操作。

`fs.batch` 参数：action 为 move/copy/trash；items 为 1–500 个 `{path,expectedVersion}`，版本来自 fs.list；move/copy 必须提供现存的 folder（根目录为 .），trash 不接受 folder。不能同时选中父目录和其子项，不接受重复、链接、越界或受保护路径。保留每个项目的原名称，遇到任意同名冲突或版本变化时在执行前拒绝整批请求。

`node cli.cjs --workspace /absolute/library api fs.batch --data '{"action":"move","folder":"Books","items":[{"path":"one.pdf","expectedVersion":"VERSION_FROM_FS_LIST"},{"path":"two.html","expectedVersion":"VERSION_FROM_FS_LIST"}]}'`

批量复用单文件操作代码，共用一次文件锁和状态提交；普通运行时错误回滚先前已完成的文件操作。成功返回 `{action,count,items:[{source,path,version?,trashId?}]}`，trashId 可用 fs.restore 恢复。异常断电不承诺跨文件 ACID；有失败回滚警告时保留文库备份再诊断。CONFLICT 的失败路径在 error.data.details.failedPath 中；重新读取并明确重新选择后再重试，不自动覆盖。

### Reading locators and concurrency

PDF 用一基页码 `{"page":1,"offset":0}`；offset 是页内可滚动范围的 0–1 比例。流式文档用零基章节 `{"section":0,"anchor":"heading-id"}`，anchor 可省略。document.content 返回 anchors；toc.list 返回现有章节与 locator。位置由 Core 验证，可由 CLI 直接跳转，界面通过事件同步。
CLI 的 settings.set lastDocument:null,currentFolder 可使已打开的界面返回指定文件夹；document.fold 和重新解析文档也会刷新当前可见内容，无需手动重载。宿主通信目录与缓存变化不被当作用户文库变化，避免 events.json 造成通知循环。
目录编辑必须提交最近读取的 expectedRevision。冲突时重新 toc.list，对比后明确重试，不会自动覆盖。fs.write 更新已存在文本时必须提供 fs.list 返回的 expectedVersion。其他文件操作也拒绝覆盖目的地。阅读位置/设置采用最后写入者生效；多个进程用工作区文件锁串行提交。
分块上传最大 512 MiB、每块最多 4 MiB，offset 必须匹配 import.status 的 received。可断点续传。finish 可校验 SHA-256。finish 解析失败时原文件仍保留，error.data.details.savedPath 告知路径。密码仅随请求传递，不持久化；敏感密码建议通过标准输入传 JSON，避免 shell 历史。

### PDF modes, fitting and trackpad preferences

PDF 的两种阅读模式由 settings.set 的 pdfMode 控制：continuous 为连续竖向滚动（右侧常驻、可拖动的竖向进度条），paged 为单页翻页（底部横向进度条）。pdfFit=width 尽量占满可用宽度，pdfFit=page 在保留比例的前提下容纳整页。pdfZoom 为适配后的 0.5–3 倍倍率，与流式文字 fontSize 分开。pdfFocus=true 隐藏文件树与目录；关闭专注阅读恢复两侧面板。

pdfScrollSpeed 为上下触控板/滚轮的 0.25–4 倍速率。横向手势始终按一次一页处理，惯性事件合并到同一手势；竖向连续滚动允许跨页。翻页模式可上下平移长页，到达页边后新的竖向手势可继续翻页，单次手势不会连续翻过多页。修饰键滚轮不被翻页逻辑拦截。渲染窗口按可用区域实时重新计算比例，只渲染可见及相邻页面，最多保留 7 个页面画布、同时最多渲染 2 页。

CLI 示例：

```sh
node cli.cjs --workspace /absolute/library api settings.set --data '{"pdfMode":"continuous","pdfFit":"width","pdfScrollSpeed":1.5}'
node cli.cjs --workspace /absolute/library api settings.set --data '{"pdfMode":"paged","pdfFit":"page","pdfZoom":1,"pdfFocus":false}'
node cli.cjs --workspace /absolute/library api reader.position.set --data '{"id":"DOCUMENT_ID","locator":{"page":531,"pageOffset":0.25}}'
```

新增 pageOffset 表示页面顶部起算、相对整页高度的 0–1 比例，跨缩放和模式切换保持同一内容位置；同时适配整页时会钳制到可滚动范围。旧 offset 参数仍按页内可滚动范围解释，不能与 pageOffset 同时使用。新设置通过加法式默认值兼容旧文库，不删除旧状态、不改动原 PDF。

### Document thumbnails and quiet imports

`document.preview {path,expectedVersion?}` 无窗口生成 PNG：PDF 为真实第一页（保留页面比例），HTML/Markdown 为标题、本地图片和正文摘要的缩小预览。返回 kind=image、mimeType=image/png、contentBase64、width、height、title、version、cacheHit；PDF 另有 page=1、pageCount。其他情况返回 kind=fallback 及 reason（例如加密、损坏或格式不支持），文件仍可管理。路径越界、链接、原文件版本冲突仍按正式错误拒绝。

预览不注册文档，不改动 lastDocument、阅读位置或自定义目录，不为缩略图加载远程图片/脚本。派生缓存按路径与版本存入 cache/preview-v1-*.json，最多两个渲染 Worker；每张图不超过 360×480，单任务 30 秒，返回结果上限 1 MiB。旧缩略图可重建，不能将缓存当作用户原件。浏览器可见卡片按需请求，关闭窗口不等待这些无业务写入的预览任务。

`node cli.cjs --workspace /absolute/library api document.preview --data '{"path":"Books/book.pdf"}'`

`document.open` 与 `import.finish` 的 activate 默认 true。传 false 可解析/导入文档而不切换当前阅读位置；拖入指定文件夹使用此选项。目录导航仍用 settings.set currentFolder，文件管理仍用 fs.*，没有新增 UI 私有写入接口。

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

### 学习集文件夹与书页翻动

侧栏上方“学习集”打开学习集浏览器，下方“我的文库”打开真实文件文库。两个区域分别有自己的目录树，以横线分隔。学习集浏览器支持缩略图和列表、搜索、面包屑、嵌套文件夹、重命名与拖放移动；视图和当前位置跨重开保存。

`study.library.get` 返回当前获授权文库的目录修订号、完整文件夹结构及带 `folderId` 的学习集摘要。读取不会写入默认结构。创建、移动、重命名和回收使用 `study.folder.*`；学习集位置使用 `study.library.move`。目录修订号独立于卡片修订号，移动保持学习集、卡片、历史记录及原始 PDF 的身份，不复制或移动原件。

`study.create` 可以传 `folderId`，省略时创建在根目录。每个文库支持最多2000个文件夹（含回收站），层级最多64层。同级名称按 Unicode NFC 与不区分大小写比较。循环层级、未知父级、重复名称和过期修订全部拒绝。文件夹必须先移空，再移入可恢复回收站；删除学习集继续使用独立学习集回收站。完整备份保留目录，单个学习包导入到本库根目录，不借用另一个文库的文件夹 ID。

浏览设置通过 `settings.set` 的 `homeSection`（library/studies）、`studyFolder`（文件夹 UUID 或 null）、`studyLibraryView`（grid/list）和 `studyDocumentsView`（grid/list）保存。员工须使用自己的固定文库入口，目录结构不会扩大其权限。跳转到学习集浏览器时一并设置 `activeStudySet:null,lastDocument:null`。

学习集内的资料使用 `document.preview` 生成实际 PDF 封面和 HTML 正文缩略图，显示名称、原路径、格式、文件大小、可用页数或文章摘要。缩略图按可见区域请求，单个预览队列最多两个任务，缓存有大小和数量上限。预览不可用时保留文件类型提示，不修改原件，也不自动注册新的文档。

`pdfTurnEffect` 默认 book，none 关闭动画。分页显示一个真实页面，并缓存前后邻页，最多三个栅格页面。连续竖向滚动保持原有最多七页的栅格预算。翻动使用短暂的独立纸面、书脊旋转、背面和阴影，原 PDF、文字选择层与笔迹坐标不做装饰变换。系统减少动态优先，窗口隐藏和导航取消会清理动画。

快速连续翻页合并到最新目标，不排队播放每一个过时动画。轮盘方向反转或衰减后明显的新一轮输入可再次翻页，单次惯性尾部不会连续跨页。保存失败后明确提示并释放队列，下一次合法请求仍能继续。未保存的笔迹或正在编辑的定位笔记须先结束，不会为了翻页丢弃它们。

专项复现：`npm run test:book-turn`、`npm run test:study-library`。完整验收仍使用 `npm run test:deep-audit` 和 `npm run test:agent-acceptance`。测试在隔离临时文库和隐藏窗口执行，不调用真实模型。

#### 当前宿主的员工文档与通信目录

新宿主使用共享只读 API 目录，员工先通过文档工具 identity/index 获取身份和方法索引，再按需读取 `plugin/margin-reader/command/METHOD`。CLI 的 `margin-reader` 由宿主加入当前员工 PATH；当前宿主的实际文件位于 `$AGENTS_COMPANY_HOME/agent-access/<employeeId>/bin/`，通信目录位于同一员工运行目录的 `ipc/margin-reader`。旧宿主工作区内的 `.agents-company` 启动器和通道仍兼容。不要自行给员工复制一份旧手册或重建另一个文库。

插件仅接受显式传入的当前员工 ID、宿主 home、该员工 token 文件和完全匹配的通信路径。通道和凭据禁止符号／硬链接别名，不接受另一员工或控制令牌替换；host.json 的实际 workspace 与存活 PID 仍独立检查，Core 对每个请求检查权限和撤销状态。插件不会遍历凭据注册表，也不会回退到用户身份。新旧宿主的正式启动器、文档完整性及撤销拒绝分别验收。

## 侧栏与主页面操作

学习集、我的文库使用相同的独行分类按钮，各自下方仅保留目录树。学习集的新建、文件夹新建、导入及学习集回收站在右侧学习集主页面；全库卡片盒和工具查找移至窗口右上角工具区。

文库文件名与路径搜索在右侧文库页面，支持已载入目录中的子文件夹结果；输入不会筛掉侧栏条目。搜索结果可打开、生成原文缩略图或批量选择；清空／Escape 返回当前文件夹，进入搜索到的文件夹会清空查询。文库与学习集主页中 Cmd/Ctrl F 聚焦各自搜索；Cmd/Ctrl O 仍用于导入文件，Cmd/Ctrl K 仍用于查找工具。

复现专项：`npm run test:sidebar`。原生窗口检查包含在 `test:book-library:native`；完整入口为 `test:deep-audit` 与 `test:agent-acceptance`。


# 思维导图工作台

本模块与摘录卡片使用同一份学习集、同一张卡片 ID、同一套版本与撤销历史。它借鉴 XMind 的结构、样式与编辑工作流，采用独立实现与自制主题、图形及图标，不包含商业客户端、商标壁纸或私有贴纸库。

## 入口与阅读兼容

进入学习集，在脑图上方点击“思维导图”切换紧凑主题视图。原有摘录卡片仍可切回；旧文库不会因安装而自动改版或改写原件。主题视图仍支持单击摘录回到 PDF／HTML 的准确位置、在原文取消标注、卡片笔记与评论、标签、图片和手写。多选主题后继续使用原来的批量操作与可恢复删除。

Cmd/Ctrl K 的工具搜索包含主题、格式、模板、关系、概要、外框、演示及导出。未开启主题视图时，搜索会说明入口所需状态。

## 结构与可视化

13 种结构：均衡思维导图、左右逻辑图、上下组织图、左右树状图、横向／纵向时间轴、左右鱼骨图、矩阵、括号图。主分支可以单独指定结构和左右方位；提供自动平衡、分支与主题间距、同级等宽、全图或分支编号。矩阵绘制表格分区，括号图绘制实际括号。结构不是一张静态图片，所有主题仍能编辑、折叠、移动、聚焦和回源。

12 套自制配色方案同时设置画布、中心主题、主分支及后代颜色。提供彩虹分支、层级配色和单色模式，31 种节点轮廓、5 种分支线型、11 种关系端点选项和9种外框选项。目录计数包含“无轮廓／无箭头”等明确选项；它们不表示与商业产品同名资源逐项完全相同。

格式面板支持填充、文字、边框、线型、粗细、字体、字号、加粗、斜体、下划线、对齐、固定宽度、图片／标签／笔记摘要显示，以及标题局部文字范围格式。默认颜色计算可读对比度；用户显式输入的文字颜色会按输入保留。

优先级、进度、任务状态、符号、旗标、任务日期和负责人存入公开模型；0% 进度仍是可见标记。复制样式只复制视觉属性，不把任务、内容或原文身份混入。

## 组织与编辑

Enter 增加同级主题，Shift Enter 在前方插入，Tab 增加子主题并进入原位编辑；空格或双击编辑标题，Shift Enter 在编辑框中换行，Escape 放弃输入。方向键按实际几何在主题间选择。拖动与 Shift 多选继续走同一套版本校验；单击一个已多选主题会恢复单选。

外框可以包含同级主题并修改范围、文字、颜色和轮廓。概要创建真正可编辑的总结主题，它可以继续拥有子主题。删除概要括号只移除视觉关系，不隐式删除总结文字及其后代。复制完整分支与跨学习集剪切会携带完全包含的外框、概要和总结子树；跨集撤销恢复双方内容。

关系线可以编辑说明、颜色、粗细、虚实线和起止箭头。蓝色控制点调整曲线，端点可拖到另一主题；自环、冲突、重复连接及无效跨集重连被拒绝。单主题标注与多主题外框分开保存。

提供8种可追加模板、缩进／Markdown 标题快速输入、完整主题检索、优先级／状态／进度／日期筛选、全部笔记浏览。替换默认先只读预览，再按同一版本明确提交，保留原文快照；`$1` 等字符按字面量处理，不解释为替换模板。

## 动效、总览与性能边界

布局和颜色变化使用有界过渡；指针和键盘输入在几何命中之前结束主题动效，避免手写与拖动命中还在移动的显示坐标。系统“减少动态”优先于显式开启，单张导图也可以关闭动画。大型导图只对有限数量的已挂载主题播放过渡，不把全部节点加入动画队列。

导图始终保留完整模型。通常只挂载视口附近主题；缩放到一次出现超过600个主题时，用按样式合批的图形总览表示所有主题，关系路径也合批。总览不是截断结果；点击可回到可读细节，搜索、焦点、导出和批量操作仍遍历完整内容。总览保留高精度 pointerdown 命中，避免点击事件取整使亚像素主题落到相邻主题。

导航缩略图可拖动定位。专注模式扩大工作区；演示模式使用公开的持久化演示队列，以当前主题和分支上下文构造页面，提供切换动画、笔记及回源。极大分支单页最多显示81个上下文主题并明确提示；队列并不因此删去后续主题。

本机合成万主题测试不等价于商业 XMind 同机对比，也不代表万张重图片、实体数位笔或其它平台已经验收。性能数据、动画检查和实际构建指纹以本轮 artifacts 的机器报告为准。

## 导出与文件交换

`study.mindmap.export` 提供 SVG、PNG、PDF。SVG 保留矢量主题、文字、图形、关系线、标记及手写，摘录图片以内嵌图像保存。PNG和PDF由有界图像渲染，PDF为单页图像型输出，不声称是全矢量PDF。完整导出默认展开全部分支，可另选当前可见范围或分支。SVG上限64MiB，图像素材32MiB，位图最多2400万像素且单边不超过8192；超大图会缩小。已有目标文件一律拒绝覆盖。

JSON `.xmind` 工作簿提供检查、导入、导出：一个学习集对应一个画布；导入产生独立的新ID，不覆盖已有学习集。支持主题层级、主要结构、标签、纯文本笔记、部分标准样式、优先级、图片、关系、范围外框及概要；自己的扩展字段保留更多格式与内容。文库原文绑定和跨集引用只能转为可读来源说明，不能宣称是商业客户端内的实时PDF回源。

导入不按ZIP路径解压写入：所有附件均经格式归一化、生成新UUID和工作区校验。原档保留。路径穿越、符号链接、重复ID、过深／超量节点、危险对象键和变更的源版本被拒绝。外部图片不联网抓取；未知主题与额外内容产生兼容性提示，需要明确允许再导入。旧XML、加密文件、专有扩展及私有格式不伪装成功。

已做自身JSON工作簿和独立构造的公开模型样本往返测试；尚未在商业 XMind 客户端逐版本打开并验收其全部布局和资源。完整无损迁移与视觉一致性不是本轮的通过结论。

## 员工与冲突

所有持久编辑、结构、样式、标记、分组、替换、导入导出和模板都通过 `runtime.request`；没有浏览器私有业务状态或额外模型代理。员工使用当前宿主生成的作用范围启动器与凭据，14个新增接口均纳入正式员工覆盖。

格式草稿保留在窗口内存。并发编辑返回冲突，不自动重试覆盖；切换导图显示方式也保留未保存表单。关闭、换文档和宿主退出会检查未保存内容。草稿不承诺崩溃恢复。

主要命令：`study.mindmap.catalog`、`study.mindmap.configure`、`study.mindmap.topics.update`、`study.mindmap.decoration.set/remove`、`study.mindmap.relationship.update`、`study.mindmap.template.apply`、`study.mindmap.query`、`study.mindmap.replace`、`study.mindmap.outline.import`、`study.mindmap.export`、`study.mindmap.xmind.inspect/import/export`。演示沿用 `study.presentation.start {mode:"map"}`；公开 schema 给出完整参数、范围和拒绝规则。

测试入口：`npm run test:mindmap`、`npm run test:mindmap-ui`、`npm run test:mindmap-native`、`npm run test:mindmap-performance`。完整门禁仍使用 `npm run test:deep-audit` 和 `npm run test:agent-acceptance`，所有测试运行在隔离文库中。


## Files

用户原文件保留在实际目录中，可用 Finder/终端管理。文本以 UTF-8 为推荐，兼容 UTF-16 BOM 和 GB18030 回退。直接修改文件后，刷新/重新打开文档重建索引；旧内容读取会返回 SOURCE_CHANGED。原始文件重命名请优先用 fs.move，才能保留稳定文档 ID；外部重命名会被视作新路径。

内部状态：`.margin-reader/state.json` 保存文档 ID、目录、阅读位置、设置、上传与回收站索引；`cache/` 保存可重建的解析结果；`uploads/` 是未完成上传；`trash/<id>/item` 是可恢复删除的原件。内部状态只能通过 API 修改，不要手改 JSON 或锁目录。
学习集和卡片保存在 state.json 的 studySets；持久 PNG 在 .margin-reader/study-assets/<setId>/<cardId>.png。study-assets 属于用户数据，不是可清理的派生缓存；完整备份必须连同 state.json 保存。软删除仍保留快照文件供恢复。
自定义目录不写回 PDF/EPUB/Word 原件。外部正文变化后自定义目录保留，失效定位标记 unresolved，需明确重新绑定。toc.reset 才会用原文目录替换自定义目录。
web.import 生成自包含 HTML，记录原 URL、保存时间和可下载的内嵌图片。没有必要依赖原网站即可读取已保存正文；失败图片以占位和警告说明。仅抓取用户指定页面，不递归爬整站，不使用已有浏览器登录状态。
完整备份：停止写入后复制整个 workspace（含 .margin-reader）。只复制原件不会带走自定义目录、阅读位置和回收站。JSON 导出携带当前目录，HTML/TXT/Markdown 为便携阅读导出。PDF 的此类导出仅含文本层，扫描页没有 OCR 文字。原 PDF 可直接从文件夹复制。

## Errors

错误格式：`{"jsonrpc":"2.0","id":1,"error":{"code":-32000,"message":"...","data":{"code":"CONFLICT","details":{}}}}`。
- -32600 / INVALID_REQUEST：无效 JSON-RPC 请求；-32601 / METHOD_NOT_FOUND：未声明方法；-32602 / INVALID_PARAMS：参数缺失、类型或范围错误。
- SCOPE_DENIED、INVALID_PATH、PERMISSION_DENIED：越界、链接、受保护目录或系统权限拒绝。
- NOT_FOUND、ALREADY_EXISTS、CONFLICT、SOURCE_CHANGED：路径/数据已变化，重新读取后明确重试。
- UNSUPPORTED_FORMAT、INVALID_DOCUMENT、DRM_UNSUPPORTED、PASSWORD_REQUIRED、DEPENDENCY_MISSING：格式、损坏文件、版权保护或解析依赖限制。
- NOT_MEMBER：文档未加入当前学习集，先增加关联；CAPTURE_FAILED/CAPTURE_TIMEOUT：摘录图像生成失败，原件和已保存卡片保持不变。
- TOO_LARGE、PARSE_TIMEOUT、UPLOAD_LIMIT、INCOMPLETE_UPLOAD、CHECKSUM_MISMATCH：容量、资源或上传校验失败。
- URL_BLOCKED、INVALID_URL、HTTP_ERROR、NETWORK_ERROR、FETCH_TIMEOUT、TOO_MANY_REDIRECTS、ARTICLE_UNAVAILABLE：链接下载或正文提取失败。不会绕过付费墙/验证码/登录。
- STATE_CORRUPT、CACHE_CORRUPT：内部状态或缓存损坏；不自动清空用户数据。state 需从备份恢复；缓存可 document.open refresh:true 重建。
- HOST_UNAVAILABLE、AUTH_REQUIRED、REQUEST_TIMEOUT：员工传输不可用。宿主退出或凭据丢失明确失败，不创建另一个独立文库。
- INVALID_RESPONSE：宿主返回格式错误或请求 ID 不匹配；RUNTIME_CLOSED：传输已关闭。已提交的请求可能已经执行，error.data.details 的 requestId、method、mayHaveCompleted 用于核对；先检查业务状态，不自动重发或覆盖。

并发提交使用原子写入、fsync、文件锁与失败回滚。异常断电不能承诺跨多个磁盘文件的完整事务；发生崩溃后应保留工作区备份和 uploads/trash 原件再诊断。默认没有永久清空回收站接口。

## Compatibility

Agents Company CLI Plugin Contract v1；CommonJS runtime/CLI；Node >=22.13。运行依赖锁定并随 build:plugin 产物携带。UI 是相对静态资源，使用宿主 rpc/events/data 路由；独立 serve 使用等价的令牌回环服务，无 Electron 依赖。UI 完成初始化发送 ready；关闭先 flush 未完成写入，未保存草稿或保存失败会明确拒绝 flush。宿主仅负责窗口，不参与领域逻辑。

PDF 使用 PDF.js 原页画布与可选择文本层；Core 使用同版本提取原目录/全文。DOC 为纯文本读取（不保留旧 Word 图文版式）；DOCX、EPUB、MOBI/KF8 为流式正文，不能承诺所有排版与商业阅读器逐像素一致。RTF 需要 macOS 系统 textutil，其余核心格式不需要 Calibre/Office。ODT/FB2 是结构化文本读取。DRM 电子书不支持。扫描 PDF 可看原页，OCR 不在本轮范围。
网页抓取只允许公开 HTTP(S) 资源；每次重定向与图片下载都检查地址，拒绝内网和 DNS 重绑定。页面本体/图片大小、数量与超时有界。需要登录、客户端渲染或反爬验证的页面可能无法自动提取。项目不代表 MarginNote 官方，不兼容其私有数据库；图标为独立绘制的相近蓝白视觉。
宿主当前插件栏只渲染名称首字母，未提供自定义图标字段。本插件提供页面与 favicon 图标，不修改宿主的图标协议。
