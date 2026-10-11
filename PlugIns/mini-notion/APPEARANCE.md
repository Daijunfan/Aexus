# 页面颜色与外观接口 · 1.13.1

默认主题为 light，空白页面和新空间默认 color=white。颜色选择器提供 30 种预设色（另有默认文字色），完整展示为多行色板，包括浅红、正红 scarlet、珊瑚红 coral、酒红 crimson、玫红 rose 等，并保留 #RRGGBB 自定义。`schema` 使用与 UI 相同的颜色表。颜色选择器显示当前色名，强色背景上的勾选标记自动使用可读颜色。已有页面颜色不因默认值变化而被批量改写。

页面只维护 `color` 和 `textColor` 两个配色字段。页面正文、日历单日/跨日事件、当天明细、小时计划、看板和时间线共用页面颜色；视图不再另设卡片颜色。页面原有字体、封面和布局字段继续保留，不再用另一层纸张背景盖住页面颜色。

## API 契约

- `page.create`、`database.create`、`record.create`、`space.create`、`subitem.create` 必须传 `color`，缺失返回 `PAGE_COLOR_REQUIRED`。
- `template.create` 创建空模板时必须提供颜色；从页面保存模板、使用模板、复制页面、表单和重复任务继承来源颜色。内置模板均携带颜色，无来源的界面新建页使用显式默认白色。
- `database.embed` 创建新数据库时也必须提供颜色；引用已有数据库不要求。
- `page.update --color` 与 `--text-color` 更新同一字段。`page.get`、`page.list`、`view.render` 和综合日程投影返回颜色。
- `color` 支持 schema 中的 30 种预设色或 `#RRGGBB`。兼容输入 default，落盘为 white。
- `textColor` 默认为 default，按背景与浅/深色自动选择文字色；也支持预设色和 `#RRGGBB`。
- 不额外引入与颜色并行的“重要程度”状态。推荐红色表示关键事项、橙色表示重要事项、蓝色表示常规任务、绿色表示资料、灰色表示低优先事项；这是 Agent 的选色约定，不改变时间、提醒或完成状态。

```sh
mininotion page create --title 项目 --color blue
mininotion record create DATABASE_ID --title 关键截止 --color red --values '{"date":"2026-09-20"}'
mininotion page update PAGE_ID --color purple --text-color default
mininotion api record.create --data '{"databaseId":"DATABASE_ID","title":"重要事项","color":"orange","values":{}}'
mininotion ui command appearance --params '{"pageId":"PAGE_ID"}'
```

## 兼容与迁移

读取旧数据时，将 `appearance.backgroundColor` / `appearance.textColor` 移入 `color` / `textColor`，去除页面的 surface、accentColor 和重复颜色字段。旧的纸张面板不再遮盖正文。已选颜色保持原值；未指定颜色的旧页面统一补 white/default，不推断或改写历史重要性。

旧 `page.update --changes '{"appearance":{"backgroundColor":"pink"}}'` 和旧创建请求中的显式 appearance.backgroundColor 仍可使用，在 API 边界转换成唯一字段。已有色块、应用及 Agent 面板主题不受迁移影响。旧版 `view.appearance.cardColor` 不再覆盖页面颜色，界面入口已移除。

直接创建页面的旧客户端需要补充 `color`；缺失错误包含可用颜色及意义。模板、导入和复制沿用有颜色的内容，不要求用户重新选择。Agent 提示词、命令示例与可发现 schema 已同步。

## 本轮验收

采用手工构造的实际 CLI 命令、数据库回读和隐藏实例界面检查，不运行传统测试脚本。

- 无颜色的页面/记录创建被拒绝；非法 URL 颜色被拒绝。
- 旧纸张背景请求转换为顶层颜色，正文实际显示同色。
- 改色后标题、正文、预览、单日与跨周日历事件即时同步；浅色和深色当天明细已检查。
- 自定义深色背景与浅色文字正确显示；模板与复制继承颜色。
- 真实 Claude Agent 自动为“最高重要性”任务选择 red，创建后已回读确认。首次调用纠正了 CLI 参数位置，提示词已补充准确示例。
- 本地证据：`.local-data/page-color-acceptance/`。

## 验收记录 · 1.12.0

- CLI 写入、回读、非法字段拒绝、恢复默认与现有数据兼容。
- 应用、页面、视图和内容块的浅/深色、长文本、窄布局实际画面。
- Agent 面板的背景与消息风格，仅改变表现，不改变会话/队列行为。
- 预设与模板可查、可创建，所生成内容和外观可继续通过 CLI 修改。
- 在独立隐藏实例内检查，正式更新前保留备份，不前置窗口。

验收使用手工设计的真实数据命令、持久化回读和后台 macOS 界面截图，没有以自动化测试脚本替代视觉判断。证据保存在 `.local-data/appearance-acceptance/`，不混入用户工作空间。

| 案例 | 核对结果 |
| --- | --- |
| 松绿画布、纸张面板、紧凑封面、左对齐标题 | CLI 写入和冷启动回读一致；标题、正文与预览均显示正确 |
| 自定义 #18222d 深色画布 | 标题和正文自动使用浅色；绿色提示块保留可读文字 |
| 蓝色视图与粉色记录 | 看板、日历显示视图底色与单条记录覆盖配色；新建分段按钮使用一致颜色 |
| 9/18–9/22 跨周、9/29–10/2 跨月与单日事项 | 5 条记录的 `view.render` 日期、跨度及续接标记与画面一致；卡片保持统一高度，日期格等高 |
| 内容块配色 | 段落、提示、待办和目录独立着色，保存后属性不丢失；彩色块之间有固定间隔 |
| 模板目录与创建 | 14 个模板可通过 CLI 查询、分类和搜索；论文精读、日记、创意提案、项目数据库实际创建；论文表格可编辑，居中模板图标与标题一致对齐 |
| 恢复默认与非法颜色 | 页面、视图、应用 `appearance:null` 回读正确；URL 颜色及未知外观字段拒绝；关联视图的嵌套 viewState 同样拒绝非法颜色 |
| 真实 Claude 会话 | 实际完成一轮中文回复；浅/深色、紧凑密度、气泡/简洁对话切换前后状态快照完全一致，包括 sessionId、消息数、用量和队列 |

结构容器沿用现有布局，其内部内容块分别着色。此轮不改 Agent 引擎、队列、文件边界、数据库关系和提醒算法。视觉验收覆盖代表性的页面、模板和视图，不声称已经穷举所有颜色组合。
