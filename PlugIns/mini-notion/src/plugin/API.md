---
schema: agents-company.cli/v1
plugin: mininotion
version: '{{VERSION}}'
workspace: required
---
# MiniNotion CLI/API

## Purpose

Render and edit notes, planning databases and calendar views inside the selected
filesystem workspace. The GUI and CLI share one backend. This profile never starts
its own AI agent; use the employees supplied by Agents Company.

All hosted renderer requests use the same declared CLI methods. This includes
`ui.register {ready?:boolean}` for client readiness; it never creates a window.
Workspace editing uses `workspace.patch` with conflict checks. Full replacement
is unsupported in folder mode, including from the renderer.

## Workspace

Use `mininotion --workspace /absolute/workspace ...` to choose any existing folder.
In a Work Team, the generated `mininotion` launcher binds the employee's own folder.
The Team name is arbitrary and never used to identify this plugin.

The layout is `page-folder-tree/v2`: every ordinary page owns one folder and
`index.mininotion.json`. The page tree exactly follows the physical folder tree.
The global collection is `<AgentsCompany>/workspaces/mini-notion-workspace`,
reported by `fs.info.collectionRoot`. Only its direct child folders are main pages. A Team folder
is therefore a main page; employee folders inside it are child pages, and each
additional directory level is one additional page level. A scoped employee view
never promotes a nested folder into a main page in the global collection.

`page.create {parentId}` automatically creates a folder immediately inside its
parent's folder. Databases and their records use the same per-folder layout.
`fs.path {pageId}` returns `absoluteDirectory`, `parentPageId`, `depth` (relative to
the global collection), `scopeDepth` and `mainPage`. `fs.audit` verifies every
page-directory edge and returns `valid`, `pages`, and `errors`. `fs.info` identifies
the selected scope and `collectionRoot`. New sibling names receive collision-safe
suffixes. Changing a title leaves its folder name stable; changing page ancestry
through `page.move` moves the complete directory tree and its ordinary files.

An existing employee folder can be edited as its corresponding page with `fs.bind {path:"."}`. Its global depth does not change. The collection root itself is a container; bind a child folder there.
From its parent workspace use the folder's relative path instead. The operation
is idempotent and preserves existing files. Directory pages open directly in the ordinary editor. Their first edit creates
the native index transactionally, without a page-role confirmation. No separate human/Agent ownership or permission
system is added; the host's existing workspace contract still applies.
Plugin file paths are relative to the selected workspace. A user's Team view
uses the Team root; an employee must bind a descendant directory, never the Team
root itself. A parent-folder employee can operate all descendants; a child-folder
employee cannot operate parents or siblings.
Do not override `--workspace` on a bound launcher. Paths and symlinks cannot
escape the selected scope. Build Teams do not receive this plugin automatically.
If a login shell resets PATH, use the absolute launcher path in `.agents-company/README.md` or the managed agent guide.
The host prepares a workspace-local JSON-RPC channel before starting employees;
the CLI uses it when present, including in network-restricted sandboxes. Keep
Workspace write permissions enabled for this mode. Ordinary terminals use the
same backend via its native local connection when the host channel is absent.

## Quick start

```sh
mininotion fs info
mininotion fs list
mininotion api fs.write --data '{"path":"plan.md","content":"# Plan\n\n- [ ] First task\n"}'
mininotion page create --title 'Project plan' --color white
mininotion database create --title Tasks --color blue --view calendar
mininotion schema record.create
mininotion api page.list --data '{}'

# From a host-bound employee launcher, edit the page corresponding to its cwd.
mininotion api fs.bind --data '{"path":".","title":"项目知识库","color":"white"}'
# Use the returned pageId as parentId; do not guess IDs.
mininotion api page.create --data '{"title":"设计笔记","parentId":"MAIN_PAGE_ID","color":"white"}'
mininotion api fs.path --data '{"pageId":"MAIN_PAGE_ID"}'
```

When creating a Work employee in Agents Company, select **绑定已有文件夹** and
use `fs.path`'s `absoluteDirectory` under the Team root. The equivalent user-side
host commands are:

