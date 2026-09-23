# Mini Notion 命令行与本地 API

CLI 和桌面应用共享同一个工作空间；CLI 可以单独使用，也可以在图形端打开时使用。所有数据保存在本机。

## 文件夹模式与宿主插件

1.14：`--workspace /absolute/folder` 选择已有的任意工作文件夹，与 `--data-dir`
的原生数据库模式分开。Agents Company 自动生成的 `mininotion` 启动器已绑定
员工自己的工作目录，因此所有文件参数相对该员工目录。员工目录可以嵌套，父目录
可以读取和编辑后代目录中的文档，子目录不能向上或向兄弟目录越界。Build 模式不自动注入插件。

```sh
mininotion --workspace /absolute/folder fs info
mininotion --workspace /absolute/folder fs list
mininotion --workspace /absolute/folder api fs.write --data '{"path":"writer/plan.md","content":"# Plan\n"}'
mininotion --workspace /absolute/folder page create --title 项目计划 --color green
mininotion --workspace /absolute/folder database create --title 日程 --view calendar --color blue
```

`fs.read` 返回实际内容和 hash，`fs.write --hash HASH` 拒绝覆盖更新后的文件。
`fs.remove` / `fs.restore` 使用本工作区回收目录；`fs.sync` 立即同步外部文件变化。
结构化文档保存为 `Documents/<id>.mininotion.json`；`.mininotion/` 由后端管理。
原有的 `folder.*` 仍用于原生空间中的文件夹树，与此处的 `fs.*` 不冲突。

宿主通过统一 manifest 和 JSON-RPC 接入同一个后端，不导入独立 App 的个人数据。
插件模式拒绝 `agent.*`、全库替换/恢复和 PDF 导出，Agent 由宿主提供。
备份请复制整个 Workspace，文档可导出为 Markdown/HTML/JSON/CSV。
`npm run build:plugin -- --out PATH` 生成包含标准 Markdown 与 schema 的独立软件包。
普通原生数据模式继续支持既有桌面功能。

## 原生 API 版本说明

1.13.1：默认浅色主题与白色空白页；`color=default` 解析为 white。预设扩展为 30 色，包含 scarlet（正红）、coral（珊瑚红）、crimson（酒红）、rose（玫红）、emerald（翡翠绿）、cobalt（宝蓝）、navy（藏青）等。`schema` 返回完整配色表，GUI 直接复用该表。已有记录颜色继续保留。

1.13 页面颜色：新建页面、数据库、记录、空间及子项目必须传 `--color`。页面和日历事件共用 `color` / `textColor`，不再区分纸张背景与页面颜色；旧数据保留已选配色，无颜色的旧页面补为蓝色。模板和复制继承颜色。字段、兼容范围及重要性约定见 [APPEARANCE.md](APPEARANCE.md)。

```sh
mininotion page create --title 项目 --color blue
mininotion record create DATABASE_ID --title 关键事项 --color red
mininotion page update PAGE_ID --color orange --text-color default
```

1.12 历史外观接口（页面配色以 1.13 规则为准）：应用、Agent、页面及视图的样式均先通过已有数据命令读写。命名配色适配浅/深色，页面、视图和应用支持六位 HEX；`appearance: null` 恢复默认。模板目录提供 14 个模板及分类、搜索、内容和样式的文本投影。完整字段与验收记录见 [APPEARANCE.md](APPEARANCE.md)。

```sh
mininotion schema page.update
mininotion settings set --changes '{"appearance":{"surface":"warm","accentColor":"green","agentColor":"purple","agentMessages":"plain"}}'
mininotion page update PAGE_ID --changes '{"appearance":{"backgroundColor":"green","surface":"paper","coverSize":"compact"}}'
mininotion view update DATABASE_ID VIEW_ID --changes '{"appearance":{"backgroundColor":"blue","cardColor":"default","accentColor":"blue"}}'
mininotion block update PAGE_ID BLOCK_ID --props '{"backgroundColor":"yellow","textColor":"default"}'
mininotion template list --category 学习 --query 论文
mininotion template use research-note --parent-id PAGE_ID
mininotion ui command appearance --params '{"pageId":"PAGE_ID"}'
mininotion ui command settings --params '{"tab":"appearance"}'
mininotion ui command view-settings --params '{"databaseId":"DATABASE_ID","viewId":"CURRENT_VIEW_ID","section":"appearance"}'
mininotion ui command templates --params '{"query":"论文"}'
```

1.11.2 日历：日期格固定等高，单日与跨日事件共用四行紧凑布局，所选属性在统一的单行摘要中显示，多余事件通过当天明细查看。`view.render` 的 `weeks.events` 提供单日及跨日事件的统一位置，`totalSlotCount` 为总行数，`visibleSlotCount` 为可见行数，`hiddenByDate` 列出各日期折叠的记录 ID；原有 `weeks.segments/slotCount` 保持跨日投影语义，`days[].records` 仍返回全部记录。当前日历可用 `ui command calendar-day --params '{"pageId":"数据库ID","viewId":"当前日历视图ID","date":"2026-09-20"}'` 打开当天明细；`visible:false` 或 `ui command close-dialog` 关闭。

1.11.1：`ui launch --background` 在后台启动并保持独立进程，不显示或聚焦窗口。`agent.history --format text` 输出可读的会话与操作摘要；`--raw` 保留原生事件。正常回合完成会自动发送队列；停止会暂停队列，重新发送任务或 `agent queue <spaceId> --action run` 会恢复自动续发。工具操作默认折叠，可用 `/focus off` 展开。

记录的 `values` 支持属性 ID 或唯一名称，落盘统一使用 ID；未知名称、重名或同一属性重复赋值会报错。计划视图的 `planShowBacklog` 控制未排期侧栏，省略时仅在有内容时显示；可通过 `view.update --changes` 配置。提示块使用 `props.emoji` 和 `props.backgroundColor`，可查看 `schema block.append` 中的示例。

## 1.11 Agent 与综合日程

Agent 使用官方 Codex App Server 或 Claude Agent SDK；下面的命令也是面板控件使用的接口。原生控制运行在绑定 Workspace 的文件边界内。

```sh
mininotion agent capabilities <spaceId>
mininotion agent protocol <spaceId>
mininotion agent configure <spaceId> --options '{"model":"模型ID","effort":"high","mode":"agent"}'
mininotion agent configure <spaceId> --options '{"config":{"你的原生配置项":"值"}}'
mininotion agent command <spaceId> --text '/model 模型ID'
mininotion agent command <spaceId> --text '/config model_reasoning_effort="high"'
mininotion agent command <spaceId> --text '/plan'
mininotion agent steer <spaceId> --text '运行中追加的指令'
mininotion agent respond <spaceId> <requestId> --result '{"decision":"accept"}'
mininotion agent sessions <spaceId>
mininotion agent rename <spaceId> '发布排期讨论'
mininotion agent new <spaceId>
mininotion agent fork <spaceId>
mininotion agent resume <spaceId> <sessionId>
```

`--replace` 用于替换完整 options 对象，省略字段恢复默认；传入 `--before` 编辑前配置，可合并其他控件或 CLI 的同期修改。面板的 JSON 编辑器使用这两个参数，避免覆盖同期选择。

`options` 还支持 `command`（CLI 可执行文件或 wrapper）、`approval`、`thinking`（Claude：true/false/null）和 `serviceTier`（Codex）。`config` 是引擎原生配置；需要重启才能生效的项在下一轮重新连接并恢复会话。Plan 模式同时限制物理文件写入和页面 API 写入。

