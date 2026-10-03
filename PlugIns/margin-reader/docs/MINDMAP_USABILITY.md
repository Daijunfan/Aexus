# Margin Reader 0.9.3：脑图交互与本地视图

更新日期：2026-10-03。本文记录本轮实际改动与验证边界，结合已有的 [脑图设计能力](MINDMAP_STUDIO.md)、[阅读与脑图工作区](READ_MAP_WORKSPACE.md) 和 [XMind 对照](XMIND_COVERAGE.md) 使用。

## 保存与关闭

`Ctrl/Cmd+S` 提交原位标题、脑图格式、主题详情中的备注，以及当前对话框的表单。以前这个快捷键只调用关闭前的检查，因此有草稿时反复提示未保存，却没有真正提交内容。

同一窗口同时编辑格式与备注时，保存会先完成格式，再提交备注。只有前一步确实成功，并且备注草稿涉及的字段仍与原先基线相同，才采用该次本窗口写入的新版本。来自其他窗口或员工的改动仍按原版本拒绝，保留草稿；没有自动重试覆盖。

格式与主题详情侧栏按最后主动打开的入口显示在前面，后台同步不抢走键盘焦点。关闭原生插件窗口继续等待已有请求并检查草稿；浏览器退出也检查格式、备注、笔迹与对话框草稿。未保存内容仍可通过各编辑器的取消、Escape 或明确放弃操作处理。

## 删除与节点身份

选中主题后点击工具栏的 `×`，或在画布按 Delete/Backspace，立即把选中的节点移入主题回收站。默认保留未选中的子主题并提升到最近仍存在的父主题。Shift 点击 `×` 或 Shift+Delete/Backspace 删除整支。

中心主题、摘录主题、独立笔记与媒体主题使用相同的删除流程。中心没有特别的不可删除身份。多选删除是一笔 Core 事务、一条撤销记录；同时选择祖先和后代不会重复删除。

原件、摘录图像和附件继续保留。撤销恢复整次编辑；从回收站恢复被删父主题时，也恢复仍处于提升位置的子主题关系，保留删除后用户主动移动的子主题位置。

## 原文拖入脑图

在文档与脑图并排时，选择 PDF 文字或框选图像。可以拖动已有选区，或拖动摘录面板中的“拖到脑图”入口：落在主题上创建子主题，落在空白处创建有世界坐标的自由摘录主题，落在区域空白处加入该区域。

创建、落点、原文链接、图片保存和父主题展开在同一次 `study.card.create` 中提交。拖到空白处显式覆盖自动归档的父主题预设；普通颜色保存仍使用原有预设。捕获 ID 继续支持安全重试，旧调用的指纹保持兼容。

独立主题继续通过双击空白、键盘或 `study.note.create` 创建；它的 `source` 是 null，不会被伪造为文档摘录。来源定位仍使用原来的文档 ID、版本、页码和选区。

## 区域、大纲与任务时间图

“更多”菜单中的“区域”把独立自由分支圈成一个可编辑范围。拖动标题栏整体移动分支，右下角调整边框，左上角加减号展开或折叠。格式面板提供自动尺寸、固定坐标与尺寸、标题显隐和层序；移除区域保留主题。双击区域空白可以新增独立主题。完整图像导出会展开区域内容，当前可见范围导出保留折叠状态。

“主题大纲”按原始层级显示同一批节点，支持标题和备注编辑、拖动改父主题、提升、顶层移动、新建子主题或同级，以及定位回画布。每页最多挂载 100 行，完整模型仍可分页访问。

“任务时间图”读取主题现有的日期、负责人、状态和进度。可拖动时间条平移日期、调整起止端点或完成进度，也可在侧栏输入。日期标签按实际比例疏排，主题名称与时间轴在滚动时保留上下文。CSV 供 Excel 读取；ICS 输出本地全天日历事件，截止日期采用日历要求的次日排他边界。