```sh
agents plugin open mininotion --team '知识团队'
agents plugin call mininotion fs.info --team '知识团队'
agents card create --title '文档员工' --group '知识团队' --engine codex \
  --directory-mode bind --cwd '/absolute/team/知识库'
```

The folder must already exist. The host provisions the employee's own launcher,
API guide and schema; the plugin never creates a hidden agent or moves an existing
employee directory. MiniNotion declares `defaultWorkspace: "collection"`. The company's sidebar
and unscoped `plugin.open` show the plugin's workspace base and descendants, so
Team pages and user pages in that collection are visible together. Existing
`default/` files stay in place. Opening a specific Team shows that Team's same
files; existing Team roots outside the collection remain accessible with `--team`.
For pages that will be assigned to a Team employee, create them in that Team's
view or via `--team`, then bind the returned main-page directory. The default
collection remains an editable view of those same documents.
The standard host `build:plugins` command bundles this behavior; no development
`AGENTS_COMPANY_PLUGIN_DIRS` override is needed.

The CLI prints JSON. Use returned IDs rather than guessing. For structured
parameters use `api METHOD --data '{...}'` or `--data @request.json`; run
`schema METHOD` to get arguments and examples. Root workspace initialization is
automatic and empty: opening a folder does not create sample tasks or run models.

### Agent 最短成功路径（1.21.0）

先执行 `mininotion guide`；分步手册可用 `guide pages`、`guide databases`、
`guide delegation`、`guide verify`。这些内容也嵌入下方，不需要去插件源码里查表格格式。
启动器已绑定员工目录。`page.create` / `database.create` / `record.create` 都要传显式 `color`。
一个业务 API 成功后，必须使用返回 ID 回读；创建的是文件化原生页面，GUI 会读取同一数据。

下面的 Python 示例只调用已经安装的 CLI，不导入后端，不修改缓存。请在员工 cwd 执行。
它创建三层页面、写入富正文、建立真实数据库和四个视图并验收。
这是用户授权后执行的示例，不能在只读初始化时自动运行。

```python
import json, subprocess

def mn(method, **params):
    result = subprocess.run(
        ["mininotion", "api", method, "--data", "-"],
        input=json.dumps(params, ensure_ascii=False),
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)

root = mn("page.create", title="软件架构拆解", color="white")
child = mn("page.create", title="Core 技术分析", parentId=root["id"], color="white")
leaf = mn("page.create", title="请求校验与提交", parentId=child["id"], color="white")
for page in [root, child, leaf]:
    mn("page.write-markdown", pageId=page["id"], markdown=(
        "## 技术分析\n\n请用实际源码证据替换此说明。\n\n"
        "| 模块 | 职责 |\n| --- | --- |\n| Core | 共享后端 |\n"
    ))
db = mn("database.create", parentId=root["id"], title="模块与验证索引", color="blue", view="table")
mn("record.create", databaseId=db["id"], title="Core", color="white",
   blocks=[{"type":"paragraph", "content":"请填充已核验的分析摘要和源码位置"}])
for kind in ["board", "gallery", "list"]:
    mn("view.create", databaseId=db["id"], type=kind, name=kind)
print(json.dumps(mn("page.audit", pageId=root["id"]), ensure_ascii=False, indent=2))
print(json.dumps(mn("fs.path", pageId=root["id"]), ensure_ascii=False))
```

上述示例验证工具链，示例文字不能当作真实研究结论。实际架构拆解必须由分析员工
读取源码后填入：文件/行号、关键函数、调用链、状态和数据模型、错误路径、现有测试、
设计权衡及尚未验证事项。经理先检查已有主页面，继续填充，避免每次重试生成重复知识库。
多个员工的结果由经理汇总；递归深度按技术问题需要决定，不用空页面堆层级。

{{AGENT_GUIDE}}

## Commands