Claude 默认使用官方 SDK 配套的 Claude Code 二进制；设置 `command` 或 `MINI_NOTION_AGENT_CLAUDE` 才改用指定 CLI。`/config thinking=false outputStyle=Concise` 直接交给 Claude 原生解析器和配置写入器。空间位于其他 Git 仓库内时，会建立独立仓库，确保项目配置保存在本空间。

`options.sdk` 接受 Claude 官方 SDK 可 JSON 化的运行参数，例如 `mcpServers`、`tools`、`allowedTools`、`agents`、`extraArgs` 和 `maxTurns`。工作目录、会话身份、系统说明、审批回调和进程启动由宿主管理，SDK 参数不会替换这些绑定。修改 SDK 参数会重新连接并恢复当前会话。

```sh
mininotion agent configure <claudeSpaceId> --options '{"sdk":{"tools":["Read"],"maxTurns":10}}'
mininotion agent configure <claudeSpaceId> --options '{"sdk":{}}'
```

`focusView` 控制专注视图：工具与已完成交互合并折叠，待回答的请求保持可见。用 `/focus on`、`/focus off`、面板按钮或面板内 Ctrl+Alt+F 切换；CLI 仍保留完整事件和工具记录。

`composerEnterBehavior` 支持 `enter`、`cmdIfMultiline`、`cmdAlways`；`followUpQueueMode` 支持 `queue`、`steer`、`interrupt`。运行期间默认排队；停止后队列暂停，可编辑、移除或继续执行。每个历史会话保留自己的待发送队列。

```sh
mininotion agent context <spaceId> --query '计划'
mininotion agent send <spaceId> --text '精确修改此段' --context '[{"pageId":"子页面ID","blockId":"块ID","quote":"选中文字"}]'
mininotion agent send <spaceId> --text '下一步任务' --delivery queue --file-ids '["文件ID"]'
mininotion agent queue <spaceId>
mininotion agent queue <spaceId> --action update --message-id <messageId> --text '修改后的任务'
mininotion agent queue <spaceId> --action remove --message-id <messageId>
mininotion agent queue <spaceId> --action run
```

原生方法和参数从 `agent protocol` 发现。Codex 的 Schema 由当前安装的 CLI 自行生成；Claude 使用官方 SDK 控制方法，参数按调用顺序放入 `params.args`：

```sh
mininotion agent control <codexSpaceId> --method config/read --params '{"includeLayers":true}'
mininotion agent control <claudeSpaceId> --method getContextUsage --params '{"args":[{"detail":"summary"}]}'
mininotion agent control <claudeSpaceId> --method get_settings --params '{}'
mininotion agent control <claudeSpaceId> --method backgroundTasks --params '{"args":["toolUseId"]}'
mininotion agent control <claudeSpaceId> --method stopTask --params '{"args":["taskId"]}'
mininotion agent history <spaceId> --raw --limit 1000
mininotion ui command agent --params '{"pageId":"空间ID","tab":"config"}'
```

Claude 同时暴露公开 SDK 中的原生控制请求，例如 `get_settings`、`rename_session`；这些方法按 Schema 直接传字段，不使用 `args`。后台任务在 UI 中合并显示开始、更新与完成事件，并提供移到后台和停止操作。

审批可返回完整原生结果：Claude 的 `updatedPermissions` 会交给 SDK 应用；Codex 支持原生 `availableDecisions` 中的会话许可与规则变更。无效的 Claude 许可响应不会被当作允许。

审批和问题使用引擎原生格式。Claude 工具审批为 `{"behavior":"allow"}` 或 `{"behavior":"deny","message":"原因"}`；Codex 普通执行审批为 `{"decision":"accept"}` 或 `{"decision":"decline"}`。其他请求按原生参数定义回答。

```sh
mininotion space sync <spaceId>
mininotion overview get --scope today
mininotion overview get --space-id <spaceId> --date 2026-09-12
mininotion overview configure --changes '{"view":"calendar","date":"2026-09-12","hideCompleted":true}'
mininotion overview render
mininotion view update <databaseId> <viewId> --unset columnWidths,hiddenGroups
```

`space.sync` 将原生文件工具或外部编辑器写入的任意层级文件同步到空间面板。综合页面与 CLI 共用 `overviewProjection`，返回每项记录的来源、日期、状态、提醒、分组、日期格和跳转地址；`dateLabel` 保留完整开始、结束时刻与时区。完成操作仍使用 `record.update` 或 `block.update`。

日历、计划和时间线统一用 `calendarBy` 指定起始日期属性，用 `timelineEnd` 指定可选独立结束属性。`schema view.create` 与 `schema view.update` 返回全部字段说明，无效字段明确报错。

## 启动

安装包内自带 Node 运行时，不需要另装 Node：

```sh
"$HOME/Applications/Mini Notion.app/Contents/Resources/cli/mininotion" --help
```

应用放在 `/Applications` 时，替换上述应用路径。可将这个启动器软链接为 PATH 中的 `mininotion`。不要直接链接 `.app` 内的可执行文件；它默认启动图形端。

在源码目录运行：

```sh
npm install
npm run build
./bin/mininotion --help
./bin/mininotion status
```

默认目录是 `~/Library/Application Support/Mini Notion`。开发或建立另一个独立工作空间：

```sh
./bin/mininotion --data-dir ./my-notes workspace init --name 我的笔记 --empty
./bin/mininotion --data-dir ./my-notes page create --title 第一篇笔记
```

`workspace init` 只初始化空目录，已存在时拒绝覆盖。图形端首次打开会自动添加入门示例。后续示例使用已加入 PATH 的 `mininotion`。

## 命令发现和输入输出

```sh
mininotion --help
mininotion block append --help
mininotion schema
mininotion schema view.update
mininotion page list
mininotion --format text page tree
mininotion --format csv record list DATABASE_ID
```

`PAGE_ID`、`DATABASE_ID`、`BLOCK_ID`、`VIEW_ID` 是示例占位符，应替换成命令返回的实际 ID。页面、块、属性和视图 ID 稳定，不依赖显示名称。

- 默认 stdout 是 JSON；失败时 stderr 输出含 `code`、`message` 和可选 `details` 的 JSON，并以非零状态退出。
- `--format text` / `--format markdown` 输出可读文本；记录列表可使用 `--format csv`。
- JSON 参数支持直接文本、`@file.json` 或 `-`（读取 stdin）。
- 每条命令都有 `--data`，可传完整参数对象；`api METHOD --data JSON` 直接调用同一方法。
- `--envelope` 包含 API 请求 ID、修订号和响应；`watch` 持续输出 JSON Lines 事件。

```sh
mininotion page create --color blue --title '中文笔记' --blocks '[{"type":"paragraph","content":"从命令行开始写作"}]'
mininotion block append PAGE_ID --type heading --text '本周重点' --props '{"level":2}'
mininotion block append PAGE_ID --type checkListItem --text '完成初稿' --props '{"checked":false}'
mininotion block format PAGE_ID BLOCK_ID --from 0 --to 2 --styles '{"bold":true,"textColor":"blue"}'
mininotion block move PAGE_ID BLOCK_ID --parent-id PARENT_BLOCK_ID
mininotion page update PAGE_ID --changes '{"font":"serif","fullWidth":true,"locked":false}'
mininotion search '本周'
mininotion page trash PAGE_ID
mininotion page restore PAGE_ID
```

`block append --blocks @blocks.json` 和 `block update --changes @changes.json` 支持完整块结构：嵌套、多栏、表格、媒体、页面引用与关联数据库。`block list PAGE_ID --flat` 返回父块 ID 和位置。`block format` 支持 bold、italic、underline、strike、code、textColor、backgroundColor，以及 link URL；`false` 清除对应样式。

## 数据库、计划与日历

