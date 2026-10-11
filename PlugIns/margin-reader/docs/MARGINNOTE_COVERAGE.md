# MarginNote 4 全范围功能审计

本清单保持完整目标。77 篇官方详细文档均已获取；候选实现和现有测试只是线索，未逐子项验收不能标为完成。旧版本功能汇总不再作为整体完成证明。

范围：排除 OCR 与联网服务；本地导出、备份恢复、本地音视频、外置卷、同机多窗口和第三方本地互操作继续保留。复杂页面的子项记录在 [机器可读清单](marginnote-requirements.json) 的 officialSections。

状态：**待验收**表示已有实现线索但缺少逐项证明；**有差距**表示已看到不等价或缺失；**混合**条目只排除其联网/OCR部分。尚无条目被宣告整体完成。

| ID | 官方范围 | 验收要求 | 状态 | 实现线索 |
|---|---|---|---|---|
| MN4-01 | [摘录与原文交互](https://manual.marginnote.com.cn/mn4/en/excerpts-capture-key-points-document/) | 文字/矩形/套索/留白摘录、修订、强调、追加与回链逐项对照 | 部分验证 | [lib/study-capture.cjs](../lib/study-capture.cjs)、[lib/excerpt-editor.cjs](../lib/excerpt-editor.cjs)、[ui/study-excerpts.js](../ui/study-excerpts.js) |
| MN4-02 | [文本框/图片/拍照](https://manual.marginnote.com.cn/mn4/en/creating-text-boxes-images-photos/) | 学习集 PDF 原页点击/右键放置、文本拖入、折叠坐标和取消已测；独立文档全手势与实体相机未全验收 | 局部通过 | [document-textbox.js](../ui/document-textbox.js)、[增量验收](INTERACTION_COMPLETION.md) |
| MN4-03 | [空白笔记本](https://manual.marginnote.com.cn/mn4/en/create-blank-notebook/) | 纸张、页面操作、手写及笔记转卡片 | 待验收 | [lib/pdf-edit.cjs](../lib/pdf-edit.cjs)、[ui/reader-tools.js](../ui/reader-tools.js) |
| MN4-04 | [留白基础](https://manual.marginnote.com.cn/mn4/en/extend-note-basic-operations-freely-open/) | 任意原文位置插入、三种显示模式、文本/图片/手写与撤销 | 待验收 | [lib/document-layout.cjs](../lib/document-layout.cjs)、[ui/pdf-layout-view.js](../ui/pdf-layout-view.js) |
| MN4-05 | [手写](https://manual.marginnote.com.cn/mn4/en/handwriting-write-freely-documents-mind-maps/) | 画笔、压力、隐退笔、图形辅助、涂抹删除、套索及模板；OCR 排除 | 部分验证 | [lib/study-ink-tools.cjs](../lib/study-ink-tools.cjs)、[ui/ink-tools.js](../ui/ink-tools.js) |
| MN4-06 | [文档笔记本与图层](https://manual.marginnote.com.cn/mn4/en/layers-document-notebooks-handwriting-layers/) | 笔记本隔离、叠加、绑定对象、重命名/合并/删除与恢复 | 部分验证 | [lib/study-notebooks.cjs](../lib/study-notebooks.cjs)、[lib/study-advanced.cjs](../lib/study-advanced.cjs) |
| MN4-07 | [翻译](https://manual.marginnote.com.cn/mn4/en/translating-saving-translations/) | 排除在线翻译；离线词典和译文保存路径仍需验收 | 待验收（混合） | [lib/local-reading.cjs](../lib/local-reading.cjs) |
| MN4-08 | [手形弹出菜单](https://manual.marginnote.com.cn/mn4/en/hand-tool-pop-up-menu-bar/) | 选区动作、固定/排序、自定义入口 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs)、[ui/study-tools.js](../ui/study-tools.js) |
| MN4-09 | [阅读设置](https://manual.marginnote.com.cn/mn4/en/document-reading-settings/) | 亮度、夜间、阅读模式、页面适配与跨重启恢复 | 待验收 | [ui/reader-appearance.js](../ui/reader-appearance.js)、[ui/pdf-reader.js](../ui/pdf-reader.js) |
| MN4-10 | [检索与 OCR](https://manual.marginnote.com.cn/mn4/en/search-full-text-ocr-search-locate/) | OCR 排除；已有文本层检索与结果定位仍在范围内 | 待验收（混合） | [lib/documents.cjs](../lib/documents.cjs)、[lib/library-search.cjs](../lib/library-search.cjs) |
| MN4-11 | [页面查找器](https://manual.marginnote.com.cn/mn4/en/search-view-document-table-contents-thumbnails/) | 目录/缩略图/书签/笔迹/卡片筛选与对应页跳转 | 待验收 | [lib/reader-state.cjs](../lib/reader-state.cjs)、[ui/page-layout.js](../ui/page-layout.js) |
| MN4-12 | [多文档对照](https://manual.marginnote.com.cn/mn4/en/comparison-bi-article-comparison-window/) | PDF 与本地音视频对照、独立位置、保存布局及重开 | 部分验证 | [lib/reader-state.cjs](../lib/reader-state.cjs)、[ui/reader-tools.js](../ui/reader-tools.js) |
| MN4-13 | [文档引用与反链](https://manual.marginnote.com.cn/mn4/en/comparison-cross-document-reference-backlink/) | 同文档/跨文档位置引用与双向返回 | 待验收 | [lib/study-links.cjs](../lib/study-links.cjs)、[lib/study-navigation.cjs](../lib/study-navigation.cjs) |
| MN4-14 | [留白分层应用](https://manual.marginnote.com.cn/mn4/en/extend-note-use-cases-tiered-management/) | 主要与次要笔记分层、可调位置、折叠切换 | 待验收 | [lib/document-layout.cjs](../lib/document-layout.cjs)、[ui/pdf-layout-view.js](../ui/pdf-layout-view.js) |
| MN4-15 | [附属笔记本](https://manual.marginnote.com.cn/mn4/en/comparison-attached-notebook/) | 随原文页数、位置绑定、笔迹和笔记反链 | 待验收 | [lib/reader-state.cjs](../lib/reader-state.cjs) |
| MN4-16 | [页面折叠](https://manual.marginnote.com.cn/mn4/en/page-folding/) | 按章节/局部/分割折叠、范围调整、临时预览、导出与不摘录隐藏内容 | 待验收 | [lib/document-layout.cjs](../lib/document-layout.cjs)、[ui/page-layout.js](../ui/page-layout.js) |
| MN4-17 | [虚拟页面重组](https://manual.marginnote.com.cn/mn4/en/page-reorganization/) | 引用而非复制；从目录/页/选区拖入或追加；按来源路径处理标注、留白和折叠 | 待验收 | [lib/virtual-document.cjs](../lib/virtual-document.cjs)、[lib/page-reference.cjs](../lib/page-reference.cjs) |
| MN4-18 | [页面增删与裁剪](https://manual.marginnote.com.cn/mn4/en/adding-deleting-pages-cropping-page/) | 旋转、批量裁剪、页边扩展、插页、删除及恢复 | 待验收 | [lib/pdf-edit.cjs](../lib/pdf-edit.cjs)、[lib/document-layout.cjs](../lib/document-layout.cjs) |
| MN4-19 | [目录生成](https://manual.marginnote.com.cn/mn4/en/manually-automatically-generating-document-table-contents/) | 手动及本地规则目录；目录转脑图；远程 AI 排除 | 待验收（混合） | [lib/outline-batch.cjs](../lib/outline-batch.cjs) |
| MN4-20 | [学习集](https://manual.marginnote.com.cn/mn4/en/creating-study-set-start-theme-based/) | 创建/组织/资料关联/切换模式，不重复原件 | 待验收 | [lib/study.cjs](../lib/study.cjs) |
| MN4-21 | [原文脑图联动](https://manual.marginnote.com.cn/mn4/en/mind-map-document-linked-view/) | 双向、两个单向、关闭；布局比例与联动定位 | 待验收 | [lib/study-navigation.cjs](../lib/study-navigation.cjs) |
| MN4-22 | [文档标签](https://manual.marginnote.com.cn/mn4/en/document-tab-management/) | 切换、重排、数量设置、关闭与恢复 | 待验收 | [lib/reader-state.cjs](../lib/reader-state.cjs)、[ui/comparison-tools.js](../ui/comparison-tools.js) |
| MN4-23 | [侧栏与全局搜索](https://manual.marginnote.com.cn/mn4/en/quick-sidebar-switching-global-search/) | AND/OR/NOT、按文件查找、快速侧栏、浮动子脑图 | 待验收 | [lib/library-search.cjs](../lib/library-search.cjs)、[ui/workspace-tools.js](../ui/workspace-tools.js) |
| MN4-24 | [卡片盒](https://manual.marginnote.com.cn/mn4/en/zettelkasten-styled-card-box-view/) | 跨脑图卡片库、分组/排序/过滤、批改与来源定位 | 待验收 | [lib/study-workspace.cjs](../lib/study-workspace.cjs) |
| MN4-25 | [复习视图](https://manual.marginnote.com.cn/mn4/en/review-view/) | 排序/过滤/全屏/FSRS 与保存会话 | 待验收 | [lib/study-learning.cjs](../lib/study-learning.cjs)、[ui/study-learning.js](../ui/study-learning.js) |
| MN4-26 | [研究浏览器](https://manual.marginnote.com.cn/mn4/en/research-browser-view/) | 在线研究排除；本地词典、选区保存和跳转不能一起排除 | 待验收（混合） | [ui/study-excerpts.js](../ui/study-excerpts.js) |
| MN4-27 | [学习集专属样式](https://manual.marginnote.com.cn/mn4/en/studyset-specific-styles-build-own-learning/) | 颜色/摘录/画笔/菜单独立配置与本地模板互换 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs) |
| MN4-28 | [沉浸模式](https://manual.marginnote.com.cn/mn4/en/immersive-mode/) | 学习时简化工具栏，保留摘录、回忆及键盘退出 | 待验收 | [ui/reader-appearance.js](../ui/reader-appearance.js) |
| MN4-29 | [手动建图](https://manual.marginnote.com.cn/mn4/en/manually-generate-mind-map-from-excerpts/) | 摘录入图、独立卡/分支、按目录组织 | 待验收 | [lib/study-organize.cjs](../lib/study-organize.cjs)、[lib/study-tree.cjs](../lib/study-tree.cjs) |
| MN4-30 | [摘录工具自动化](https://manual.marginnote.com.cn/mn4/en/excerpt-tools-their-automation/) | 强调/遮挡/标题/默认入图/追加及命名工具 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs)、[lib/excerpt-editor.cjs](../lib/excerpt-editor.cjs) |
| MN4-31 | [AI 自动脑图](https://manual.marginnote.com.cn/mn4/en/auto-generate-mind-maps-one-tap/) | 远程提供方与联网推理排除；本机模型配置/无网执行的官方支持范围待核对，不以规则整理冒充 AI。 | 待验收（混合） | lib/outline-batch.cjs |
| MN4-32 | [卡片编辑](https://manual.marginnote.com.cn/mn4/en/mind-map-card-creating-editing-cards/) | 标题/摘录/评论/媒体/手写与顺序，修改同步各视图 | 待验收 | [lib/study-content.cjs](../lib/study-content.cjs)、[ui/study-content.js](../ui/study-content.js) |
| MN4-33 | [移动合并拆分](https://manual.marginnote.com.cn/mn4/en/mind-map-cards-move-merge-regroup/) | 自由拖动、父子、拖动合并、真正合并内容与再拆分 | 待验收 | [lib/study-organize.cjs](../lib/study-organize.cjs)、[lib/excerpt-parts.cjs](../lib/excerpt-parts.cjs) |
| MN4-34 | [脑图侧工具栏](https://manual.marginnote.com.cn/mn4/en/mind-map-side-toolbar/) | 选择、组织、缩放、复制剪切粘贴、手写及快捷操作 | 待验收 | [ui/map-tools.js](../ui/map-tools.js) |
| MN4-35 | [跨分支摘要](https://manual.marginnote.com.cn/mn4/en/mind-map-summary-create-summary-nodes/) | 保持已有分支关系，摘要节点可再延伸或建立引用 | 待验收 | [lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-36 | [脑图聚焦](https://manual.marginnote.com.cn/mn4/en/mind-map-focus/) | 自动整理、聚焦范围切换、退出后还原 | 待验收 | [ui/map-tools.js](../ui/map-tools.js)、[lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-37 | [子脑图层级](https://manual.marginnote.com.cn/mn4/en/creating-managing-child-mind-map-hierarchy/) | 空白子图、收为子图、浮动编辑、重排改名、展开与恢复删除 | 待验收 | [lib/study-tree.cjs](../lib/study-tree.cjs)、[ui/map-tools.js](../ui/map-tools.js) |
| MN4-38 | [脑图手写图层](https://manual.marginnote.com.cn/mn4/en/mindmap-handwriting-layers-manage-annotations-layers/) | 独立图层、叠加与对象绑定、移动和删除恢复 | 待验收 | [lib/study-ink-tools.cjs](../lib/study-ink-tools.cjs) |
| MN4-39 | [Markdown 与公式](https://manual.marginnote.com.cn/mn4/en/markdown-formulas/) | 公式、格式、链接、复制与编辑呈现的一致性 | 待验收 | [lib/card-text.cjs](../lib/card-text.cjs) |
| MN4-40 | [卡片弹出菜单](https://manual.marginnote.com.cn/mn4/en/card-pop-up-menu-bar-customization/) | 可定制固定动作和其 CLI 对应能力 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs) |
| MN4-41 | [大纲显示排序](https://manual.marginnote.com.cn/mn4/en/outline-display-sorting/) | 层级显示、排序键、同级重排与批量操作 | 待验收 | [lib/study-organize.cjs](../lib/study-organize.cjs)、[ui/study-boards.js](../ui/study-boards.js) |
| MN4-42 | [大纲编辑缩进](https://manual.marginnote.com.cn/mn4/en/outline-editing-indentation/) | 快捷插入、父/兄弟/子节点、缩进/退级/整支移动 | 待验收 | [lib/study-tree.cjs](../lib/study-tree.cjs) |
| MN4-43 | [大纲搜索过滤](https://manual.marginnote.com.cn/mn4/en/outline-filtering-search/) | 文字/标签/颜色过滤与保留定位上下文 | 待验收 | [lib/search-query.cjs](../lib/search-query.cjs)、[lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-44 | [十种分支样式](https://manual.marginnote.com.cn/mn4/en/10-branch-styles-sub-mind-map/) | 逐个核对十种布局与子脑图收缩；存在枚举不足以验收 | 待验收 | [ui/branch-layout.mjs](../ui/branch-layout.mjs) |
| MN4-45 | [卡片字体](https://manual.marginnote.com.cn/mn4/en/custom-card-fonts/) | 本地字体、逐卡及学习集设置、缩放/字重与重开 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs)、[lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-46 | [脑图背景卡片尺寸](https://manual.marginnote.com.cn/mn4/en/mind-map-handwriting-background-card-size/) | 背景、纸张、尺寸策略、自适应内容与布局稳定 | 待验收 | [ui/map-tools.js](../ui/map-tools.js)、[lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-47 | [手写随动绑定](https://manual.marginnote.com.cn/mn4/en/mindmap-handwriting-follow-along-binding/) | 绑定/解绑、节点移动与形变、裁切画面转卡片 | 部分验证 | [lib/study-ink-tools.cjs](../lib/study-ink-tools.cjs) |
| MN4-48 | [自定义摘录颜色](https://manual.marginnote.com.cn/mn4/en/customize-card-excerpt-colors/) | 调色板、命名、已有标注和图层颜色同步 | 待验收 | [lib/study-tools.cjs](../lib/study-tools.cjs) |
| MN4-49 | [分组面板过滤](https://manual.marginnote.com.cn/mn4/en/card-grouping-board-precisely-filter-cards/) | 组合条件、分组层级、完整分页与批量编辑 | 待验收 | [lib/study-workspace.cjs](../lib/study-workspace.cjs) |
| MN4-50 | [关键词标题字典](https://manual.marginnote.com.cn/mn4/en/card-links-keyword-title-links-build/) | 正文/卡片匹配、分号别名、子脑图范围、来源着色、候选与原位编辑已测；标题分组和扩展检索已补；全套浮窗组合继续验收 | 局部通过 | [study-dictionary.cjs](../lib/study-dictionary.cjs)、[增量验收](LOCAL_HARDENING.md) |
| MN4-51 | [分组面板生成脑图](https://manual.marginnote.com.cn/mn4/en/card-grouping-board-auto-generate-mind/) | 按分组结构建图、重复运行不丢失笔记及来源 | 待验收 | [lib/study-organize.cjs](../lib/study-organize.cjs) |
| MN4-52 | [单双向卡片链接](https://manual.marginnote.com.cn/mn4/en/card-links-one-way-two-way/) | 跨分支/跨集方向性、反向查找与不可用目标 | 待验收 | [lib/study-links.cjs](../lib/study-links.cjs) |
| MN4-53 | [稳定卡片 ID/URL](https://manual.marginnote.com.cn/mn4/en/card-linking-unique-card-id-url/) | 跨脑图/跨集移动后旧链接仍可定位，不泄露凭据 | 待验收 | [lib/card-location.cjs](../lib/card-location.cjs)、[lib/study-links.cjs](../lib/study-links.cjs) |
| MN4-54 | [手绘曲线关联](https://manual.marginnote.com.cn/mn4/en/card-links-hand-drawn-curve-links/) | 创建/调整路径、文字说明、移动目标后关联可用 | 待验收 | [lib/study-links.cjs](../lib/study-links.cjs)、[ui/map-tools.js](../ui/map-tools.js) |
| MN4-55 | [行内链接](https://manual.marginnote.com.cn/mn4/en/card-link-inline-links/) | 正文链接和外部 URI，安全打开与返回 | 待验收 | [lib/study-links.cjs](../lib/study-links.cjs) |
| MN4-56 | [文档主动回忆](https://manual.marginnote.com.cn/mn4/en/document-review-occlusion-cloze-recall-mode/) | 整段/强调/高亮/区域遮挡，点击显示与重新遮挡 | 待验收 | [lib/study-learning.cjs](../lib/study-learning.cjs)、[ui/study-excerpts.js](../ui/study-excerpts.js) |
| MN4-57 | [脑图主动回忆](https://manual.marginnote.com.cn/mn4/en/mind-map-review-active-recall-self/) | 提示方式、逐级展开、复位与不污染 FSRS | 待验收 | [lib/study-learning.cjs](../lib/study-learning.cjs) |
| MN4-58 | [复习脑图上下文](https://manual.marginnote.com.cn/mn4/en/mind-map-review-mind-map-context/) | 复习与原图之间定位并保留题目进度 | 待验收 | [lib/study-navigation.cjs](../lib/study-navigation.cjs) |
| MN4-59 | [牌组基本模型](https://manual.marginnote.com.cn/mn4/en/making-flashcards-understanding-flashcards-review-card/) | 一张内容卡对应题目、牌组独立组织与历史保留 | 待验收 | [lib/study-review.cjs](../lib/study-review.cjs)、[lib/study-learning.cjs](../lib/study-learning.cjs) |
| MN4-60 | [加入复习牌组](https://manual.marginnote.com.cn/mn4/en/making-flashcards-adding-cards-review-card/) | 单张/批量/分支添加、移出和筛选 | 待验收 | [lib/study-learning.cjs](../lib/study-learning.cjs) |
| MN4-61 | [FSRS 调度](https://manual.marginnote.com.cn/mn4/en/flashcard-review-scientific-review-fsrs-anti/) | 到期、自评、重复评分、撤销、优化及真实时区日差 | 待验收 | [lib/study-review.cjs](../lib/study-review.cjs)、[lib/study-optimize.cjs](../lib/study-optimize.cjs) |
| MN4-62 | [复习原文上下文](https://manual.marginnote.com.cn/mn4/en/flashcard-review-tracing-source-context/) | 回到出处后能返回正在复习的问题和翻面状态 | 待验收 | [lib/study-learning.cjs](../lib/study-learning.cjs)、[lib/study-navigation.cjs](../lib/study-navigation.cjs) |
| MN4-63 | [Anki 与模板](https://manual.marginnote.com.cn/mn4/en/flashcard-review-export-anki-template-configuration/) | 本地 APKG、媒体、挖空分组、字段与模板配置 | 待验收 | [lib/export-anki.cjs](../lib/export-anki.cjs) |
| MN4-64 | [复习正反面](https://manual.marginnote.com.cn/mn4/en/making-flashcards-setting-front-back-flashcard/) | 完整背面、分面批注、按组揭示、背面同步；独立强调和高亮出题已补，复合摘录与图片编辑映射已验证，自动更新已接入 Core 事务，旧 PDF 映射已支持像素核验修复 | 部分验证 | [lib/study-review.cjs](../lib/study-review.cjs)、[lib/study-media.cjs](../lib/study-media.cjs) |
| MN4-65 | [AI API 配置](https://manual.marginnote.com.cn/mn4/en/custom-ai-api-configuration/) | 远程提供方与联网推理排除；本机模型配置/无网执行的官方支持范围待核对，不以规则整理冒充 AI。 | 待验收（混合） | — |
| MN4-66 | [文档导入管理](https://manual.marginnote.com.cn/mn4/en/importing-documents-document-management/) | PDF/EPUB/MOV/MP3/MP4/M4V/M4A、分类标签、回收站、原件保留；在线下载排除 | 部分验证 | [lib/parsers.cjs](../lib/parsers.cjs)、[lib/av-document.cjs](../lib/av-document.cjs) |
| MN4-67 | [MarginNote 3 迁移](https://manual.marginnote.com.cn/mn4/en/migrate-notes-from-marginnote-3/) | 原生 .marginpkg 的真实导入；自有 .mrpkg 不能作为兼容证明 | 有差距 | [lib/study-package.cjs](../lib/study-package.cjs) |
| MN4-68 | [USB 本地文库](https://manual.marginnote.com.cn/mn4/en/adding-usb-storage-document-library/) | 外置卷直接使用、断开报错、重连与用户授权范围 | 待验收 | [cli.cjs](../cli.cjs)、[ui/workspace-tools.js](../ui/workspace-tools.js) |
| MN4-69 | [多数据库](https://manual.marginnote.com.cn/mn4/en/note-database-creating-managing-databases/) | 独立本地数据库、命名切换、检索边界与隔离；云频率 ID 排除 | 待验收 | [lib/store.cjs](../lib/store.cjs)、[lib/study-workspace.cjs](../lib/study-workspace.cjs) |
| MN4-70 | [本地导出](https://manual.marginnote.com.cn/mn4/en/export-documents-mind-maps-study-sets/) | PDF/脑图/大纲/Word/Anki/学习集格式逐项验证，不能用 JSON 导出代替所有格式 | 待验收 | [lib/study-export.cjs](../lib/study-export.cjs)、[lib/export-docx.cjs](../lib/export-docx.cjs)、[lib/export-anki.cjs](../lib/export-anki.cjs) |
| MN4-71 | [加密分享](https://manual.marginnote.com.cn/mn4/en/note-database-encrypted-sharing/) | 服务器许可发行排除；本地加密包与权限字段需单独确定范围及互操作证据 | 待验收（混合） | [lib/study-package.cjs](../lib/study-package.cjs) |
| MN4-72 | [同步备份恢复](https://manual.marginnote.com.cn/mn4/en/data-sync-backup-restore/) | 云同步排除；完整备份、检查点续做、隔离进程结束恢复和1.125 GiB往返已测；真实断电/外置盘故障仍未验收 | 局部通过（混合） | [backup-jobs.cjs](../lib/backup-jobs.cjs)、[增量验收](INTERACTION_COMPLETION.md) |
| MN4-73 | [演示模式](https://manual.marginnote.com.cn/mn4/en/presentation-mode-applications/) | 官方是触点/笔输入可视化；现有卡片幻灯片不是同一能力。系统录屏无需冒充内置功能 | 部分验证 | [ui/study-learning.js](../ui/study-learning.js) |
| MN4-74 | [同机多窗口](https://manual.marginnote.com.cn/mn4/en/multi-window-linking-opening-multiple-mn4/) | 多个独立视图、数据同步、可选跨窗当前卡定位，需同时打开窗口验收 | 有差距 | [ui/transport.js](../ui/transport.js)、[lib/study-navigation.cjs](../lib/study-navigation.cjs) |
| MN4-75 | [跨设备窗口](https://manual.marginnote.com.cn/mn4/en/multi-window-linking-opening-multiple-mn4-2/) | 联网跨设备协同排除；同机扩展显示和窗口布置仍需与 MN4-74 合并验收，物理硬件未经测试不得宣称通过。 | 待验收（混合） | — |
| MN4-76 | [第三方反链](https://manual.marginnote.com.cn/mn4/en/third-party-app-integration-understanding-note/) | 稳定卡片与界面 URI、外部应用唤起实际宿主的端到端行为 | 有差距 | [lib/study-links.cjs](../lib/study-links.cjs) |
| MN4-77 | [Obsidian 集成](https://manual.marginnote.com.cn/mn4/en/third-party-app-integration-obsidian-mn4/) | 本地双向笔记/附件/反链互操作，不能仅用导出 Markdown 作为完成证明 | 有差距 | [lib/study-export.cjs](../lib/study-export.cjs) |

## 当前工作

- 正在补齐 MN4-12 / MN4-66 的本地音视频文档与时间摘录。该闭环完成也不会把视频画面手写、所有编解码器或整项文档管理自动标为完成。
- 下一步重点语义审计：MN4-64 正反面及分组揭示、MN4-73 触点演示、MN4-74 同机多窗口、MN4-67 原生迁移、MN4-76/77 外部反链与本地互操作。

2026-09-30 进度：本地音视频、演示触点、复习正反面与独立强调/高亮出题的窄范围证据写入机器清单；对应整项仍为 partial。全目标继续 active。

2026-09-30 图片标记进度：裁剪/旋转、替换、连续摘录追加/移除/重选、跨集复制和导入恢复已通过窄范围验收。自动生成持续更新已在后续实现，手写笔迹的图片绑定仍未完成。

2026-09-30 旧映射进度：具备原始选区的旧 PDF/复合摘录可核验原件和截图像素后补回映射；AES 密码仅用于本次请求。不一致、缺少来源或锁定的项目保留并返回原因。

2026-09-30 图片手写进度：图片内容区的笔迹已接入裁剪/旋转/尺寸投影、擦除、套索、解绑、复习和导出；实际像素与原生窗口已核对。手写批注画布高亮遮挡、引用图片绑定和复合图外层留白笔迹迁移仍未完成。

2026-09-30 官方手写细项复核：整笔连续擦除、自动回笔刷、折叠区和笔记本保护、嵌入笔记作用范围、稀疏直线套索已补。自动直线/完美图形及涂抹删除已在后续验收补齐；笔型和工具栏、聚焦绑定仍有明确缺口。文字随字体自动重排的设想不作为原版已有能力的证明，批注画布遮挡仍保留待验收。

2026-09-30 图形辅助进度：自动/始终直线及停笔常用图形已接入共享算法，由 Core 保存最终几何；预览、取消、多触点隔离和原始轨迹传递已验证。涂抹删除另见后续验收；笔型、工具栏/尺子交互及聚焦绑定仍未完成。

2026-09-30 涂抹删除进度：密集往返手势停笔半秒后由 Core 执行整笔删除，支持文档、整张脑图及单张卡片范围；折叠区、复习分面、所属笔记与笔迹图层锁定均受保护。抬笔不重复提交，冲突保留草稿供明确重试，原件保持不变。7 项专项 Core、6 个浏览器流程及完整验收通过；完整 Core 共 240 项，隐藏原生窗口共 10 个流程。整体仍 active，MN4-05 仍 partial；笔型、工具栏、交互尺子、聚焦绑定与完整视觉对照继续保留缺口。

2026-09-30 场景笔宽与消失模式进度：文档、画布、卡片/复习粗细分别保存；省略 width 的 CLI 绘制按场景读取默认值。旧数据只读兼容、旧共享笔刷/模板恢复和设置变更后的隔离已验证。连续多笔在停笔一秒后淡出，期间不写入工作区；按住停笔后可继续写，复习编辑器复用当前笔刷设置。5 项专项 Core、6 个浏览器流程及最新完整验收通过（245 项 Core、224 个员工命令、11 个隐藏原生流程）。原版笔型、工具栏/滑条、尺子、聚焦绑定及完整视觉体验仍未完成，整体 active、MN4-05 partial。

2026-09-30 浮动工具栏进度：三个只读基础笔刷、独立配置与克隆、归档恢复、3–12 支笔管理、颜色和场景粗细、浮动/停靠位置已接入同一 Core；弹窗冲突明确重试，拖动冲突不覆盖新状态。已修复基础笔刷在可移植包历史中的身份映射，并保证 CLI 导航不打断笔画或使草稿串入其它学习集。7 项专项 Core、7 个浏览器流程及完整验收通过（252 项 Core、225 个员工命令、12 个隐藏原生流程）。细分笔型、卡片边缘吸附与双圆盘拾色、交互尺子、聚焦绑定、完整复习画布及视觉/实体笔对照仍待完善；整体 active、MN4-05 partial。

2026-09-30 交互尺子进度：新增按场景保存位置/角度/长度/遮挡的公共接口，支持鼠标移动、旋转柄、方向键及浏览器两点触控旋转。自由手写靠近并沿有限尺边运行时才吸附；Core 与预览共用投影，折叠页分段保存并保留压力和一次撤销。5 项专项 Core、6 个浏览器流程及完整验收通过（257 项 Core、226 个员工命令、13 个隐藏原生流程）。真实笔/触摸设备、原版刻度视觉和跨页手写仍未验证；细分笔型、聚焦绑定等缺口继续保留，整体 active、MN4-05 partial。

## 2026-09-30 深度审计增量

[性能、界面、数据与互操作审计](DEEP_AUDIT.md) 记录了本轮具体修复、样本结果和未关闭缺口；[运行清单](deep-audit-results.json) 记录最终真实退出码。万张卡片、120 页标注、UTF-16 定位、字典尾部/分号别名、工具区响应式和真实员工绑定新增覆盖，不构成以上 77 项全部完成的证明。