`schema.json` is the machine-readable catalog. JSON API requests use
`{"jsonrpc":"2.0","id":"unique-id","method":"page.list","params":{}}`.
Responses contain `result` or `error`, and may include `revision` and the current
workspace. `watch` streams changes. Use expected hashes with `fs.write` to
avoid overwriting another writer's changes.

| Method | Access | Description |
| --- | --- | --- |
{{COMMANDS}}

## Files

- Markdown, text/code, CSV, JSON, images and PDFs in ordinary folders are indexed
  recursively and rendered without importing data from the standalone app.
- `fs.read` and `fs.write` edit the actual file. `fs.remove` moves a
  file to the workspace recycle area; `fs.restore` restores it.
- Every native page has its own `index.mininotion.json`. For example:
  `Main/index.mininotion.json`, `Main/Child/index.mininotion.json`,
  `Main/Child/Grandchild/index.mininotion.json` and
  `Main/Database/Record/index.mininotion.json`. The directory ancestry is authoritative;
  externally moving a directory is reflected by `fs.sync` even when its JSON still
  contains an old parent ID. Synced-block sources are internal metadata, not extra
  sidebar pages. Ordinary files are previews under the owning page's Files section,
  not additional page-tree nodes; `page.tree {files:true}` explicitly includes them.
  All native documents use
  `{"format":"mininotion.page/v1","page":{...}}`. Prefer the page/block/database
  APIs to preserve IDs, typed values and references; valid external file edits
  are synchronized into the same GUI and CLI state. Invalid files are reported
  in `fs.info.errors` / `fs.sync.errors`; they are not overwritten by stale saves.
- The layout has no fixed application-level page-depth limit. Practical limits
  remain memory, filesystem size and rendering cost; it is not mathematically
  infinite storage.
- Moving a subtree relocates its complete directory, attachments and ordinary
  files while preserving page IDs. A failed save rolls the directory move back.
  Employee bindings pointing into a deliberately moved directory need the new path;
  title-only edits do not move directories.
  Trash/restore preserve content; permanent page deletion does not delete the
  containing physical folder or an employee's unrelated files.
- Referenced local attachments are copied by immutable asset ID into the owning
  page folder's `.mininotion` store when saving, so an employee bound there can
  read them without searching an ancestor. Shared references to a different main
  page remain references, not duplicate writable databases: use a scope containing
  both folders when editing cross-folder relations or shared content.
- Existing `Documents/<page-id>.mininotion.json` files are read in place and are
  not automatically migrated. `fs.organize` defaults to `dryRun:true` and returns
  a page-by-page move plan. Back up the workspace first, then explicitly call
  `fs.organize {dryRun:false}` to apply that plan. Page IDs and parent links stay
  unchanged; existing directories are retained. Check employee bindings before
  moving old documents out of a legacy `Documents` directory.
- `.mininotion/` contains workspace settings, histories, attachments, indexes,
  conflicts and draft recovery. Do not edit these managed files by hand.
- Existing Markdown is edited as Markdown source, so unrelated file text is not
  silently rewritten by a lossy rich-text conversion.
- `AGENTS.md`, `CLAUDE.md`, hidden metadata, dependency folders and build artifacts
  do not become note pages. No existing standalone Mini Notion data is migrated.

### Example filesystem

```text
workspace/
  产品知识库/
    index.mininotion.json         # main page
    <child-id>.mininotion.json    # parentId points to the main page
    <nested-id>.mininotion.json   # parentId points to the child; same folder
    <database-id>.mininotion.json # all database properties and views
    <record-id>.mininotion.json   # parentId points to the database
    notes.md                     # optional original Markdown
    .mininotion/                  # local attachments and scope metadata
  研究资料/
    index.mininotion.json
```

`fs.path` is authoritative; do not derive a filename from a later page title.
Normal backups should copy the entire workspace, including hidden metadata and
attachments. Do not edit indexes or cached `workspace.json` to change page content.
Native document files remain the source of truth after a rescan. Migration can
be rolled back by restoring the complete pre-migration backup while the plugin
is closed; do not restore only the cache over newer document files.

## Errors