```sh
mininotion database create --color blue --title '每周计划' --view plan
mininotion property list DATABASE_ID
mininotion record create --color blue DATABASE_ID --title '完成设计稿' --values '{"date":"2026-09-10","status":"进行中","priority":"高"}'
mininotion view list DATABASE_ID
mininotion view update DATABASE_ID VIEW_ID --changes '{"calendarBy":"date","dateAnchor":"2026-09-10","planMode":"week"}'
mininotion --format text view render DATABASE_ID --view-id VIEW_ID
mininotion record update PAGE_ID --values '{"date":"2026-09-11","status":"已完成"}'
mininotion view navigate DATABASE_ID VIEW_ID --direction next
mininotion view create DATABASE_ID --type calendar --name '周历' --config '{"calendarBy":"date","calendarMode":"week"}'
```

支持 `table`、`board`、`plan`、`calendar`、`timeline`、`gallery`、`list`、`chart`、`feed`、`form`。每种可创建多份，独立配置。计划支持 `week`、`day`、`agenda`、`hourWeek`、`hourDay`，`planDoneBy` / `planDoneValue` 指定完成属性，`planHideCompleted` 隐藏已完成；未设置完成属性时会识别复选框或含“已完成”选项的状态属性。

`view render` 返回实际筛选和排序后的记录、可见属性，以及对应的分组、计划日期、时间范围、图表系列、动态正文或表单问题。日期型视图用 `view navigate --date YYYY-MM-DD`、`--direction previous/next/today` 控制，图形端立即同步。

```sh
mininotion view update DATABASE_ID VIEW_ID --changes @view-config.json
mininotion property add DATABASE_ID --name '分数' --type number
mininotion property add DATABASE_ID --name '计算结果' --type formula --formula 'prop("分数") * 2'
mininotion formula evaluate PAGE_ID --expression 'if(prop("状态") == "已完成", "完成", "继续")'
mininotion record bulk --ids 'PAGE_A,PAGE_B' --values '{"status":"已完成"}'
mininotion form submit DATABASE_ID VIEW_ID --title '新记录' --values @answers.json
```

`view.update` 的 `changes` 与 [src/types.ts](src/types.ts) 中 `DatabaseView` 一致：筛选组、排序、分组/子分组、隐藏/折叠组、属性顺序/可见性、列宽/汇总、卡片预览/尺寸、打开方式、时间线缩放、图表维度与聚合、表单问题等。规则 ID 可自行指定稳定字符串。

```json
{
  "filters": {
    "id": "active-tasks",
    "conjunction": "and",
    "rules": [{ "id": "not-done", "property": "status", "operator": "is_not", "value": "已完成" }]
  },
  "sorts": [{ "id": "by-date", "property": "date", "direction": "asc" }],
  "hiddenProperties": ["tags"],
  "openPagesIn": "center"
}
```

在正文内创建数据库与关联视图：

```sh
mininotion database embed PAGE_ID --title '内联计划' --view plan
mininotion database embed PAGE_ID --database-id DATABASE_ID --view board
mininotion view list DATABASE_ID --owner-page-id PAGE_ID --block-id BLOCK_ID
mininotion view update DATABASE_ID VIEW_ID --owner-page-id PAGE_ID --block-id BLOCK_ID --changes '{"name":"我的独立视图"}'
```

关联视图的 `view.*`、`record.list`、`form.submit` 接受 `--owner-page-id` 和 `--block-id`，使用该块的独立视图配置；修改记录仍然作用于共享数据源。

## 丰富属性、人员和文件

当前支持 21 种属性类型：`text/number/select/status/multiSelect/date/checkbox/url/email/phone/person/files/createdTime/editedTime/createdBy/editedBy/uniqueId/relation/rollup/formula/button`。系统属性只读；其他值通过 `record update --values` 或 `page update --values` 修改。

```sh
mininotion property add DATABASE_ID --name '状态' --type status --definition '{"statusGroups":{"todo":["排队"],"doing":["制作","审核"],"done":["已交付","已取消"]},"defaultStatus":"排队"}'
mininotion property update DATABASE_ID PROPERTY_ID --changes '{"optionColors":{"已取消":"purple"}}'
mininotion property update DATABASE_ID PROPERTY_ID --changes '{"statusGroups":{"todo":["待办"],"doing":["制作","审核"],"done":["已交付","已取消"]}}' --option-renames '{"排队":"待办"}'
mininotion property add DATABASE_ID --name '任务编号' --type uniqueId --definition '{"idPrefix":"TASK"}'
mininotion property add DATABASE_ID --name '创建时间' --type createdTime
mininotion property add DATABASE_ID --name '最后编辑者' --type editedBy
mininotion search 'TASK-12'
```

状态分组固定为 `todo/doing/done`；选项可自行命名、排序和设色。颜色为 `gray/brown/orange/yellow/green/blue/purple/pink/red`。`optionRenames` 同步已有记录、视图筛选、按钮和自动化里的字面值引用；公式中的自定义文本表达式由用户自行修改。计划默认识别整个完成组；`planDoneValue` 可进一步限定某一个值。系统时间可作为 `calendarBy` 用于日历/时间线/计划，`record.schedule` 会拒绝改写它。

```sh
mininotion person list
mininotion person create --name '小林' --email 'lin@example.test'
mininotion person update PERSON_ID --name '林老师'
mininotion person delete PERSON_ID
mininotion property add DATABASE_ID --name '负责人' --type person --definition '{"personLimit":1}'
mininotion record update PAGE_ID --values '{"PERSON_PROPERTY_ID":["PERSON_ID"]}'
mininotion formula evaluate PAGE_ID --expression 'prop("负责人").map(current.email()).join(",")'
```

人员值保存完整名片，接受人员 ID、姓名或邮箱作为输入；`person list` 返回当前本地作者（ID 为 `local`）及名片列表。更新名片会同步已有引用；删除名片会从选择列表移除，已有记录的署名仍保留。多人属性不设置 `personLimit`。人员筛选可使用 ID、姓名或邮箱，分组键使用稳定人员 ID。

```sh
mininotion property add DATABASE_ID --name '参考文件' --type files
mininotion asset add ./brief.pdf
mininotion record update PAGE_ID --values '{"FILES_PROPERTY_ID":[{"name":"项目说明.pdf","url":"ASSET_URL"}]}'
mininotion asset get ASSET_URL --output ./download/brief.pdf
mininotion page get PAGE_ID
```

把 `asset add` 返回的本地地址替换到 `ASSET_URL`；文件数组还可包含 `id/mimeType/size`。增加、移除、重排或重命名都通过更新这个数组完成，已有文件保留其 ID；上传仍使用 `asset.add`，下载使用 `asset.get --output`。网页附件可直接填写 HTTP(S) 链接。按钮动作对人员和文件也支持 `set/add/remove/clear`。

编号从 1 起按数据库分配，前缀只改变显示。删除和撤销不会回收已分配编号；完整备份保存分配表。复制/导入生成新的记录身份，完整恢复则保留备份中的状态。旧记录的创建/编辑时刻沿用已有数据，没有历史作者信息时作者字段为空。

## 数据库模板与项目排期

### 数据库自定义模板

```sh
mininotion template list --database-id DATABASE_ID
mininotion template create DATABASE_ID --color blue --title '会议记录' --values '{"status":"未开始"}' --blocks @agenda.json
mininotion template create DATABASE_ID --from-page-id PAGE_ID --title '项目模板'
mininotion template default DATABASE_ID --template-id TEMPLATE_ID
mininotion template default DATABASE_ID --view-id VIEW_ID --template-id TEMPLATE_ID
mininotion record create --color blue DATABASE_ID --title '本周会议'
mininotion record create --color blue DATABASE_ID --template-id none --title '空白记录'
mininotion template use TEMPLATE_ID --title '新项目'
mininotion template apply TEMPLATE_ID PAGE_ID
mininotion template update TEMPLATE_ID --values '{"priority":"高"}'
mininotion block append TEMPLATE_ID --text '模板正文也能使用全部块命令'
mininotion template duplicate TEMPLATE_ID
mininotion template delete TEMPLATE_ID
```