任务视图没有第二份任务库，也不创建 Agents Company 调度。当前没有实现甘特依赖自动联排、工作日历计算和资源分配；区域关系线仍使用主题端点，没有区域/外框作为独立关系端点。这些功能在对照清单中保留差距，不能宣称商业客户端全部细节已经复刻。

## 常用操作与提示

常用工具仍放在一行，其余通过“更多”菜单或工具搜索打开。新增入口复用原来的整理、跨主题回链、关键词关联、摘录设置和内容导出接口；图片和音频都能成为独立主题，音频在保存内容预览中播放。

悬停和键盘聚焦显示按钮说明，Escape、点击、滚动和失焦收起提示。一个委托监听器处理动态按钮，不给每个主题安装独立观察器。原有的复制、引用、剪切、单双向关系、手绘关系和层级工具全部保留在同一个工具选择器中。

## CLI 与员工操作

已有宿主入口不变：

```sh
agents plugin call margin-reader study.get --employee EMPLOYEE_ID --params '{"setId":"SET_ID"}' --json
agents plugin call margin-reader study.cards.remove --employee EMPLOYEE_ID --params '{"setId":"SET_ID","expectedRevision":1,"cardIds":["CARD_ID"],"mode":"promote"}' --json
agents plugin call margin-reader study.mindmap.tasks.plan --employee EMPLOYEE_ID --params '{"setId":"SET_ID","limit":100}' --json
agents plugin call margin-reader study.mindmap.tasks.export --employee EMPLOYEE_ID --params '{"setId":"SET_ID","expectedRevision":1,"format":"ics","path":"tasks.ics"}' --json
agents plugin call margin-reader study.mindmap.zone.move --employee EMPLOYEE_ID --params '{"setId":"SET_ID","expectedRevision":1,"decorationId":"ZONE_ID","dx":100,"dy":0}' --json
```

调用前从 `study.get` 读取真实 ID 与 revision，并用 schema 或 `help METHOD` 查精确参数。示例中的 `expectedRevision:1` 必须替换为实际版本。所有新命令保留 `agentAccess:workspace`，沿用当前员工身份和宿主授权。CSV/ICS 导出拒绝覆盖或越出工作区，CSV 文本按可见文字处理，避免标题被电子表格解释为公式。

新增命令为 `study.cards.remove`、`study.mindmap.tasks.plan/export`、`study.mindmap.zone.move`。原有单主题删除复用批量删除实现；`study.card.create`、`study.note.create` 和 `study.mindmap.decoration.set` 增加可选位置/区域参数。界面、独立 CLI 和正式员工启动器使用同一份 schema 与 Core。

## 官方资料与验证

本轮重新获取 [XMind 用户指南](https://xmind.com/user-guide) 的目录及 86 篇页面，并获取 MarginNote 4 脑图相关页面。原始研究索引与标题分项记录在 `artifacts/mindmap-usability-20261003/research/`，包含线上、账户及一般文档管理条目；下载页面数量不代表全部功能已经实现或验收。

关键操作依据：[XMind 主题编辑](https://xmind.com/user-guide/topic-editing-new)、[区域](https://xmind.com/user-guide/zone)、[大纲](https://xmind.com/user-guide/outliner-new)、[任务时间图](https://xmind.com/user-guide/gantt-chart)、[MarginNote 摘录建图](https://manual.marginnote.com.cn/mn4/en/manually-generate-mind-map-from-excerpts/)、[卡片编辑](https://manual.marginnote.com.cn/mn4/en/mind-map-card-creating-editing-cards/)。

专项入口：`npm run test:mindmap-usability`；原生窗口：`npm run test:mindmap-usability:native`。日志、截图与最终结果写入 `artifacts/mindmap-usability-20261003/`。最终通过项以固定构建的结果为准。所有验证使用隔离数据，模型调用为零；macOS 之外的平台、实体触控板/笔和商业客户端逐版本兼容仍需分别验收。