Failures have stable error codes. `WORKSPACE_BOUNDARY` rejects paths outside the
workspace; `FILE_CONFLICT` means reread the file before saving; native patch
conflicts preserve drafts. A save failure is reported rather than shown as saved.
`FILE_BUSY` means another scope is saving that physical directory; reread state
before retrying. Multi-file writes preflight hashes and roll back completed file
changes when a write or cache-save callback fails. `FILE_RECOVERY_REQUIRED`
reports a failed rollback and requires inspection of the backed-up workspace.
This is not a claim of cross-file atomicity under sudden power loss; after a
crash inspect `fs.sync.errors` before continuing. `ASSET_CONFLICT` rejects an
immutable attachment ID with different bytes. External editors should write
complete files atomically; the plugin cannot lock arbitrary third-party tools.
Only text previews and `fs.write` payloads up to 4 MB are accepted; larger files remain
available through local filesystem tools. Use the native schema for required page colors and typed
properties. Never silently retry destructive operations or switch workspaces.

## Theme presentation

Themes reuse `settings.get` and `settings.set`; no document or employee API changes.
`schema` for `settings.set` includes `appearance.application` with the supported choices.
The optional appearance keys are `palette` (classic, ocean, aurora, iris, rose, sunset,
mint, graphite), `wallpaper` (none, glow, dots, grid), and `motion` (system, reduced).
All palettes support light/dark and the existing system theme setting. System reduced
motion is always respected; decorative effects are finite and need no animation engine.

```sh
mininotion api settings.set --data '{"changes":{"appearance":{"palette":"aurora","wallpaper":"glow","motion":"system"}}}'
```

`changes.appearance` replaces the existing appearance object: read and merge existing
fields first to preserve custom settings. The GUI does this automatically. Choosing a
palette in the GUI sets its default accent, surface and wallpaper; density, motion and
Agent display settings are retained. Explicit custom accent and warm/cool surface may
be applied afterwards. `appearance: null` restores the default presentation. No page
files, page colors, covers, workspace paths or execution permissions are rewritten.

## Compatibility

Plugin contract version 1; Node 22+ runtime. The same source builds an independent
macOS app, a `--workspace` CLI and this hosted renderer. Folder mode keeps AI
sessions in the host and rejects `agent.*`. Full-workspace replacement/restore and
PDF export are not offered in this profile; use the folder itself for backup and
Markdown, HTML, JSON or CSV for document export. The normal standalone data mode
retains its existing desktop features. The host discovers this package from its
manifest and does not import MiniNotion-specific domain code.


### Presentation in Agents Company