模板使用完整页面编辑器，包含正文、属性和子页面，也可包含子项目。创建实例时重新生成页面/块 ID 并重映射内部引用。模板不会混入普通记录或搜索结果，`page list --templates` 可显式包含模板。删除模板会清理默认模板设置；模板仍可从回收站恢复。

数据库默认模板适用于没有独立默认设置的视图；视图级 `none` 表示使用空白页面。关联视图可通过带 `--owner-page-id` / `--block-id` 的 `view update` 设置 `defaultTemplateId`。显式填写的标题和属性优先于模板默认值。

### 子项目与依赖

```sh
mininotion database configure DATABASE_ID --sub-items
mininotion subitem create --color blue PAGE_ID --title '设计阶段' --values '{"priority":"高"}'
mininotion subitem children PAGE_ID --recursive
mininotion subitem set CHILD_ID --parent-id PARENT_ID
mininotion subitem set CHILD_ID --parent-id none
mininotion view update DATABASE_ID VIEW_ID --changes '{"subItemDisplay":"nested","subItemFilter":"all","collapsedItems":[]}'
mininotion dependency add SUCCESSOR_ID PREDECESSOR_ID
mininotion dependency remove SUCCESSOR_ID PREDECESSOR_ID
mininotion dependency set PAGE_ID --blocked-by '["PREDECESSOR_ID"]'
mininotion dependency list DATABASE_ID
```

`subItemDisplay` 支持 `nested`、`flat`、`card`；`subItemFilter` 支持 `all`、`parents`、`children`。表格、列表和时间线可嵌套展开；看板、画廊和日历可在父卡片中显示子项目。卡片模式显示父项目，平铺模式可分别安排子项目。

启用后会生成父项目、子项目、被阻挡和正在阻挡等关联属性。它们可重命名、显示/隐藏、筛选，并用于公式和汇总；使用 `relation set PAGE_ID PROPERTY_ID --ids JSON` 或 `record update --values JSON` 也能修改这些关系。父子关系和依赖必须属于同一数据库，循环会被拒绝。

```sh
mininotion database configure DATABASE_ID --dependencies '{"enabled":true,"dateProperty":"start","endProperty":"end","shift":"maintain","avoidWeekends":true}'
mininotion record update PAGE_ID --values '{"start":"2026-09-14","end":"2026-09-16"}'
mininotion history undo --page-id PAGE_ID
```

自动排期以天为单位：`none` 保持手动排期；`overlap` 在重叠时将后续任务移到前置任务结束后的日期；`maintain` 保持原有间隔并沿依赖链传播。`avoidWeekends` 在自动移动时避免起止日期落在周末，并保留原时长。一次日期变更及其影响的后续任务作为一个操作提交和撤销。锁定的后续任务若需要移动，整次操作会返回错误并保持原数据。

### 跨日安排和只读日期预览

日期视图使用 `calendarBy` 指定日期属性。该属性可包含开始和结束；`timelineEnd` 可选，用于旧版的两个独立属性。日历将多日安排显示为连续日期条，并在跨周时分段；计划视图显示每天涉及的任务。

```sh
mininotion view update DATABASE_ID VIEW_ID --changes '{"calendarBy":"start","timelineEnd":"end"}'
mininotion record schedule PAGE_ID 2026-09-14 --end 2026-09-18 --start-property start --end-property end
mininotion record schedule PAGE_ID 2026-09-21 --start-property start --end-property end
mininotion record schedule PAGE_ID none --start-property start --end-property end
mininotion view render DATABASE_ID --view-id VIEW_ID --date 2026-10-01
mininotion view render DATABASE_ID --view-id VIEW_ID --from 2026-09-14 --to 2026-09-18
```

省略 `--end` 时，排期移动保留已有持续时间。`view render --date` 只改变这一次输出的日期，不修改 GUI 的保存状态；`--from` / `--to` 按日期范围相交筛选，也包含开始于范围之前、仍在范围内持续的任务。

### 单个日期属性中的范围、时间与时区

单日仍可用 `"2026-09-11"`。范围与时间使用对象：`{"start":"2026-09-11T09:30+08:00","end":"2026-09-11T11:00+08:00","timeZone":"Asia/Shanghai"}`。时区采用 IANA 名称；时间保存为带偏移的 ISO 字符串，普通日期不受时区偏移影响。

```sh
mininotion record update PAGE_ID --values '{"date":{"start":"2026-09-14","end":"2026-09-18"}}'
mininotion record schedule PAGE_ID 2026-09-11T09:30 --end 2026-09-11T11:00 --time-zone Asia/Shanghai --start-property date --end-property ''
mininotion record schedule PAGE_ID 2026-09-12T14:00 --start-property date --end-property ''
mininotion record schedule PAGE_ID 2026-09-14 --end 2026-09-18 --all-day --start-property date --end-property ''
mininotion view render DATABASE_ID --view-id VIEW_ID --from 2026-09-14 --to 2026-09-18
```

未指定 `--end` 时，按日期移动保留原时刻与范围，跨夏令时仍保持本地钟表时间；指定新的具体开始时间则保留原时长。`--all-day` 去掉具体时间。图形端在日期弹层切换时区时保持同一时刻，开始和结束随新时区显示。日历、计划和时间线均识别属性内部范围，时间线缩放保留原时刻。

公式可使用 `dateStart(prop("日期"))`、`dateEnd(prop("日期"))` 与 `dateBetween`；排序按实际时刻，日期筛选与分组按属性所属时区的日期。`view render` 的 `schedule` 同时提供起止值、时区和毫秒时间戳。CSV 导出可读范围，JSON 与工作空间备份完整保留结构。依赖自动排期目前仍按天移动。

### 小时计划与文本时间表

```sh
mininotion view update DATABASE_ID VIEW_ID --changes '{"planMode":"hourWeek","timeZone":"Asia/Shanghai","dateAnchor":"2026-09-11"}'
mininotion --format text view render DATABASE_ID --view-id VIEW_ID
mininotion record schedule PAGE_ID 2026-09-11T14:00 --end 2026-09-11T15:30 --time-zone Asia/Shanghai --start-property date --end-property ''
mininotion view update DATABASE_ID VIEW_ID --changes '{"planMode":"hourDay","timeZone":"UTC"}'
mininotion view navigate DATABASE_ID VIEW_ID --direction next
```

`hourWeek` 为周时间表，`hourDay` 为日时间表。`timeZone` 只设置当前视图的显示时区，切换视图时区不改记录的日期或时区。`schema` 会列出可选的计划布局。

周时间表的 PDF 使用横向页面，保留时间网格并附完整日程明细，避免重叠事项的长标题被截断。

`view render` 的 `timeGrid` 包含各天的真实分钟数、小时刻度及 UTC 偏移、全天记录和定时事项。每个事项包含起止时刻、原始时间戳、显示区间、重叠分列和跨日标记；文本输出包含时间段与事项名称。截止到午夜的定时事项不会多占次日。

图形端双击空白时段创建一小时事项，拖动按 15 分钟对齐，底部拖柄调整结束时间。未设置结束时刻的事项以 30 分钟长度显示，数据仍保持无结束时刻。未排期或单日全天事项拖入网格默认一小时，多日全天事项保留日期跨度，已有定时事项保留持续时间。拖到「全天」可移除具体时刻，拖到「未排期」清除日期。

