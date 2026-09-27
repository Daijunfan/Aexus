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
Plugin file paths are relative to that employee's authorized folder. The folder
may be the Team root or a nested directory. A parent-folder employee can operate
all descendants; a child-folder employee cannot operate parents or siblings.
Do not override `--workspace` on a bound launcher. Paths and symlinks cannot
escape the selected scope. Build Teams do not receive this plugin automatically.
If a login shell resets PATH, use the absolute launcher path shown in AGENTS.md.
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
```

The CLI prints JSON. Use returned IDs rather than guessing. For structured
parameters use `api METHOD --data '{...}'` or `--data @request.json`; run
`schema METHOD` to get arguments and examples. Root workspace initialization is
automatic and empty: opening a folder does not create sample tasks or run models.

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
- Native rich pages, records and databases are stored as
  `Documents/<page-id>.mininotion.json`, with
  `{"format":"mininotion.page/v1","page":{...}}`. Prefer the page/block/database
  APIs to create these documents. External changes to this format are synchronized.
- `.mininotion/` contains workspace settings, histories, attachments, indexes,
  conflicts and draft recovery. Do not edit these managed files by hand.
- Existing Markdown is edited as Markdown source, so unrelated file text is not
  silently rewritten by a lossy rich-text conversion.
- `AGENTS.md`, `CLAUDE.md`, hidden metadata, dependency folders and build artifacts
  do not become note pages. No existing standalone Mini Notion data is migrated.

## Errors

Failures have stable error codes. `WORKSPACE_BOUNDARY` rejects paths outside the
workspace; `FILE_CONFLICT` means reread the file before saving; native patch
conflicts preserve drafts. A save failure is reported rather than shown as saved.
Only text previews up to 4 MB are loaded in the source editor; other files remain
available as files. Use the native schema for required page colors and typed
properties. Never silently retry destructive operations or switch workspaces.

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