默认界面为白色/中性灰与对应深色模式，参考 [Notion 的侧栏与页面导航](https://www.notion.com/help/navigate-with-the-sidebar)。
页面 `color` 仍通过 CLI 编辑并持久保存，用于页面标签和事件侧边标识，正文保持中性纸面。
`settings.set` 中的 `theme`（light/dark/system）控制插件与宿主插件侧栏的明暗；宿主公司背景设置不受影响。
主界面、树形目录、数据库、编辑器、搜索和设置使用原有共享 API，没有静态截图覆盖层。
宿主的 `schedule.*` 是独立的员工调度基础，本插件当前不调用它。

### Local icons and editing (1.16.0)

Page `icon` and callout `props.emoji` accept an emoji, `icon:<name>:<color>`,
an uploaded local asset URL, or `""` to remove the icon. `schema` and
`schema page.update` expose `icons.names` (1,703 Lucide symbols), `icons.colors`
(10 theme-aware colors), and the wire format. Invalid reserved `icon:` values
return `INVALID_ICON` without changing the document. Existing emoji strings stay unchanged.

```sh
mininotion page update PAGE_ID --icon 'icon:BookOpen:blue'
mininotion block update PAGE_ID BLOCK_ID --props '{"emoji":"icon:Lightbulb:yellow"}'
mininotion block duplicate PAGE_ID BLOCK_ID
mininotion block update PAGE_ID BLOCK_ID --type heading --props '{"level":2}'
mininotion block move PAGE_ID BLOCK_ID --target-page-id TARGET_PAGE_ID
```

The hosted UI offers searchable emoji/icon/upload tabs, Chinese and English search,
local image uploads via `fs.asset-upload`, callout icon selection, `:name` inline emoji,
and the same block operations. The bundled Unicode 16.0 catalog has 3,781 sequences;
the OS supplies their glyphs. No remote icon/font/image service is needed. Covers offer
local gradients, nine solid colors (`solid-gray`, `solid-brown`, `solid-orange`,
`solid-yellow`, `solid-green`, `solid-blue`, `solid-purple`, `solid-pink`, `solid-red`)
and file upload. `page.update --cover solid-blue` uses the existing page field.

Hosted shortcuts: Cmd/Ctrl+N creates a page; K/P opens search; F finds within the page;
backslash toggles the sidebar; Shift+L switches theme; [ and ] navigate history.
Native independent Mini Notion keeps its native menu accelerators.

### Local editing and navigation (1.17.0)

- `block.update`, `block.duplicate` and `block.move` accept `ids` alongside the existing `blockId` argument. Selection roots are processed in document order; selected children travel with selected parents exactly once. The operation validates before commit. Multi-block responses are arrays; the original single-block shape remains unchanged. Cross-page movement carries block comments.
- `block.get` includes `url`, a `mininotion://page/PAGE_ID#BLOCK_ID` anchor. `page.open --block-id` reveals a matching block, including one inside a closed toggle. Normal links can use the same URL.
- `search` supports quoted phrases, `titleOnly`, `inPageId` (including descendants), `kind` (all/page/database), `sort` (relevance/edited-desc/edited-asc/created-desc/created-asc), `dateField` (edited/created), `after` and `before`. Results include an excerpt around the match, `path` and matching `blockId`. UI search uses this same Core query.
- `equation` blocks store LaTeX in `props.expression`. Inline content accepts `{type:"inlineMath",props:{expression:"x^2"}}`. KaTeX and its fonts are local; invalid syntax remains editable and renders an error. `schema block.append` lists these content types and fields.
- `bookmark` blocks store `props.url`, `title`, `description`; `breadcrumb` blocks derive a live path from the page tree. Bookmark metadata is entered locally and does not fetch remote pages.
- `page.open --mode tab` opens a page in a new tab. `settings.get/set` exposes `pageTabs` (a nonempty array of page IDs or null for Home) and `activeTab` (a valid zero-based index). The hosted UI persists the same preferences through the shared writer. Cmd/Ctrl+T opens a tab; Cmd/Ctrl-clicking a page also opens a tab.

```sh
mininotion block duplicate PAGE_ID FIRST_BLOCK_ID --ids FIRST_BLOCK_ID,SECOND_BLOCK_ID
mininotion block move PAGE_ID FIRST_BLOCK_ID --ids FIRST_BLOCK_ID,SECOND_BLOCK_ID --target-page-id DESTINATION_ID
mininotion search '"local first"' --in-page-id ROOT_ID --sort edited-desc
mininotion block append PAGE_ID --type equation --props '{"expression":"E = mc^2"}'
mininotion page open PAGE_ID --block-id BLOCK_ID
mininotion page open PAGE_ID --mode tab
```

Editor shortcuts: Cmd/Ctrl+D duplicates the current selection; Cmd/Ctrl+Alt+0…9 transforms blocks (text, H1/H2/H3, to-do, bullet, numbered, toggle, code, quote); Cmd/Ctrl+Enter toggles a checkbox; Cmd/Ctrl+Shift+H repeats the most recent block/slash color. `> ` creates a toggle and `" ` creates a quote. Slash menus expose `/equation`, `/inline equation`, `/bookmark`, `/breadcrumb`, `/duplicate`, `/delete`, and color names such as `/red background`. Sidebar icons can be edited in place and the page tree supports arrow-key navigation.

### Reliability regression (1.17.1)

The hosted renderer retains its save-first close behavior. Standalone local drafts are persisted before close; a draft-write or flush failure keeps the window open and reports the concrete error. The default Core/API and desktop suites cover 152 and 46 cases respectively, using deterministic protocol peers rather than live models. No business command or permission contract was relaxed.

### Page lifecycle and verification (1.20.0)

Folder-mode pages share the same model: `parentId` determines main/child position.
`page.move` supports main-to-child and child-to-main moves, preserving IDs.
Ordinary directories open in the editor without a role-confirmation button.
Their first edit or trash operation creates the native index transactionally.

`page.trash` archives a subtree. Each operation has a separate restore group,
even within the same millisecond. `page.restore` leaves independently archived
children in trash. Scans cannot acknowledge pending edits. Permanent removal
retains physical folders with a lifecycle marker instead of regenerating pages.

The **更多 → 文件位置** menu exposes `fs.path` results and folder copying.
Page navigation never inserts a delayed filesystem banner into the document.

`npm test` rebuilds the backend, runs all tests, and gates all 197 hosted methods
on successful service-level scenarios with assertions. It records exercised
failure cases separately. Adding an API without a backend scenario fails the gate.
The ledger is `.local-data/contract-results/methods.json` by default; use
`MINI_NOTION_TEST_RESULTS` to select a results directory. Desktop rendering and
navigation have separate tests; method coverage is not exhaustive input coverage.


### Event display and reminder timestamps

Calendar, timeline, plan and overview screens display persisted records. A recurring template's future preview is a plan to generate records, not a second hidden set of calendar records. `repeat.preview`, `repeat.history`, `record.list` and `view.render` retain their existing meanings. Generated records preserve `automationOrigin`; changing the UI does not change that origin or schedule.

In 1.22.1, `overview.get` / `overview.render` reminder items expose their effective snoozed date/time in the reminder's display timezone. `status` distinguishes `待提醒`, `稍后提醒` and `已提醒`; an old delivery key cannot mark a changed reminder completed. A short event's larger on-screen hit target does not extend its saved duration. Use the API timestamp fields for actual times and the displayed timezone for interpretation.


### 编辑器分类与选区 AI（1.23.0）

颜色菜单使用纯色块预览实际文字色/背景色，不再使用字母 A。斜杠菜单顶部横向分类，左右拖动排序；管理入口支持添加、改名、删除分类和勾选命令。删除分类不删除命令，全部分类一直可用；输入搜索词会跨分类搜索。`settings.set {changes:{slashCategories:[{id,name,commands:[命令标题]}]}}` 与 UI 保存同一工作空间偏好。

选中文字点击机器人，默认自动发送，回复出现在迷你聊天框；点击框外或 Escape 关闭，不取消已发送任务。齿轮可编辑前置提示词、选择宿主员工及切换直接发送/先编辑再发送。`settings.set {changes:{selectionAI:{prompt,mode:"send"|"edit",employeeId?}}}` 保存相同配置。首次只自动选择与页面文件夹绑定的就绪员工；没有绑定时先选员工，随后一键发送。忙碌/未就绪/权限失败显示真实错误，不换员工。

宿主专用的 `assistant.list {}`、`assistant.send {employeeId,text,clientMessageId}` 和 `assistant.read {employeeId,messageId}` 也可经 `agents plugin call mininotion METHOD --params JSON` 或宿主绑定 CLI 调用。send 的 clientMessageId 复用 Core 私聊重试机制；read 仅投影该 messageId 对应原生回合的文字回复与错误，不包括后续无关回合、不确认用户已读。

这些方法不启动 MiniNotion 独立 Agent、不创建员工、不得任意调用宿主 API。方法 schema 标记 `agentAccess:operator`，普通员工不能因插件工作空间授权获得此入口；用户/全局管理者仍通过原 requestHost 进入 session.status/list/send/transcript/info 的当前身份及目标授权。独立 App 使用原空间 Agent；文件夹模式只有在 Agents Company 宿主中支持选区 AI。普通 API 覆盖报告独立统计文件夹后端方法，assistant 方法由宿主交互测试及确定性协议 fixture 验证。