选中事项后，`⌥↑/↓` 移动 15 分钟，`⌥←/→` 移动一天，`⌥⇧↑/↓` 调整结束时刻。CLI 使用同一 `record.schedule`、`record.update`、`history undo/redo` 操作完成对应修改。

## 循环模板、提醒与收件箱

```sh
mininotion repeat configure TEMPLATE_ID --rule '{"frequency":"weekly","interval":1,"weekdays":[1,5],"startDate":"2026-09-14","time":"09:00","timeZone":"Asia/Shanghai","catchUp":"latest","dateProperty":"date","titlePattern":"每周复盘 {date}"}'
mininotion repeat preview TEMPLATE_ID --after 2026-09-13T00:00:00+08:00 --count 5
mininotion repeat list --database-id DATABASE_ID
mininotion repeat pause TEMPLATE_ID
mininotion repeat resume TEMPLATE_ID
mininotion repeat run TEMPLATE_ID
mininotion repeat history --template-id TEMPLATE_ID
mininotion repeat remove TEMPLATE_ID
mininotion scheduler status
mininotion scheduler run
```

`frequency` 为 `daily / weekly / monthly / yearly`，`interval` 为正整数。`weekdays` 使用 1（星期一）到 7（星期日）。月/年规则可使用 `monthMode: day / lastDay / nthWeekday`；`monthDay` 指定几号，短月份使用月底；`ordinal: 1/2/3/4/-1` 与 `weekday` 配合表示第几个/最后一个星期几。年循环采用 `startDate` 所在的月份。`endDate` 可限定最后日期。

`catchUp` 的 `latest` 补最近一次，`all` 补全部，`skip` 跳过错过的时刻（当前分钟的到期计划仍执行）。补全部每次检查最多生成 100 次，后台会继续处理剩余次数；响应的 `pendingTemplates` 列出还有到期计划的模板。暂停保留进度，恢复时仍按补发策略处理。

`dateProperty` 选择自动填写的日期属性，空字符串表示不填写。`includeTime` 和 `durationMinutes` 控制具体时间与时长，`dateOffsetDays` 可把日期前移/后移；`shiftDates` 以模板原日期为基准，平移其他日期及子项目。`titlePattern` 可使用 `{date}`、`{time}`、`{weekday}`、`{year}`、`{month}`、`{day}`，其中日期包含所设偏移。

`repeat run` 额外生成一次，不改变固定循环进度。`scheduler run --at ISO_TIME` 会真实推进调度并生成页面/提醒；查看未来请用只读的 `repeat preview`。规则编辑保留已执行进度，复制模板或页面 JSON 导入后的循环默认停用，避免复制后自动创建大量页面。

```sh
mininotion reminder add PAGE_ID --at 2026-09-14T15:00:00+08:00 --text '回来检查进展'
mininotion reminder add PAGE_ID --property-id date --offset 1 --unit days --day-time 09:00 --time-zone Asia/Shanghai
mininotion reminder list --page-id PAGE_ID
mininotion reminder update PAGE_ID REMINDER_ID --changes '{"enabled":false}'
mininotion reminder update PAGE_ID REMINDER_ID --changes '{"enabled":true,"offset":15,"unit":"minutes"}'
mininotion reminder snooze PAGE_ID REMINDER_ID --until 2026-09-15T09:00:00+08:00
mininotion reminder delete PAGE_ID REMINDER_ID
mininotion reminder restore PAGE_ID REMINDER_ID
mininotion --format text inbox list --status unread
mininotion inbox read NOTIFICATION_ID
mininotion inbox unread NOTIFICATION_ID
mininotion inbox archive NOTIFICATION_ID
mininotion inbox restore NOTIFICATION_ID
mininotion inbox read --all
mininotion ui command inbox
mininotion ui command scheduler
mininotion ui command reminder --params '{"pageId":"PAGE_ID"}'
mininotion settings set --changes '{"desktopNotifications":true}'
```

提醒可绑定固定时间或日期属性。`offset` 为提前量，负数表示之后；`unit` 为 `minutes`（实际分钟）或 `days`（日历天，跨夏令时保持钟表时刻）。日期没有时间时，使用 `dayTime`，默认 09:00。未指定提醒时区时跟随日期属性，属性也无时区则使用本机时区；提醒编辑时 `timeZone: ""` 表示跟随属性。清空日期或将页面放入回收站会暂停对应提醒，日期再次可用后恢复；改动日期会重新计算触发时刻。模板本身不发提醒，生成页面后按副本的日期生效。

通知先写入收件箱，再发送事件，不依赖图形窗口。已读和归档都有逆操作，`reminder snooze` 推迟当前通知并归档旧通知。完整备份包含规则、执行进度和收件箱；恢复后按备份中保存的进度继续。一批自动生成页面作为同一次操作提交，撤销该操作会撤销这些页面，但不会回退调度进度并立刻再次生成。

后台在 GUI/CLI 启动时自动运行，关闭 GUI 后继续工作，系统重启后需再次启动 GUI 或 CLI。macOS 横幅默认关闭，可在设置或 CLI 中开启，并需系统允许通知。关闭窗口后应用主进程仍可显示横幅；完全退出应用后后台继续记录收件箱，退出期间不显示横幅。测试使用隔离通知适配器，避免对真实桌面发送测试提醒。

## 按钮与数据库自动化

文档 `/按钮` 和数据库按钮属性使用同一动作配置。属性按钮运行时传记录 ID；配置时可传数据库 ID。

```sh
mininotion button create PAGE_ID --label '开始复盘' --confirmation '插入复盘内容？' --actions '[{"type":"insert","position":"afterButton","blocks":[{"type":"heading","props":{"level":2},"content":"本周复盘"},{"type":"checkListItem","content":"完成回顾"}]}]'
mininotion button list --page-id PAGE_ID
mininotion button get PAGE_ID --block-id BLOCK_ID
mininotion button preview PAGE_ID --block-id BLOCK_ID
mininotion button run PAGE_ID --block-id BLOCK_ID --confirm
mininotion button configure PAGE_ID --block-id BLOCK_ID --config @button.json
mininotion button create DATABASE_ID --property --label '完成' --actions '[{"type":"set","values":{"done":true}}]'
mininotion button run RECORD_ID --property-id PROPERTY_ID
mininotion action history --page-id PAGE_ID
mininotion history undo --page-id PAGE_ID
```

`button.json` 含 `label`、可选 `confirmation` 和 `actions`。动作 ID 可省略，保存时生成。`preview` 返回步骤结果、完整变更与打开页面等效果，不写入数据；按钮触发的自动化也包含在预览中。若配置了确认文字，`run` 必须带 `--confirm`；可加 `--expected-config @config.json`，配置被修改时拒绝执行。

| 动作类型   | 配置                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------- |
| `set`      | 修改 `target` 页面的 `title` 和 `values`；`operations` 按属性指定 `set/clear/toggle/add/remove` |
| `create`   | `databaseId`、可选 `templateId/title/values`；使用数据库默认模板或指定模板                      |
| `edit`     | `databaseId`、`filters`、可选 `filterFormula`，对筛选出的记录应用 `title/values/operations`     |
| `insert`   | `target`、`blocks`，`position` 为 `start/end/beforeButton/afterButton`，插入新的独立块          |
| `notify`   | `text`，写入当前页面的本地收件箱通知                                                            |
| `reminder` | `target`、`at`（ISO 时间或日期公式）、可选 `text`                                               |
| `variable` | `name`、`value`，供后续动作引用                                                                 |
| `open`     | `target`、`mode`（`full/side/center`）；打开已运行的 GUI 中的页面                               |
| `trash`    | 将 `target` 页面移到回收站                                                                      |

`target` 为 `current`（默认）、`created`（前一步最近创建的页面）或页面 ID。`values` 使用属性 ID；多选与关联支持追加/移除，复选框支持切换。GUI 中可按名称选择关联记录。公式、汇总、按钮及系统时间/作者/编号属性不能由动作写入。

值可写为 `{ "formula": "prop(\"次数\") + 1" }`。可使用当前属性、`trigger`（触发页）、`current`（正在修改的页）、`created`（最近创建的页）、`triggerTime`（触发时刻）及前面定义的变量。比如 `created.prop("名称")`、`dateAdd(triggerTime, 1, "days")`。批量修改中，`current` 随记录变化，`trigger` 保持不变；`filterFormula` 必须计算为 `true` 才匹配。插入的富文本块保持原内容。

配置数据库规则：

```sh
mininotion automation create DATABASE_ID --rule @rule.json
mininotion automation list --database-id DATABASE_ID
mininotion automation get DATABASE_ID AUTOMATION_ID
mininotion automation preview DATABASE_ID AUTOMATION_ID --page-id RECORD_ID
mininotion automation run DATABASE_ID AUTOMATION_ID --page-id RECORD_ID
mininotion automation update DATABASE_ID AUTOMATION_ID --rule @changes.json
mininotion automation pause DATABASE_ID AUTOMATION_ID
mininotion automation resume DATABASE_ID AUTOMATION_ID
mininotion automation delete DATABASE_ID AUTOMATION_ID
mininotion action history --owner-id DATABASE_ID
```

属性变化示例 `rule.json`（属性 ID 按实际数据库替换）：

```json
{
  "name": "完成时记录时间",
  "triggers": [{ "type": "property", "propertyId": "done" }],
  "triggerMode": "any",
  "filters": {
    "id": "scope",
    "conjunction": "and",
    "rules": [{ "id": "finished", "property": "done", "operator": "is", "value": "true" }]
  },
  "actions": [{ "type": "set", "values": { "date": { "formula": "triggerTime" } } }]
}
```

`triggers` 也可使用 `{ "type": "created" }`。`triggerMode: "all"` 要求各条件在约三秒内发生；`filters` 支持嵌套 AND/OR，`viewId` 可限定现有视图的筛选范围。删除触发/范围属性会暂停受影响规则，失效的动作筛选会报错。手动 `automation.run/preview` 直接对所选记录执行动作，不等待触发条件。

定时规则使用 `triggers: []` 和 `schedule`，其字段与循环模板一致，例如：

```json
{
  "name": "每周创建复盘",
  "triggers": [],
  "schedule": {
    "frequency": "weekly",
    "interval": 1,
    "weekdays": [5],
    "startDate": "2026-09-11",
    "time": "17:00",
    "timeZone": "Asia/Shanghai",
    "catchUp": "latest"
  },
  "actions": [
    {
      "type": "create",
      "databaseId": "DATABASE_ID",
      "title": { "formula": "formatDate(triggerTime, \"YYYY-MM-DD\") + \" 复盘\"" }
    }
  ]
}
```

定时规则没有当前记录，应使用 `create/edit` 或指定目标页。后台运行与补发使用 `scheduler.run`；`automation.list` 返回进度和最近错误。进度不随撤销倒退，复制数据库时规则默认暂停，完整备份保留规则与进度。

按钮的全部页面修改和它触发的自动化作为一个操作提交；某条规则失败会保留用户原始编辑，回滚该规则的部分修改，并记录具体步骤错误。自动化不会继续触发其他自动化；循环模板生成记录也不触发新增规则。收件箱通知和执行日志不随页面撤销删除。最近保留 300 次执行记录。当前动作完全本地运行，不包含邮件、Slack 或 webhook。

## 评论与同步块

```sh
mininotion settings set --changes '{"authorName":"我"}'
mininotion comment add PAGE_ID --text '需要确认的问题'
mininotion comment add PAGE_ID --block-id BLOCK_ID --quote '选中的正文' --text '内容批注'
mininotion comment list PAGE_ID --status open
mininotion comment reply PAGE_ID THREAD_ID --text '已确认'
mininotion comment update PAGE_ID THREAD_ID COMMENT_ID --text '更新后的评论'
mininotion comment react PAGE_ID THREAD_ID COMMENT_ID --emoji '👍'
mininotion comment resolve PAGE_ID THREAD_ID
mininotion comment reopen PAGE_ID THREAD_ID
mininotion comment delete PAGE_ID THREAD_ID --comment-id COMMENT_ID
mininotion comment restore PAGE_ID THREAD_ID --comment-id COMMENT_ID
mininotion ui command comments --params '{"pageId":"PAGE_ID"}'
```

评论支持页面讨论和正文块引用，删除原块后仍保留摘录。移动正文块到另一页面时会携带对应讨论；普通页面复制不会复制评论，JSON 导入会保留评论并重建其引用。评论是本机数据，作者名称用于本地署名。

```sh
mininotion sync create PAGE_ID --block-ids BLOCK_A,BLOCK_B --name '共享约定'
mininotion sync list
mininotion sync get SOURCE_ID
mininotion sync link SOURCE_ID TARGET_PAGE_ID
mininotion block update SOURCE_ID BLOCK_ID --text '所有引用一起更新'
mininotion sync update SOURCE_ID --name '团队规范'
mininotion sync unlink TARGET_PAGE_ID REFERENCE_BLOCK_ID
mininotion sync delete SOURCE_ID --detach
```

`sync create` 返回 `sourceId` 和引用块。同步源可复用全部 `block`、`comment`、`history` 命令；`page list --internal` 可列出隐藏源。转换时选择同级连续块，也可以用 `--blocks @blocks.json` 创建新正文。`unlink` 把当前引用转为独立内容；`delete --detach` 先保留各处正文再将源放入回收站。嵌套引用会检查循环。复制页面继续共享原源；JSON 导入则创建独立同步源。

## 附件、迁移、历史和备份

```sh
mininotion asset add ./photo.png
mininotion asset list
mininotion file import ./notes.md
mininotion file import ./table.csv
mininotion file export PAGE_ID --type md --output ./exports/note.md
mininotion file export PAGE_ID --type pdf --output ./exports/note.pdf
mininotion file export PAGE_ID --type json --output ./exports/page.json
mininotion backup export ./workspace.mininotion
mininotion history list PAGE_ID
mininotion history snapshot PAGE_ID
mininotion history restore PAGE_ID VERSION_ID
mininotion history operations --page-id PAGE_ID
mininotion history undo --page-id PAGE_ID
mininotion history redo --page-id PAGE_ID
```

JSON 页面导出包含评论、引用到的同步源、子页面和数据库定义，附件复制到导出文件旁；重新导入会生成新的页面/块 ID 并重映射内部引用。导出数据库记录时还会携带属性定义；导入为独立数据库中的记录，保留内部子项目和依赖。文件外的依赖不自动复制，响应中的 `omittedDependencies` 会报告数量。完整工作空间迁移使用 `.mininotion` 备份。PDF 使用隔离的只读快照和真正的桌面渲染器，CLI 无需打开主窗口或处理文件对话框。

破坏性命令使用显式参数，例如 `backup restore FILE --confirm`、`page purge PAGE_ID --confirm`。恢复完整备份前会自动保存含附件的旧工作空间备份。

`.mininotion` 备份同时携带 `spaces/` 下的空间文件；恢复会连同目录结构一起写回。

## 空间与 Agent

一个顶层页面就是一个空间（Workspace），两者严格一一对应；顶层数据库同样是空间，子页面和内部模板继承所属空间。空间拥有独立的文件目录和可选的自定义文件夹层级，并固定绑定一个 Agent。空间主页面不能移动为子页面；更换引擎需要新建空间。

```sh
mininotion space list
mininotion space create --color blue --title 研究 --engine claude
mininotion space get PAGE_ID
mininotion space configure PAGE_ID --title 新名称
mininotion space convert PAGE_ID --engine claude
mininotion space upload PAGE_ID --path ./note.md --folder-id FOLDER_ID
mininotion space remove-file PAGE_ID FILE_ID
mininotion space reveal PAGE_ID
mininotion folder list PAGE_ID
mininotion folder create PAGE_ID --name 资料 [--parent-id FOLDER_ID]
mininotion folder rename PAGE_ID FOLDER_ID --name 新名称
mininotion folder move PAGE_ID FOLDER_ID [--parent-id FOLDER_ID]
mininotion folder delete PAGE_ID FOLDER_ID --confirm
mininotion file list PAGE_ID
mininotion file record PAGE_ID --name note.md --url URL [--folder-id FOLDER_ID]
mininotion file get PAGE_ID FILE_ID
mininotion file read PAGE_ID FILE_ID [--encoding base64]
mininotion file create PAGE_ID --name report.md --content '报告正文'
mininotion file write-content PAGE_ID FILE_ID --content '更新后的正文'
mininotion file rename PAGE_ID FILE_ID --name 新名称.md
mininotion file move PAGE_ID FILE_ID [--folder-id FOLDER_ID]
mininotion file remove PAGE_ID FILE_ID
```

CLI 文件路径按调用命令时的当前目录解析；直接 JSON RPC 调用应提供绝对路径。

永久删除 Workspace 会先回收其所有引擎，再清理物理目录和全部会话日志。若磁盘清理失败，可用 `space purge PAGE_ID` 重试；该命令拒绝清理仍存在的页面。

空间文件落在 `spaces/<主页面 ID>/` 或其文件夹目录下。`space upload` 一次完成落盘与登记，返回文件 ID、URL、名称、大小和类型；同名上传保留独立副本。URL 含空间命名空间，移动和重命名保留稳定地址。`file read` 返回内容和实际路径；二进制使用 `--encoding base64`。`file remove` / `space remove-file` 可通过操作历史撤销；永久删除空间时清理磁盘。主页面自动展示这些文件的链接。

### Agent

同一 Workspace 可以打开多个 Agent 会话标签，各自独立执行、暂停、配置和保留历史；它们共用这个 Workspace 的文件和主页面。`agent.new` 不会中止其他会话。`agent.sessions` 返回稳定的 `conversationId`、原生 `sessionId`（记录的 `state.sessionId`）、状态、未读和关闭状态。控制命令的 `--conversation-id` 只指定目标，不切换用户当前标签。新会话继承当前配置，此后各会话的模型、模式和配置独立保存。

```sh
mininotion agent new PAGE_ID
mininotion agent sessions PAGE_ID
mininotion agent send PAGE_ID --conversation-id CONVERSATION_ID --text "继续本会话的工作"
mininotion agent configure PAGE_ID --conversation-id CONVERSATION_ID --options '{"model":"gpt-5.6-sol"}'
mininotion agent history PAGE_ID --conversation-id CONVERSATION_ID
mininotion agent resume PAGE_ID CONVERSATION_ID
mininotion agent close PAGE_ID --conversation-id CONVERSATION_ID
mininotion agent attach PAGE_ID --conversation-id CONVERSATION_ID
```

主回复结束但后台任务仍运行时，`delivery=interrupt` 也会先停止后台任务再发送。关闭标签会停止该会话的前台执行和后台工具、暂停队列；历史仍可用 `agent.resume` 打开。整个 Workspace 移入回收站会停止其所有会话。配置和审批始终属于发起请求的会话，切换标签不会改变后台会话的权限。

Agent 与空间一一对应，创建空间时选定引擎。它通过 Mini Notion 的命令行接口改动页面：系统提示中会注入空间根页面 ID 与命令用法，通过每轮绑定的 CLI 身份限制页面、数据库与文件操作的空间范围。系统管理命令保留给 Professional CLI。页面修改由 Agent 自己调用 `mininotion` 完成，不会绕过单写入服务。

```sh
mininotion agent start PAGE_ID --prompt "把会议记录整理成页面并列出待办"
mininotion agent send PAGE_ID --text "再补充一条待办"
# 多文件、多图片可与文本一起发送，也可完全不传文本
mininotion agent send PAGE_ID --files '["/absolute/brief.txt","/absolute/photo.png"]'
mininotion agent send PAGE_ID --text "整理为项目" --files '["/absolute/brief.txt","/absolute/photo.png"]'
mininotion agent send PAGE_ID --file-ids '["已保存的文件 ID"]'
mininotion agent status PAGE_ID
mininotion agent history PAGE_ID --limit 10000
mininotion agent history PAGE_ID --raw --limit 10000
mininotion agent stop PAGE_ID
mininotion agent attach PAGE_ID      # 持续输出该空间的 agent 事件（JSON Lines）
```

`agent start` 与 `agent send` 立即返回，不会等待这一轮结束；用 `mininotion watch` 或 `mininotion agent attach` 观察进度。会话记录写入 `agents/<页面 ID>.jsonl`，工作空间中只保留最近 50 条消息与会话 ID，重启后可读取完整历史并续接同一个引擎会话。正在执行的进程中断会明确标记失败；不会静默替换 Session。原始引擎事件保存在 `agents/<页面 ID>.events.jsonl`，用 `agent history --raw` 读取。工具开始与结束按稳定 ID 合并，完整保留输入和输出。

事件流新增 `agent` 类型：

```json
{
  "type": "agent",
  "pageId": "…",
  "event": { "kind": "message", "message": { "role": "agent", "kind": "text", "text": "…" } }
}
```

`kind` 为 `status`、`message`、`usage` 或 `session`。引擎可用 `MINI_NOTION_AGENT_CLAUDE`、`MINI_NOTION_AGENT_CODEX` 覆盖可执行文件。运行时根据原生完成、失败与停止事件管理任务。

GUI 的 Agent 默认停靠在右侧，可切换为可拖动浮窗；位置通过 `settings set --changes '{"agentPanelPosition":{"x":300,"y":80}}'` 读写。`ui command agent --params '{"pageId":"空间 ID"}'` 打开同一会话；`ui command space --params '{"pageId":"空间 ID","fileId":"文件 ID"}'` 定位文件；`ui command close-dialog` 关闭面板。子页面沿祖先链使用同一个 Agent。

Agent 结果支持 `[页面](mininotion://page/PAGE_ID)` 和 `[文件](mininotion://space/SPACE_ID/file/FILE_ID)`。聊天附件先落盘再发送；纯附件同样记录为一条用户消息。正文支持 Markdown 标题、列表、表格、代码与链接，工具输出折叠显示。

常用结构化方法的 `schema` 包含 `examples`，例如 `schema view.create` 给出筛选组、排序和日历字段的参数示例。普通命令支持 `block update` 和 schema 返回的 `block.update` 两种写法；JSON API 使用 `api block.update --data ...`。

## 并发、事件和原子批处理

```sh
mininotion watch
mininotion conflict list
mininotion conflict get CONFLICT_ID
mininotion conflict resolve CONFLICT_ID --strategy local
mininotion conflict resolve CONFLICT_ID --strategy remote
mininotion batch --operations @operations.json
```

不同页面、不同属性和不同块的并发修改会合并；同一内容的冲突会返回 `CONFLICT` 并保留草稿。`local` 应用保留的草稿，`remote` 保留当前数据。图形端的“设置 → 数据与备份”也能查看冲突和操作记录。未提交的图形草稿在重启后继续恢复。

`batch` 在内存中执行全部数据操作，一项失败则全部不提交；只支持共享内核的数据命令，不包含文件、窗口或备份操作。

```json
[
  { "method": "record.update", "params": { "pageId": "PAGE_A", "values": { "status": "已完成" } } },
  { "method": "record.update", "params": { "pageId": "PAGE_B", "values": { "status": "进行中" } } }
]
```

## 文本控制图形端

```sh
mininotion ui launch
mininotion page open PAGE_ID --view-id VIEW_ID
mininotion ui command search --params '{"query":"设计稿"}'
mininotion ui command settings
mininotion ui command window-fullscreen --params '{"enabled":true}'
mininotion ui command zoom --params '{"factor":1.2}'
mininotion settings set --theme dark
mininotion settings set --changes '{"sidebarHidden":true,"sidebarWidth":280}'
```

其他 GUI 命令：comments、comment-selection、select-all、new-page、import、export、help、find、sidebar、theme、back、forward、home、save、trash、templates、history、conflicts、operations、close-dialog、window-show、window-hide、window-minimize、window-close、quit。关闭窗口和退出会先等待编辑保存。macOS 主进程没有窗口时，`ui launch` / `ui command window-show` 可恢复窗口，`ui command quit` 可直接退出；`status` 用 `desktopClients` 和 `guiClients` 区分主进程与窗口。需要窗口的 GUI 命令在未打开时返回 `GUI_NOT_RUNNING`；数据操作不依赖 GUI。

## 编程接口

标准输入输出支持逐行 JSON RPC 2.0：

```sh
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"page.list","params":{}}' | mininotion serve --stdio
```

`status` 返回当前用户私有的 Unix socket。可直接向该 socket 的 `/rpc` 发送 HTTP POST JSON 请求，`/events` 是 SSE 状态/GUI 事件流，`/health` 是健康检查。错误使用 JSON RPC 数字错误码，应用错误代码在 `error.data.code`。服务不监听 TCP 或公网端口，socket 权限为 `0600`。

源码构建还提供 `dist-cli/client.cjs` 中的 `BackendClient` / `connect`，具有 `call(method, params)`、`request(method, params)` 和 `subscribe(callback)`。常规调用自动启动服务；`--no-start` 可禁用自动启动。`service stop` 停止服务，后续数据操作可按需重新启动。

升级应用后，新客户端会自动切换已经闲置的旧后台服务。如果旧 GUI 仍在运行，会返回 `RESTART_REQUIRED`，以免旧界面继续操作新内核。`status` 和 `service stop` 始终可以检查、停止现有服务；停止已经关闭的服务不会重新启动它。


账户面板使用同一原生控制 API，例如 `agent control PAGE_ID --method account/read --params '{"refreshToken":false}'`。Codex 支持 `account/login/start`（type 为 chatgpt、chatgptDeviceCode 或 apiKey）、`account/login/cancel` 和 `account/logout`。账户凭据在 Workspace 内共用；切换或退出会停止其他连接的执行并暂停其队列，防止继续使用缓存凭据。退出后重新连接不会重新导入全局账户。Claude 的账户与额度分别使用 `accountInfo` 和官方 SDK 的 usage 控制。


Claude 文件检查点可用 `agent rewind PAGE_ID MESSAGE_ID` 预览，确认目标后加 `--apply` 恢复。MESSAGE_ID 从 `agent history` 的 user 消息读取，需要有 engineId；支持 `--conversation-id` 指定会话。`agent command PAGE_ID --text /rewind` 对应 UI 检查点列表。恢复前须停止本 Workspace 的所有前台和后台执行；Plan 仅允许预览。文件恢复后同步文件记录，页面数据库修改通过操作历史单独撤销。


`agent diff PAGE_ID [--conversation-id ID] [--query TEXT]` 返回文件审阅投影：summaries 是 Codex 每回合最后一次统一差异，operations 是逐次原生文件操作。patch 的 lines 含 type、before/after 行号和文本；Write 不含原文件全文时只返回 after，Edit 返回 before/after 片段。`/diff` 调用同一接口。此结果为历史操作记录，恢复文件后也会保留历史，不应作为磁盘当前净差异。


Codex 审查使用 `agent review PAGE_ID --target '{"type":"uncommittedChanges"}' --delivery detached`。其他目标为 `{"type":"baseBranch","branch":"main"}`、`{"type":"commit","sha":"…"}`、`{"type":"custom","instructions":"…"}`。默认 delivery=inline；detached 会新建独立审查会话，返回 conversationId 与原生 reviewThreadId，后续 send/control 可指定该 conversationId。`/review` 打开同一目标选择界面，`/review 自定义要求` 启动自定义审查。高级 review/start 调用亦复用此入口。

`file resolve PAGE_ID --path 'src/example.py:12'` 返回 fileId、物理路径和行号，供文件预览跳转使用；相对路径按 Workspace 根解析，支持绝对路径、file://、asset:// 和 #L12。该命令不会把文件 URL 按 CLI 当前目录展开，也不会解析到另一个 Workspace。

取得 fileId 后，`ui command space --params '{"pageId":"PAGE_ID","fileId":"FILE_ID","line":12}'` 可在 UI 中打开同一文件并定位行号。本批后台验收没有执行该显示窗口的命令。


MCP 管理界面保存到 `agent.configure` 的原生配置：Codex 使用 `options.config.mcp_servers`，Claude 使用 `options.sdk.mcpServers`。`/mcp` 查询当前会话的工具、资源和连接状态；Codex 的启动错误会合并到对应服务器。Claude 可通过 `agent.control` 的 `toggleMcpServer` / `reconnectMcpServer` 控制，Codex 可设置服务器 enabled 或调用 `config/mcpServer/reload`（params=null）。配置编辑支持 replace+before 合并，运行中的配置在当前执行完成后应用。


MCP elicitation 通过 `agent.respond PAGE_ID REQUEST_ID --result '{"action":"accept","content":{...}}'` 回答，拒绝或取消分别使用 action=decline/cancel。UI 按原生 schema 提供表单，数值与布尔值保留类型；复杂 schema 使用 JSON 输入。URL 验证链接仅由用户主动打开。是否发出请求仍受原生审批策略影响，例如本次 Codex never 配置直接拒绝了表单。


Codex MCP OAuth 使用 `agent control PAGE_ID --method mcpServer/oauth/login --params '{"name":"SERVER","timeoutSecs":180}'`，返回 authorizationUrl。授权完成后适配器会自动重载此 Workspace 的 MCP 连接，后续模型执行等待重载完成。凭据固定保存在 Workspace 的私有 CODEX_HOME 中。`agent.stop` 可终止当前会话及待处理授权监听；它不是撤销已经签发的授权。


`agent capabilities` 的模型目录及 `/mcp` 的服务目录会消费原生 nextCursor，返回完整列表；`agent control --method model/list` 和 `mcpServerStatus/list` 仍保留原生 limit/cursor 接口，供调用者逐页读取。


`agent revert PAGE_ID TURN_ID [--file PATH]` 预览 Codex 回合文件差异的撤销，加 `--apply` 执行。TURN_ID 与 PATH 来自 `agent diff`。没有文件参数时检查整个回合；冲突时不强制覆盖，可选择其他文件单独撤销。操作在 Workspace 沙箱中进行，成功后同步文件记录，不回退会话或页面历史。Plan 仅允许预览，存在运行或待回复任务时拒绝执行。

`history operations` 的 reversible=false 表示不能通过页面操作历史撤销，例如永久删除和旧的文件元数据同步记录；显式 history.undo 对这些记录也会拒绝，避免把元数据还原误当成文件内容恢复。
